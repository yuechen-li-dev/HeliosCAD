import { useEffect, useMemo, useRef, useState } from 'react';
import type { Diagnostic, LanguageEditOperation, LanguageOutline, ModelSession, SelectionDescription } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { uniqueName } from '../graph/graphAuthoring';
import { checkValues, emitDeclarations, labelActions, labelOperations, pmiRecords, recognizeNames, type LabelAction, type LabelDatum, type LabelValues } from './actions';
import { allFaces, findFace } from './geometry';
import { recognizedHoles } from './holes';
import { GRIDS_MM, HOLE_FITS, defaultGrid, fitAllowances, formatMm, roundTo, type HoleFit } from './fits';

interface Props {
  picks: readonly SelectionDescription[];
  model: ModelSession | null;
  outline: LanguageOutline | null;
  runtime: CadRuntime;
  source: string;
  sourceName: string;
  sourceRevision: number;
  documents: Readonly<Record<string, string>>;
  root: string;
  /** Why nothing can be written now (a build is running, the model is stale), or null. */
  disabled: string | null;
  onPreview(model: ModelSession | null): void;
  onApply(operations: readonly LanguageEditOperation[], label: string): Promise<string | null>;
  onSelectTargets(selectors: readonly string[]): void;
}

const GROUPS: readonly [string, readonly string[]][] = [
  ['Datums', ['Datum']], ['Sizes', ['HoleDiameter', 'Distance', 'Dimension', 'Location']],
  ['Geometric tolerances', ['Flatness', 'Straightness', 'Roundness', 'Cylindricity', 'Parallelism', 'Perpendicularity', 'Angularity', 'Position', 'CircularRunout', 'TotalRunout', 'LineProfile', 'SurfaceProfile']],
  ['Notes', ['Note']],
];
const summary = (fields: Readonly<Record<string, string>>) =>
  [fields.value && `${fields.value}`, fields.tolerance && `${fields.tolerance}`, fields.datumRefs && `| ${fields.datumRefs}`, fields.text].filter(Boolean).join(' ');

/** Label: the `Pmi` block as a list of records, and the records the current selection can take. */
export function LabelPanel(props: Props) {
  const { picks, model, outline } = props;
  const records = useMemo(() => pmiRecords(outline), [outline]);
  const faces = useMemo(() => picks.map(p => model && p.selector && p.topologyKind !== 'Edge' ? findFace(model.mesh, p.selector, p.occurrenceId) : null), [picks, model]);
  const datums = useMemo<LabelDatum[]>(() => records.filter(r => r.kind === 'Datum' && r.target).map(r => ({
    name: r.name, selector: r.target!, nodeId: r.nodeId, face: model ? findFace(model.mesh, r.target!) : null })), [records, model]);
  const holes = useMemo(() => recognizedHoles(outline), [outline]);
  const cylinders = useMemo(() => model ? allFaces(model.mesh).filter(f => f.surfaceKind === 'Cylinder') : [], [model]);
  const { actions, notice } = useMemo(() => labelActions(picks, faces, datums, outline, holes, cylinders), [picks, faces, datums, outline, holes, cylinders]);
  const firstEnabled = actions.find(a => !a.disabled)?.id ?? actions[0]?.id ?? null;
  const [chosen, setChosen] = useState<string | null>(firstEnabled);
  const key = picks.map(p => `${p.occurrenceId}/${p.faceId}`).join('|');
  useEffect(() => setChosen(firstEnabled), [key, firstEnabled]);
  // A choice that became unavailable (the record was just written) falls back to the first one that is.
  const action = actions.find(a => a.id === chosen && !a.disabled) ?? actions.find(a => a.id === firstEnabled) ?? null;
  return <section className="label-panel" aria-label="Label">
    <div className="label-records" aria-label="PMI records">
      {holes.length > 0 && <div className="label-group"><h3>Holes</h3>
        {holes.map(h => <button key={h.nodeId} type="button" className="label-record" title={h.entities.join(', ')}
          onClick={() => props.onSelectTargets(h.entities.map(e => `${h.body}.face("${e}")`))}>
          <b>{h.name}</b><span>Recognized</span><small>{h.entities.length} face{h.entities.length > 1 ? 's' : ''}</small></button>)}</div>}
      {records.length === 0 && <p className="label-empty">No PMI yet. Select a face of the imported part to start: datums first, then sizes and tolerances.</p>}
      {GROUPS.map(([title, kinds]) => {
        const items = records.filter(r => kinds.includes(r.kind));
        return items.length ? <div key={title} className="label-group"><h3>{title}</h3>
          {items.map(r => { const targets = r.target ? [r.target] : r.fields.between?.match(/[A-Za-z_]\w*\.face\("[^"]*"\)/g) ?? [];
            return <button key={r.nodeId} type="button" className="label-record" title={targets.join(' → ') || undefined}
            onClick={() => targets.length && props.onSelectTargets(targets)}>
            <b>{r.name}</b><span>{r.kind}</span><small>{summary(r.fields)}</small></button>; })}</div> : null;
      })}
      {records.some(r => !GROUPS.some(([, kinds]) => kinds.includes(r.kind))) && <div className="label-group"><h3>Other</h3>
        {records.filter(r => !GROUPS.some(([, kinds]) => kinds.includes(r.kind))).map(r => <div key={r.nodeId} className="label-record"><b>{r.name}</b><span>{r.kind}</span></div>)}</div>}
    </div>
    <div className="label-context" aria-label="Label this selection">
      <h3>{picks.length === 0 ? 'Part' : picks.length === 1 ? 'This selection' : `These ${picks.length} faces`}</h3>
      {notice && <p className="label-notice" role="status">{notice}</p>}
      {actions.length > 0 && <div className="label-actions" role="radiogroup" aria-label="Record to add">
        {actions.map(a => <label key={a.id} className={a.disabled ? 'disabled' : ''} title={a.disabled ?? undefined}>
          <input type="radio" name="label-action" value={a.id} checked={action?.id === a.id} disabled={!!a.disabled} onChange={() => setChosen(a.id)} />
          <span>{a.title}</span>{a.disabled && <small>{a.disabled}</small>}</label>)}
      </div>}
      {action && !action.disabled && <LabelForm key={`${key}:${action.id}:${outline?.revision}`} action={action} {...props} />}
    </div>
  </section>;
}

function LabelForm(props: Props & { action: LabelAction }) {
  const { action, outline } = props;
  const measured = action.measured;
  const [grid, setGrid] = useState<number>(measured ? defaultGrid(measured) : 0.01);
  const [name, setName] = useState(() => action.record === 'Datum' ? action.nameStem : uniqueName(action.nameStem, outline));
  const [nominal, setNominal] = useState(measured ? formatMm(roundTo(measured, grid), grid) : '');
  const [plus, setPlus] = useState(''), [minus, setMinus] = useState('');
  const [fit, setFit] = useState<HoleFit | ''>('');
  const [tolerance, setTolerance] = useState('');
  const [refs, setRefs] = useState<string[]>([...action.defaultDatums]);
  const [mmc, setMmc] = useState(false);
  const [text, setText] = useState('');
  const [newDatumName, setNewDatumName] = useState(action.newDatum?.letter ?? '');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [state, setState] = useState<'idle' | 'previewing' | 'previewed' | 'applying'>('idle');
  const ticket = useRef(0);
  const shown = useRef<ModelSession | null>(null);
  const clearPreview = () => { if (shown.current) { props.onPreview(null); void shown.current.dispose(); shown.current = null; } };
  const num = (value: string) => value.trim() === '' ? undefined : Number(value);
  const values: LabelValues = { name: name.trim(), nominal: num(nominal), plus: num(plus), minus: num(minus), tolerance: num(tolerance), datumRefs: refs,
    maximumMaterial: mmc, text, newDatumName: action.newDatum ? newDatumName.trim() : undefined };
  const { errors, warnings } = checkValues(action, values, outline);
  const invalidate = () => { ticket.current++; setConfirming(false); setMessage(null); setDiagnostics([]); clearPreview(); setState('idle'); };
  useEffect(() => () => clearPreview(), []);
  const datumChoices = [...new Set([...action.allowedDatums, ...(action.newDatum ? [newDatumName.trim() || action.newDatum.letter] : [])])];
  const declarations = () => emitDeclarations(action, values);

  const preview = async () => {
    const mine = ++ticket.current; setState('previewing'); setMessage(null);
    try {
      const edit = await props.runtime.edit(props.source, labelOperations(outline, declarations(), action.recognize?.body), props.sourceName, String(props.sourceRevision));
      const documents = { ...props.documents, [props.sourceName]: edit.text };
      const result = await props.runtime.preview(props.root === props.sourceName ? edit.text : documents[props.root]!, props.root, props.sourceRevision, documents);
      if (mine !== ticket.current) { await result.model?.dispose(); return; }
      setDiagnostics(result.diagnostics);
      if (!result.model || result.diagnostics.some(d => d.severity === 'error')) { await result.model?.dispose(); setState('idle'); return; }
      clearPreview(); shown.current = result.model; props.onPreview(result.model); setState('previewed');
    } catch (error) { if (mine === ticket.current) { setMessage(error instanceof Error ? error.message : String(error)); setState('idle'); } }
  };
  const apply = async () => {
    if (warnings.length && !confirming) { setConfirming(true); return; }
    setState('applying');
    const failure = await props.onApply(labelOperations(outline, declarations(), action.recognize?.body), `Labeled ${action.record} ${values.name}${action.target ? ` on ${action.target}` : ''}`);
    clearPreview();
    if (failure) { setMessage(failure); setState('idle'); }
  };
  const field = (label: string, value: string, change: (value: string) => void, extra: Record<string, string> = {}) =>
    <label>{label}<input aria-label={label} value={value} inputMode="decimal" {...extra} onChange={e => { invalidate(); change(e.target.value); }} /></label>;
  const deviation = measured != null && num(nominal) !== undefined ? num(nominal)! - measured : null;

  return <form className="label-form" aria-label={`Add ${action.record}`} onSubmit={e => { e.preventDefault(); void apply(); }}>
    {field('Name', name, setName)}
    {action.record === 'Recognize' && <p className="label-hint">{action.recognize!.holes.length > 1
      ? `Names the holes ${recognizeNames(action, values).join(', ')}. Requirements then list them, and 4X callouts name them together.`
      : 'Names the hole so requirements apply to all of its faces.'} The geometry is not changed.</p>}
    {action.newDatum && <>
      <p className="label-hint">The second face becomes datum {newDatumName || action.newDatum.letter}: a tolerance can only reference a declared datum.</p>
      {field('New datum', newDatumName, value => { const before = newDatumName.trim() || action.newDatum!.letter; setNewDatumName(value); setRefs(r => r.map(x => x === before ? value.trim() : x)); })}
    </>}
    {action.tolerance === 'band' && <>
      {measured != null && <p className="label-measured">Measured <b>{measured.toFixed(4)}</b> → {nominal || '—'} {deviation != null && <span>({deviation >= 0 ? '+' : '−'}{Math.abs(deviation).toFixed(4)})</span>}</p>}
      <div className="label-row">
        {field('Nominal (mm)', nominal, setNominal)}
        {measured != null && <label>Round to<select aria-label="Round to" value={grid} onChange={e => { invalidate(); const g = Number(e.target.value); setGrid(g); setNominal(formatMm(roundTo(measured, g), g)); }}>
          {GRIDS_MM.map(g => <option key={g} value={g}>{g} mm</option>)}</select></label>}
      </div>
      {action.fits && <label>Fit<select aria-label="Fit" value={fit} onChange={e => { invalidate(); const f = e.target.value as HoleFit | ''; setFit(f);
        const band = f && num(nominal) ? fitAllowances(f, num(nominal)!) : null; if (band) { setPlus(String(band.plus)); setMinus(String(band.minus)); } }}>
        <option value="">Explicit allowances</option>{HOLE_FITS.map(f => <option key={f} value={f}>{f} (hole)</option>)}</select></label>}
      <div className="label-row">
        {field('Upper + (mm)', plus, value => { setFit(''); setPlus(value); })}
        {field('Lower − (mm)', minus, value => { setFit(''); setMinus(value); })}
      </div>
      <small>Tolerances are never inferred: enter both allowances or choose a fit.</small>
    </>}
    {action.tolerance === 'zone' && field(action.zone === 'Cylindrical' ? 'Tolerance Ø (mm)' : 'Tolerance (mm)', tolerance, setTolerance)}
    {action.datums === 'required' && <fieldset className="label-datums"><legend>Datum references</legend>
      {[0, 1, 2].map(i => i <= refs.length && <select key={i} aria-label={['Primary datum', 'Secondary datum', 'Tertiary datum'][i]} value={refs[i] ?? ''}
        onChange={e => { invalidate(); const next = [...refs]; if (e.target.value) next[i] = e.target.value; else next.splice(i); setRefs(next); }}>
        <option value="">{i === 0 ? 'Choose…' : 'None'}</option>
        {datumChoices.filter(d => d === refs[i] || !refs.includes(d)).map(d => <option key={d} value={d}>{d}</option>)}
      </select>)}
    </fieldset>}
    {action.modifiers && <label className="label-check"><input type="checkbox" checked={mmc} onChange={e => { invalidate(); setMmc(e.target.checked); }} /> Maximum material condition Ⓜ</label>}
    {action.record === 'Note' && <label>Text<textarea aria-label="Note text" value={text} onChange={e => { invalidate(); setText(e.target.value); }} /></label>}
    {errors.length === 0 && <pre className="label-source" aria-label="Source to write">{declarations().join('\n')}</pre>}
    {errors.map(e => <p key={e} className="label-error">{e}</p>)}
    {warnings.map(w => <p key={w} className="label-warning" role="alert">{w}</p>)}
    {diagnostics.filter(d => d.severity !== 'info').map((d, i) => <p key={i} className={d.severity === 'error' ? 'label-error' : 'label-warning'}>{d.code}: {d.message}</p>)}
    {message && <p className="label-error" role="alert">{message}</p>}
    {props.disabled && <p className="label-hint">{props.disabled}</p>}
    <div className="label-buttons">
      <button type="button" disabled={!!props.disabled || errors.length > 0 || state === 'previewing'} onClick={() => void preview()}>{state === 'previewing' ? 'Previewing…' : 'Preview'}</button>
      <button type="submit" className="primary" disabled={!!props.disabled || errors.length > 0 || state === 'applying'}>{confirming ? 'Apply anyway' : 'Apply'}</button>
    </div>
  </form>;
}

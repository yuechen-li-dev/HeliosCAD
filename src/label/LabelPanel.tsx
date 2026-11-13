import { useEffect, useMemo, useRef, useState } from 'react';
import type { Diagnostic, LanguageEditOperation, LanguageOutline, ModelSession, SelectionDescription } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { uniqueName } from '../graph/graphAuthoring';
import { CONTROL_MODIFIERS, checkValues, type LabelRecordEntry, emitDeclarations, labelActions, labelOperations, pmiRecords, recognizeNames, targetItems, type ControlModifier, type LabelAction, type LabelDatum, type LabelValues, type ZoneForm } from './actions';
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
  ['Datums', ['Datum']], ['Sizes', ['HoleDiameter', 'HoleCallout', 'Distance', 'Dimension', 'Location']],
  ['Geometric tolerances', ['Flatness', 'Straightness', 'Roundness', 'Cylindricity', 'Parallelism', 'Perpendicularity', 'Angularity', 'Position', 'CircularRunout', 'TotalRunout', 'LineProfile', 'SurfaceProfile']],
  ['Notes', ['Note']],
];
const ZONE_LABELS: Record<string, string> = { Cylindrical: 'Diameter zone Ø', Spherical: 'Spherical zone SØ', BetweenSurfaces: 'Between surfaces', '': 'Between planes' };
const MODIFIER_LABELS: Record<ControlModifier, string> = { FreeState: 'Free state Ⓕ', Statistical: 'Statistical ⟨ST⟩', CommonZone: 'Common zone CZ' };
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
  const [editing, setEditing] = useState<string | null>(null);
  return <section className="label-panel" aria-label="Label">
    <div className="label-records" aria-label="PMI records">
      {holes.length > 0 && <div className="label-group"><h3>Holes</h3>
        {holes.map(h => <button key={h.nodeId} type="button" className="label-record" title={h.entities.join(', ')}
          onClick={() => props.onSelectTargets(h.entities.map(e => `${h.body}.face("${e}")`))}>
          <b>{h.name}</b><span>Recognized</span><small>{h.entities.length} face{h.entities.length > 1 ? 's' : ''}</small></button>)}</div>}
      {records.length === 0 && <p className="label-empty">No PMI yet. Select a face of the part to start: datums first, then sizes and tolerances.</p>}
      {GROUPS.map(([title, kinds]) => {
        const items = records.filter(r => kinds.includes(r.kind));
        return items.length ? <div key={title} className="label-group"><h3>{title}</h3>
          {items.map(r => { const targets = targetItems(r.target ?? r.fields.between).map(t => /^[A-Za-z_]\w*$/.test(t) ? `face(${t}.Wall)` : t); // a native hole by its wall
            return <div key={r.nodeId}>
              <div className="label-record-row">
                <button type="button" className="label-record" title={targets.join(' → ') || undefined} onClick={() => targets.length && props.onSelectTargets(targets)}>
                  <b>{r.name}</b><span>{r.kind}</span><small>{summary(r.fields)}</small></button>
                <button type="button" className="label-edit" aria-expanded={editing === r.nodeId} aria-label={`Edit ${r.name}`}
                  onClick={() => setEditing(e => e === r.nodeId ? null : r.nodeId)}>{editing === r.nodeId ? 'Close' : 'Edit'}</button>
              </div>
              {editing === r.nodeId && <RecordEditor key={`${r.nodeId}:${outline?.revision}`} record={r} records={records} disabled={props.disabled}
                onApply={async (ops, label) => { const failure = await props.onApply(ops, label); if (!failure && ops.some(o => o.kind === 'removeDeclaration')) setEditing(null); return failure; }} />}
            </div>; })}</div> : null;
      })}
      {records.some(r => !GROUPS.some(([, kinds]) => kinds.includes(r.kind))) && <div className="label-group"><h3>Other</h3>
        {records.filter(r => !GROUPS.some(([, kinds]) => kinds.includes(r.kind))).map(r => <div key={r.nodeId} className="label-record"><b>{r.name}</b><span>{r.kind}</span></div>)}</div>}
    </div>
    <div className="label-context" aria-label="Label this selection">
      <h3>{picks.length === 0 ? 'Part' : picks.length === 1 ? 'This selection' : `These ${picks.length} faces`}</h3>
      {notice && <p className="label-notice" role="status">{notice}</p>}
      {actions.length > 0 && <div className="label-actions" role="radiogroup" aria-label="Record to add">
        {actions.filter(a => !a.disabled).map(a => <label key={a.id}>
          <input type="radio" name="label-action" value={a.id} checked={action?.id === a.id} onChange={() => setChosen(a.id)} />
          <span>{a.title}</span></label>)}
        {/* What this selection nearly allows, and what it would take. */}
        {actions.some(a => a.disabled) && <details className="label-unavailable" open={actions.every(a => a.disabled)}>
          <summary>Not available for this selection ({actions.filter(a => a.disabled).length})</summary>
          {actions.filter(a => a.disabled).map(a => <label key={a.id} className="disabled" title={a.disabled!}>
            <input type="radio" name="label-action" value={a.id} checked={false} disabled />
            <span>{a.title}</span><small>{a.disabled}</small></label>)}
        </details>}
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
  const [material, setMaterial] = useState<'MaximumMaterial' | 'LeastMaterial' | ''>('');
  const [extra, setExtra] = useState<ControlModifier[]>([]);
  const [zone, setZone] = useState<ZoneForm | ''>(action.zone ?? '');
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
    material: material || null, extraModifiers: extra, zone: action.zones ? zone || null : undefined, text, newDatumName: action.newDatum ? newDatumName.trim() : undefined };
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
    {action.tolerance === 'zone' && <div className="label-row">
      {field(zone === 'Cylindrical' ? 'Tolerance Ø (mm)' : zone === 'Spherical' ? 'Tolerance SØ (mm)' : 'Tolerance (mm)', tolerance, setTolerance)}
      {action.zones && <label>Zone<select aria-label="Tolerance zone" value={zone} onChange={e => { invalidate(); setZone(e.target.value as ZoneForm | ''); }}>
        {action.zones.map(z => <option key={z ?? ''} value={z ?? ''}>{ZONE_LABELS[z ?? '']}</option>)}</select></label>}
    </div>}
    {action.datums !== 'none' && <fieldset className="label-datums"><legend>Datum references{action.datums === 'optional' ? ' (optional)' : ''}</legend>
      {[0, 1, 2].map(i => i <= refs.length && <select key={i} aria-label={['Primary datum', 'Secondary datum', 'Tertiary datum'][i]} value={refs[i] ?? ''}
        onChange={e => { invalidate(); const next = [...refs]; if (e.target.value) next[i] = e.target.value; else next.splice(i); setRefs(next); }}>
        <option value="">{i === 0 && action.datums === 'required' ? 'Choose…' : 'None'}</option>
        {datumChoices.filter(d => d === refs[i] || !refs.includes(d)).map(d => <option key={d} value={d}>{d}</option>)}
      </select>)}
    </fieldset>}
    {action.modifiers && <label>Material condition<select aria-label="Material condition" value={material} onChange={e => { invalidate(); setMaterial(e.target.value as typeof material); }}>
      <option value="">Regardless of feature size</option><option value="MaximumMaterial">Maximum material Ⓜ</option><option value="LeastMaterial">Least material Ⓛ</option></select></label>}
    {action.tolerance === 'zone' && <fieldset className="label-modifiers"><legend>Modifiers</legend>
      {CONTROL_MODIFIERS.filter(m => m !== 'CommonZone' || action.quantity! > 1).map(m => <label key={m} className="label-check">
        <input type="checkbox" checked={extra.includes(m)} onChange={e => { invalidate(); setExtra(x => e.target.checked ? [...x, m] : x.filter(y => y !== m)); }} /> {MODIFIER_LABELS[m]}</label>)}
    </fieldset>}
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

/** The fields an existing record can change in place; its target stays (select the faces again to label others). */
const EDITABLE: readonly string[] = ['value', 'tolerance', 'dimension', 'datumRefs', 'zone', 'modifiers', 'text', 'basic'];

/** Edit one written record: rename it, change its values, or remove it. Each change is a source edit, rebuilt and checked. */
function RecordEditor({ record, records, disabled, onApply }: {
  record: LabelRecordEntry; records: readonly LabelRecordEntry[]; disabled: string | null;
  onApply(operations: readonly LanguageEditOperation[], label: string): Promise<string | null>;
}) {
  const shown = Object.keys(record.fields).filter(f => EDITABLE.includes(f) || f === 'datum');
  const [name, setName] = useState(record.name);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(shown.map(f => [f, record.fields[f] ?? ''])));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A datum other records reference cannot go while they do.
  const users = record.kind === 'Datum' ? records.filter(r => r.nodeId !== record.nodeId && new RegExp(`\\b${record.name}\\b`).test(r.fields.datumRefs ?? r.fields.datum ?? '')).map(r => r.name) : [];
  const operations: LanguageEditOperation[] = [
    ...shown.filter(f => values[f]!.trim() !== (record.fields[f] ?? '').trim()).map(f => values[f]!.trim()
      ? { kind: 'setField' as const, node: record.nodeId, field: f, value: values[f]!.trim() } : { kind: 'removeField' as const, node: record.nodeId, field: f }),
    ...(name.trim() && name.trim() !== record.name ? [{ kind: 'renameDeclaration' as const, node: record.nodeId, name: name.trim() }] : []),
  ];
  const run = async (ops: readonly LanguageEditOperation[], label: string) => {
    setBusy(true); setMessage(null);
    const failure = await onApply(ops, label);
    setBusy(false); if (failure) setMessage(failure);
  };
  return <form className="label-editor" aria-label={`Edit ${record.name}`} onSubmit={e => { e.preventDefault(); if (operations.length) void run(operations, `Edited ${record.kind} ${record.name}`); }}>
    <label>Name<input aria-label="Record name" value={name} onChange={e => setName(e.target.value)} /></label>
    {shown.map(f => <label key={f}>{f}<input aria-label={f} value={values[f]} onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))} /></label>)}
    {record.fields.target && <small className="label-hint">Target {record.fields.target}</small>}
    {record.fields.between && <small className="label-hint">Between {record.fields.between}</small>}
    {users.length > 0 && <p className="label-hint">{users.join(', ')} reference{users.length === 1 ? 's' : ''} datum {record.name}; remove {users.length === 1 ? 'it' : 'them'} first to delete it.</p>}
    {message && <p className="label-error" role="alert">{message}</p>}
    {disabled && <p className="label-hint">{disabled}</p>}
    <div className="label-buttons">
      <button type="button" className="danger" disabled={!!disabled || busy || users.length > 0}
        onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } void run([{ kind: 'removeDeclaration', node: record.nodeId }], `Removed ${record.kind} ${record.name}`); }}>
        {confirmDelete ? `Delete ${record.name}?` : 'Delete'}</button>
      <button type="submit" className="primary" disabled={!!disabled || busy || operations.length === 0}>Save</button>
    </div>
  </form>;
}

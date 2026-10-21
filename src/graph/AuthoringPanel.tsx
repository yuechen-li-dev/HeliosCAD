import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, LanguageEdit, LanguageEditOperation, LanguageOutline, ModelSession, OutlineNode, PaletteItem, SelectionDescription } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { FieldRow } from './NodeInspector';
import { parseQuantity, spliceField } from './fieldEdit';
import { PatternEditor } from './PatternEditor';
import { bodyParent, featureTarget, paletteOperation, uniqueName } from './graphAuthoring';
import { jointOperations, type AssemblyGraph, type AssemblyEnd } from './assemblyGraph';

export type AuthoringAction = { kind: 'base' | 'patternEditor' | 'pattern' | 'extrude' | 'pocket' | 'placement' | 'mate'; item?: never; baseId?: string }
  | { kind: 'feature'; item: PaletteItem };
export interface PendingAuthoring { action: AuthoringAction; node: string | null; revision: number; mate?: { kind: string; a: AssemblyEnd; b: AssemblyEnd; existing?: string } }

interface Props {
  pending: PendingAuthoring; source: string; sourceName: string; outline: LanguageOutline; palette: readonly PaletteItem[];
  runtime: CadRuntime; assembly: AssemblyGraph | null; jointKinds: readonly string[]; selection: SelectionDescription | null;
  documents: Readonly<Record<string, string>>; root: string; onCancel(): void; onSketch(): void;
  onPreview(model: ModelSession | null): void; onApply(edit: LanguageEdit, label: string): void;
  onInspect?(node: string): void;
}

const titles = { base: 'Choose base shape', feature: 'Place feature', pattern: 'Grid a seed hole', patternEditor: 'Edit Patterns', extrude: 'Extrude a profile', pocket: 'Create pocket', placement: 'Place component', mate: 'Add mate' };

/** A pending transaction. Only Preview compiles; only Apply changes the source.
 * The compiler owns every structural operation and geometry admission. */
export function AuthoringPanel(props: Props) {
  const { pending, outline, palette, source, sourceName, runtime, assembly } = props;
  const selected = outline.nodes.find(n => n.id === pending.node);
  const target = featureTarget(outline, pending.node);
  const bodies = outline.nodes.filter(n => ['Box', 'Cylinder', 'Extrude', 'Compose', 'Sphere', 'Ellipsoid', 'Polyhedron'].includes(n.kind)
    && !n.occurrence && outline.nodes.some(p => p.id === n.parentId && ['Model', 'Struct'].includes(p.kind)));
  const profiles = outline.nodes.filter(n => n.kind === 'Profile' && !n.occurrence);
  const seeds = outline.nodes.filter(n => n.kind === 'Hole' && outline.nodes.some(p => p.id === n.parentId && p.kind === 'Modify'));
  const bases = palette.filter(item => item.placement === 'model' && item.requiresEmptyModel);
  const [body, setBody] = useState('body' in target ? target.body.id : bodies[0]?.id ?? '');
  const [base, setBase] = useState((pending.action.kind === 'base' ? pending.action.baseId : undefined) ?? bases.find(b => b.id === selected?.kind.toLowerCase())?.id ?? bases[0]?.id ?? 'box');
  const [seed, setSeed] = useState(selected?.kind === 'Hole' ? selected.id : seeds[0]?.id ?? '');
  const [profile, setProfile] = useState(selected?.kind === 'Profile' ? selected.id : profiles[0]?.id ?? '');
  const selectedProfile = profiles.find(p => p.id === profile);
  const extrusion = outline.nodes.find(n => n.kind === 'Extrude' && n.parentId === selectedProfile?.parentId
    && n.fields.some(f => f.name.toLowerCase() === 'profile' && f.text === selectedProfile?.name));
  const endField = extrusion?.fields.find(f => f.name.toLowerCase() === 'to');
  const startField = extrusion?.fields.find(f => f.name.toLowerCase() === 'from');
  const [extrusionEnd, setExtrusionEnd] = useState(endField?.text ?? '8mm');
  useEffect(() => setExtrusionEnd(endField?.text ?? '8mm'), [profile, endField]);
  const [pocketShape, setPocketShape] = useState(selected?.kind === 'Profile' ? 'existing' : 'Circle2');
  const [name, setName] = useState(uniqueName(pending.action.kind === 'pattern' ? 'Copies' : pending.action.kind === 'pocket' ? 'Recess' : pending.action.kind === 'feature' ? pending.action.item.nameStem : 'Body', outline));
  const [numbers, setNumbers] = useState({ columns: '2', rows: '1', pitchX: '10', pitchY: '10', depth: '2', x: '0', y: '0', width: '20', length: '12', diameter: '10' });
  const [draft, setDraft] = useState(pending.action.kind === 'feature' ? pending.action.item.source : '');
  const [draftNode, setDraftNode] = useState<OutlineNode | null>(null);
  const parts = assembly?.parts.filter(p => p.kind !== 'ground') ?? [];
  const [part, setPart] = useState(parts.find(p => p.id === selected?.id)?.id ?? parts.find(p => !p.anchored)?.id ?? parts[0]?.id ?? '');
  const placementNode = outline.nodes.find(n => n.parentId === part && n.kind === 'Placement');
  const controls = placementNode?.placementControls;
  const driver = assembly?.joints.find(j => j.a?.part === part || j.b?.part === part);
  const placementReason = parts.find(p => p.id === part)?.anchored ? 'This component is anchored. Change the anchor to move it.'
    : driver ? `This component is positioned by mate ${driver.name}. Edit that relationship instead of adding another placement authority.` : controls?.readOnlyReason;
  const [translation, setTranslation] = useState(['0', '0', '0']);
  const [axis, setAxis] = useState<'X' | 'Y' | 'Z'>('Z');
  const [angle, setAngle] = useState('0');
  useEffect(() => {
    setTranslation(controls?.translationMm.map(String) ?? ['0', '0', '0']);
    setAxis((controls?.axis as 'X' | 'Y' | 'Z') ?? 'Z'); setAngle(String(controls?.angleDegrees ?? 0));
  }, [part, controls]);
  const ends = assembly?.parts.flatMap(p => p.ports.map(port => ({ part: p.id, port: port.key, label: `${p.name}.${port.key}` }))) ?? [];
  const [a, setA] = useState(pending.mate ? JSON.stringify(pending.mate.a) : '');
  const [b, setB] = useState(pending.mate ? JSON.stringify(pending.mate.b) : '');
  const [jointKind, setJointKind] = useState(pending.mate?.kind ?? 'Fixed');
  const [state, setState] = useState<'editing' | 'preparing' | 'previewed' | 'failed'>('editing');
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [error, setError] = useState('');
  const [patternOperations, setPatternOperations] = useState<readonly LanguageEditOperation[]>([]);
  const [prepared, setPrepared] = useState<LanguageEdit | null>(null);
  const generation = useRef(0), preview = useRef<ModelSession | null>(null);
  const show = useRef(props.onPreview); show.current = props.onPreview;
  const release = () => {
    const previous = preview.current; preview.current = null; show.current(null);
    // Host termination may already have released this handle during refresh/unmount.
    if (previous) void previous.dispose().catch(() => undefined);
  };
  const invalidate = () => { generation.current++; release(); setPrepared(null); setDiagnostics([]); setError(''); setState('editing'); };
  useEffect(() => { invalidate(); return () => { generation.current++; release(); }; }, []);
  useEffect(() => {
    if (!draft) return;
    let current = true;
    void runtime.outline(draft, 'pending.firmament', String(pending.revision)).then(view => { if (current) setDraftNode(view.nodes[0] ?? null); })
      .catch(reason => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [draft, runtime, pending.revision]);

  const numeric = (key: keyof typeof numbers) => {
    const value = Number(numbers[key]); if (!numbers[key].trim() || !Number.isFinite(value)) throw new Error('Enter finite numbers in every dimension.');
    if ((key === 'columns' || key === 'rows') && !Number.isInteger(value)) throw new Error('Rows and columns must be whole numbers.'); return value;
  };
  const operations = (): readonly LanguageEditOperation[] => {
    switch (pending.action.kind) {
      case 'base': {
        const item = bases.find(i => i.id === base); if (!item) throw new Error('Choose a base shape.');
        if (body) {
          const original = bodies.find(n => n.id === body);
          return [{ kind: 'replaceDeclaration', node: body, source: original?.kind.toLowerCase() === item.id
            ? source.slice(original.span.start, original.span.start + original.span.length) : item.source }];
        }
        return [{ kind: 'insertDeclaration', parent: bodyParent(outline, pending.node), source: item.source, name }];
      }
      case 'feature': {
        const operation = paletteOperation({ ...pending.action.item, source: draft }, outline, body || pending.node);
        if ('reason' in operation) throw new Error(operation.reason);
        return [{ ...operation, name } as LanguageEditOperation];
      }
      case 'patternEditor': { if (!patternOperations.length) throw new Error('Change a layout or recipe, or choose New Pattern.'); return patternOperations; }
      case 'pattern': return [{ kind: 'patternFeature', node: seed, name, grid: { columns: numeric('columns'), rows: numeric('rows'), pitchXmm: numeric('pitchX'), pitchYmm: numeric('pitchY') } }];
      case 'extrude': return [{ kind: 'extrudeProfile', node: profile, value: extrusionEnd, name }];
      case 'pocket': return [{ kind: 'pocketProfile', parent: body, name, value: `${numeric('depth')}mm`,
        ...(pocketShape === 'existing' ? { node: profile } : { declaration: { kind: pocketShape, fields: [
          { name: 'center', value: `[${numeric('x')}mm, ${numeric('y')}mm]` },
          pocketShape === 'Circle2' ? { name: 'diameter', value: `${numeric('diameter')}mm` } : { name: 'size', value: `[${numeric('width')}mm, ${numeric('length')}mm]` },
        ] } }) }];
      case 'placement': {
        if (placementReason) throw new Error(placementReason);
        const values = [...translation, angle]; if (values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Error('Use finite coordinates and angle.');
        return [{ kind: 'setPlacement', node: part, placement: { translationMm: translation.map(Number), axis, angleDegrees: Number(angle) } }];
      }
      case 'mate': {
        if (!assembly || !a || !b) throw new Error('Choose two published component frames.');
        const result = jointOperations(assembly, jointKind, JSON.parse(a), JSON.parse(b), outline, pending.mate?.existing);
        if ('reason' in result) throw new Error(result.reason); return result;
      }
    }
  };
  const runPreview = async () => {
    invalidate(); const ticket = ++generation.current; setState('preparing');
    try {
      const edit = await runtime.edit(source, operations(), sourceName, String(pending.revision));
      if (ticket !== generation.current) return;
      const documents = { ...props.documents, [sourceName]: edit.text };
      const result = await runtime.preview(props.root === sourceName ? edit.text : documents[props.root], props.root, pending.revision, documents);
      if (ticket !== generation.current) { if (result.model) await result.model.dispose(); return; }
      setDiagnostics(result.diagnostics);
      if (!result.model || result.diagnostics.some(d => d.severity === 'error')) {
        if (result.model) await result.model.dispose(); setState('failed'); return;
      }
      preview.current = result.model; show.current(result.model); setPrepared(edit); setState('previewed');
    } catch (reason) { if (ticket === generation.current) { setError(reason instanceof Error ? reason.message : String(reason)); setState('failed'); } }
  };
  const choose = (label: string, value: string, items: readonly { value: string; label: string }[], change: (value: string) => void) =>
    <label>{label}<select aria-label={label} value={value} disabled={state === 'preparing'} onChange={e => { invalidate(); change(e.target.value); }}>
      {(!value || !items.length) && <option value="">{items.length ? 'Choose…' : 'None available'}</option>}{items.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
    </select></label>;
  const dimension = (label: string, key: keyof typeof numbers, unit = 'mm') => <label>{label}{unit && ` (${unit})`}<input aria-label={label} type="number" step="any" value={numbers[key]} disabled={state === 'preparing'} onChange={e => { invalidate(); setNumbers(n => ({ ...n, [key]: e.target.value })); }} /></label>;
  const bodyChoice = choose('Body', body, bodies.map(n => ({ value: n.id, label: `${n.name} · ${n.kind}` })), setBody);
  const profileChoice = choose('Profile', profile, profiles.map(n => ({ value: n.id, label: n.name ?? n.kind })), setProfile);
  const isFeature = pending.action.kind === 'feature';
  const title = pending.action.kind === 'mate' && pending.mate?.existing ? 'Edit mate' : titles[pending.action.kind];

  return <aside className="authoring-panel" aria-label={title}>
    <header><strong>{title}</strong><button onClick={props.onCancel}>Cancel</button></header>
    <p>Preview checks the complete part. Apply commits one undoable source transaction.</p>
    {['feature', 'pattern', 'pocket'].includes(pending.action.kind) && <label>Name<input aria-label="Feature name" value={name} disabled={state === 'preparing'} onChange={e => { invalidate(); setName(e.target.value); }} /></label>}
    {pending.action.kind === 'base' && <>{bodyChoice}
      {choose('Base shape', base, bases.map(i => ({ value: i.id, label: i.label })), setBase)}
      <p>Existing features and references remain. Preview checks their compatibility with the replacement.</p>
      {bodies.find(n => n.id === body)?.kind.toLowerCase() !== base && <p>Changing kind replaces the base fields with catalog defaults. Original base fields: {bodies.find(n => n.id === body)?.fields.map(f => `${f.name}: ${f.text}`).join('; ') || 'none'}. Review Source change before Apply.</p>}
      <button onClick={props.onSketch}>New sketch-based part…</button></>}
    {isFeature && <>{bodyChoice}<p>Pick a support face in the viewport, or keep the authored support. Center coordinates are in that support's frame.</p>
      <button disabled={!props.selection?.sourceAddressable || state === 'preparing' || !!preview.current} onClick={() => {
        const field = draftNode?.fields.find(f => ['on', 'face'].includes(f.name.toLowerCase()));
        if (field && props.selection?.selector) { const result = spliceField(draft, field, props.selection.selector); if ('error' in result) setError(result.error); else { invalidate(); setDraft(result.source); } }
      }}>Use picked face{props.selection?.selector ? ` · ${props.selection.selector}` : ''}</button>
      {draftNode?.fields.map(field => <FieldRow key={field.name} field={field} description={null} focus={false} disabled={state === 'preparing'} status={null}
        onCommit={value => { const result = spliceField(draft, field, value); if ('error' in result) return result.error; invalidate(); setDraft(result.source); return null; }} />)}
    </>}
    {pending.action.kind === 'patternEditor' && <PatternEditor source={source} candidate={prepared?.text ?? null} sourceName={sourceName} revision={pending.revision} node={pending.node} outline={outline} runtime={runtime} disabled={state === 'preparing'} onChange={operations => { invalidate(); setPatternOperations(operations); }} />}
    {pending.action.kind === 'pattern' && <>
      {choose('Seed hole', seed, seeds.map(n => ({ value: n.id, label: n.name ?? n.kind })), setSeed)}
      {dimension('Columns', 'columns', '')}{dimension('Rows', 'rows', '')}{dimension('Column pitch', 'pitchX')}{dimension('Row pitch', 'pitchY')}
      <p>Counts include the original hole. Its identity stays; copies use stable row/column keys. Pitch is measured from the seed center.</p>
    </>}
    {pending.action.kind === 'extrude' && <>{profileChoice}
      <FieldRow field={{ name: 'to', text: extrusionEnd, shape: parseQuantity(extrusionEnd) ? 'quantity' : endField?.shape ?? 'reference', span: endField?.span ?? { start: 0, length: 0 }, valueSpan: endField?.valueSpan ?? { start: 0, length: 0 } }}
        label="Extrusion end" description="Distance along the profile normal, relative to its frame origin." focus={false} disabled={state === 'preparing'} status={null}
        onCommit={value => { invalidate(); setExtrusionEnd(value); return null; }} />
      <p>Start: {startField?.text ?? '0mm'}. Updates a matching extrusion's end and retains its start; creates a new body only when the container is empty. Parameter references stay references until explicitly edited.</p></>}
    {pending.action.kind === 'pocket' && <>{bodyChoice}
      {choose('Pocket outline', pocketShape, [{ value: 'Circle2', label: 'New circle' }, { value: 'Rect2', label: 'New rectangle' }, { value: 'existing', label: 'Existing Profile' }], setPocketShape)}
      {pocketShape === 'existing' ? profileChoice : <>{dimension('Center X', 'x')}{dimension('Center Y', 'y')}
        {pocketShape === 'Circle2' ? dimension('Diameter', 'diameter') : <>{dimension('Width', 'width')}{dimension('Length', 'length')}</>}</>}
      {dimension('Depth', 'depth')}<p>A finite pocket from the top support. A plain Box is converted to an equivalent profile-based stock; other unsupported bases reject in Preview.</p>
    </>}
    {pending.action.kind === 'placement' && <>
      {choose('Component', part, parts.map(p => ({ value: p.id, label: p.name })), setPart)}
      {placementReason ? <><p role="alert">{placementReason}</p>{driver && props.onInspect && <button onClick={() => props.onInspect!(driver.id)}>Select driving mate</button>}</> : <>
        {translation.map((v, i) => <label key={i}>{['X', 'Y', 'Z'][i]} (mm)<input aria-label={`Translation ${['X', 'Y', 'Z'][i]}`} type="number" step="any" value={v} disabled={state === 'preparing'} onChange={e => { invalidate(); setTranslation(t => t.map((n, j) => i === j ? e.target.value : n)); }} /></label>)}
        {choose('Rotation axis', axis, ['X', 'Y', 'Z'].map(v => ({ value: v, label: v })), v => setAxis(v as 'X' | 'Y' | 'Z'))}
        <label>Angle (deg)<input aria-label="Rotation angle" type="number" step="any" value={angle} disabled={state === 'preparing'} onChange={e => { invalidate(); setAngle(e.target.value); }} /></label>
        <p>Relative to the parent origin. Mate-driven components must be changed through their mate.</p></>}
    </>}
    {pending.action.kind === 'mate' && <>
      {choose('Fixed frame', a, ends.map(e => ({ value: JSON.stringify({ part: e.part, port: e.port }), label: e.label })), setA)}
      {choose('Moving frame', b, ends.map(e => ({ value: JSON.stringify({ part: e.part, port: e.port }), label: e.label })), setB)}
      {pending.mate?.existing ? <p>Mate type: {jointKind} · authored contract and options retained</p> : choose('Mate type', jointKind, props.jointKinds.map(k => ({ value: k, label: k })), setJointKind)}
      <p>The moving component's absolute Placement is replaced by this relationship. Its other source and published frames remain.</p>
    </>}
    {state === 'preparing' && <p role="status">Compiling preview…</p>}
    {state === 'previewed' && <p role="status">Preview admitted. Working source has not changed.</p>}
    {(error || diagnostics.some(d => d.severity === 'error')) && <div role="alert"><strong>Preview refused · source unchanged</strong>{error && <p>{error}</p>}
      {diagnostics.filter(d => d.severity === 'error').map((d, i) => <p key={i}><b>{d.code}</b> · {d.message}{d.source && <small>{d.source.source}:{d.source.line}:{d.source.column} (preview source)</small>}</p>)}</div>}
    {prepared && <details><summary>Source change</summary><pre>{prepared.text}</pre></details>}
    <div className="authoring-actions"><button disabled={state === 'preparing' || !!placementReason && pending.action.kind === 'placement'} onClick={() => void runPreview()}>Preview</button>
      <button className="primary" disabled={!prepared || state !== 'previewed'} onClick={() => prepared && props.onApply(prepared, title)}>Apply</button></div>
  </aside>;
}

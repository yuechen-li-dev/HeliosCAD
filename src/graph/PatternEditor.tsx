import { useEffect, useState } from 'react';
import type { LanguageEditOperation, LanguageOutline, PatternProjection } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { uniqueName } from './graphAuthoring';

interface Props {
  source: string; candidate: string | null; sourceName: string; revision: number; node: string | null;
  outline: LanguageOutline; runtime: CadRuntime; disabled: boolean;
  onChange(operations: readonly LanguageEditOperation[]): void;
}

/** Authored expressions are edits; evaluated rows are read-only compiler results.
 * No arithmetic or world-frame inference lives in this view. */
export function PatternEditor(props: Props) {
  const { outline } = props;
  const [view, setView] = useState<PatternProjection | null>(null);
  const [evaluated, setEvaluated] = useState<PatternProjection | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [placementLawEdited, setPlacementLawEdited] = useState(false);
  const [creating, setCreating] = useState(!outline.nodes.some(n => n.kind === 'Pattern'));
  const [creation, setCreation] = useState({ name: uniqueName('Copies', outline), mode: 'existing', layout: '', parent: '',
    layoutName: uniqueName('Layout', outline), count: '4', first: '0', prefix: 'Site', position: 'Point2(10mm * n, 0mm)',
    start: 'Point2(0mm, 0mm)', direction: '[1, 0]', stations: 'First: 0mm; Second: 10mm;', body: '',
    component: '', componentKind: 'Part', from: '', to: 'World', translation: '[point.X, point.Y, 0mm]' });
  useEffect(() => {
    let current = true;
    void props.runtime.patterns(props.source, props.sourceName, String(props.revision)).then(result => {
      if (!current) return; setView(result); setEvaluated(result);
      setSelected(result.patterns.find(p => p.node === props.node || p.controls.includes(props.node ?? ''))?.node ?? result.patterns[0]?.node ?? '');
    }).catch(reason => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [props.source, props.sourceName, props.revision, props.runtime]);
  useEffect(() => {
    let current = true;
    if (!props.candidate) { setEvaluated(view); return; }
    void props.runtime.patterns(props.candidate, props.sourceName, `${props.revision}:preview`).then(result => { if (current) setEvaluated(result); })
      .catch(reason => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [props.candidate, view, props.runtime, props.sourceName, props.revision]);
  const application = view?.patterns.find(p => p.node === selected);
  const controls = outline.nodes.filter(n => application?.controls.includes(n.id));
  const layouts = view?.layouts ?? [];
  const results = props.candidate ? (evaluated?.revision === `${props.revision}:preview` ? evaluated : null) : view;
  const layout = results?.layouts.find(l => l.name === (changes.source ?? application?.source))
    ?? (creating ? results?.layouts.find(l => l.name === (creation.mode === 'existing' ? creation.layout : `${creation.layoutName}.Sites`)) : undefined);
  const parents = outline.nodes.filter(n => n.kind === 'Modify' || n.occurrence && ['Assembly', 'Subassembly', 'Group'].includes(n.kind));
  const createOps = (next: typeof creation): LanguageEditOperation[] => {
    const parent = next.parent || parents[0]?.id;
    if (!parent) return [];
    const result: LanguageEditOperation[] = [];
    if (next.mode !== 'existing') {
      const recipe = next.mode === 'series'
        ? `Series { index: n; first: ${next.first}; count: ${next.count}; keyPrefix: ${next.prefix}; position: ${next.position}; }`
        : `Linear { start: ${next.start}; direction: ${next.direction}; Stations { ${next.stations} } }`;
      result.push({ kind: 'insertDeclaration', parent: outline.nodes.find(n => n.kind === 'Model')?.id ?? null,
        source: `Concept Struct ${next.layoutName} { Points<Point2> Sites { ${recipe} } }` });
    }
    result.push({ kind: 'insertDeclaration', parent, source: `Pattern ${next.name} over ${next.mode === 'existing' ? next.layout : `${next.layoutName}.Sites`} { ${next.body} }` });
    return result;
  };
  const components = outline.nodes.filter(n => n.occurrence && ['Part', 'Assembly', 'Subassembly'].includes(n.kind) && n.value);
  const updateCreation = (key: keyof typeof creation, value: string, feature = false) => {
    const next = { ...creation, [key]: value, ...(feature ? { component: '' } : {}) };
    if (key === 'translation') setPlacementLawEdited(true);
    if (next.component && !placementLawEdited && ['component', 'layout', 'mode'].includes(key)) {
      const type = next.mode === 'existing' ? layouts.find(l => l.name === next.layout)?.elementType : 'Point2';
      next.translation = type === 'Point3' ? '[point.X, point.Y, point.Z]' : type === 'Point2' ? '[point.X, point.Y, 0mm]' : '';
    }
    if (key === 'component' && !value) next.body = '';
    if (['component', 'componentKind', 'from', 'to', 'translation', 'layout', 'mode'].includes(key) && next.component)
      next.body = `point => <${next.componentKind} Item = ${next.component}>\n Placement { from: ${next.from}; to: ${next.to}; translateLocal: ${next.translation}; }\n</${next.componentKind}>`;
    setCreation(next); props.onChange(createOps(next));
  };
  const update = (key: string, value: string) => {
    const next = { ...changes, [key]: value }; setChanges(next);
    props.onChange(Object.entries(next).map(([key, value]): LanguageEditOperation => {
      if (key === 'source') return { kind: 'setPatternSource', node: selected, value };
      if (key === 'body') return { kind: 'setPatternBody', node: selected, value };
      const [node, field] = JSON.parse(key) as [string, string];
      if (field.startsWith('set:')) return { kind: 'setSetEntry', node, field: field.slice(4), value };
      return field === '=' ? { kind: 'setValue', node, value } : { kind: 'setField', node, field, value };
    }));
  };
  const input = (label: string, key: keyof typeof creation, multiline = false) => <label>{label}{multiline
    ? <textarea aria-label={label} value={creation[key]} disabled={props.disabled} onChange={e => updateCreation(key, e.target.value)} />
    : <input aria-label={label} value={creation[key]} disabled={props.disabled} onChange={e => updateCreation(key, e.target.value)} />}</label>;
  if (error) return <p role="alert">{error}</p>;
  if (!view) return <p role="status">Resolving layouts…</p>;
  return <div className="pattern-editor">
    <label>Application<select aria-label="Pattern application" value={creating ? '__new' : selected} disabled={props.disabled} onChange={e => {
      const fresh = e.target.value === '__new'; setCreating(fresh); setSelected(fresh ? '' : e.target.value); setChanges({});
      const next = { ...creation, layout: layouts[0]?.name ?? '', parent: parents[0]?.id ?? '' }; setCreation(next);
      props.onChange(fresh ? createOps(next) : []);
    }}>{view.patterns.map(p => <option key={p.node} value={p.node}>{p.name}</option>)}<option value="__new">New Pattern…</option></select></label>
    {application?.readOnlyReason ? <p>{application.readOnlyReason}</p> : <>
      <h3>Layout</h3>
      {creating ? <>
        {input('Pattern name', 'name')}
        <label>Pattern host<select aria-label="Pattern host" value={creation.parent || parents[0]?.id || ''} onChange={e => updateCreation('parent', e.target.value)} disabled={props.disabled}>
          {parents.map(n => <option key={n.id} value={n.id}>{n.name} · {n.kind}</option>)}</select></label>
        <label>Layout kind<select aria-label="Layout kind" value={creation.mode} disabled={props.disabled} onChange={e => updateCreation('mode', e.target.value)}>
          <option value="existing">Existing keyed collection</option><option value="series">Equation Series</option><option value="stations">Named stations</option></select></label>
        {creation.mode === 'existing' ? <label>Collection<select aria-label="Collection" value={creation.layout} disabled={props.disabled} onChange={e => updateCreation('layout', e.target.value)}>
          <option value="">Choose…</option>{layouts.map(l => <option key={l.node} value={l.name}>{l.name} · {l.elementType}</option>)}</select></label>
          : <>{input('Layout name', 'layoutName')}{creation.mode === 'series'
            ? <>{input('Count expression', 'count')}{input('First index', 'first')}{input('Key prefix', 'prefix')}{input('Position law', 'position')}</>
            : <>{input('Start point', 'start')}{input('Direction', 'direction')}{input('Named stations', 'stations', true)}</>}</>}
      </> : application && <>
        <label>Collection expression<input aria-label="Collection expression" value={changes.source ?? application.source ?? ''} disabled={props.disabled} onChange={e => update('source', e.target.value)} list="pattern-layouts" /></label>
        <datalist id="pattern-layouts">{layouts.map(l => <option key={l.node} value={l.name} />)}</datalist>
        {controls.filter(n => ['Points', 'Series', 'Linear', 'Stations', 'Static', 'Function'].includes(n.kind)).map(n => <fieldset key={n.id}><legend>{n.name ?? n.kind} · {n.kind}</legend>
          {[...(n.value ? [n.value] : []), ...n.fields].map(f => {
            const key = JSON.stringify([n.id, f.name]);
            return <label key={key}>{f.name === '=' ? 'Expression' : f.name}<input aria-label={`${n.name ?? n.kind}.${f.name}`} value={changes[key] ?? f.text} disabled={props.disabled} onChange={e => update(key, e.target.value)} /></label>;
          })}</fieldset>)}
      </>}
      {!creating && layouts.find(l => l.name === application?.source)?.kind === 'Keyed Set' &&
        layouts.find(l => l.name === application?.source)!.rows.filter(r => r.authored != null).map(r => {
          const owner = layouts.find(l => l.name === application?.source)!;
          const key = JSON.stringify([owner.node, `set:${r.key}`]);
          return <label key={r.key}>{r.key} · authored value<input aria-label={`Set.${r.key}`} value={changes[key] ?? r.authored!} disabled={props.disabled} onChange={e => update(key, e.target.value)} /></label>;
        })}
      <p>Changing first, keyPrefix or explicit keys changes instance identity. Shared laws/layouts affect every consumer. Editing a reference replaces that reference only when you change its expression explicitly.</p>
      {application?.consumers.length ? <p>Other consumers: {application.consumers.join(', ')}</p> : null}
      <h3>Recipe</h3>
      {creating && <label>Feature recipe<select aria-label="Feature recipe" disabled={props.disabled} defaultValue="" onChange={e => {
        const feature = outline.nodes.find(n => n.id === e.target.value);
        if (feature) updateCreation('body', `point => ${feature.name}(${(feature.signature ?? []).map(p => `${p.name}: ${p.type === 'Point2' || p.type === 'Point3' ? 'point' : p.default ?? p.name}`).join(', ')})`, true);
      }}><option value="">Choose a Feature, or write a component mapping below</option>{outline.nodes.filter(n => n.kind === 'Feature' && !n.call).map(n => <option key={n.id} value={n.id}>{n.name}({n.signature?.map(p => `${p.name}: ${p.type}`).join(', ')})</option>)}</select></label>}
      {creating && <>
        <label>Component definition<select aria-label="Component definition" disabled={props.disabled} value={creation.component} onChange={e => updateCreation('component', e.target.value)}>
          <option value="">Choose an existing definition/specialization</option>
          {[...new Set(components.map(n => n.value!.text))].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        {creation.component && <>
          <label>Occurrence kind<select aria-label="Occurrence kind" disabled={props.disabled} value={creation.componentKind} onChange={e => updateCreation('componentKind', e.target.value)}><option>Part</option><option>Assembly</option></select></label>
          {input('Definition expression', 'component')}{input('From published frame', 'from')}{input('To assembly frame', 'to')}{input('Placement law', 'translation')}
          <p>Choose the component's published source frame explicitly. Placement coordinates are local to the target frame. For Point3, include point.Z explicitly; Record layouts must name their point fields.</p>
        </>}
      </>}
      <label>Keyed mapping<textarea aria-label="Keyed mapping" rows={5} disabled={props.disabled} value={creating ? creation.body : changes.body ?? application?.body ?? ''}
        onChange={e => creating ? updateCreation('body', e.target.value) : update('body', e.target.value)} /></label>
      {!creating && controls.filter(n => !['Points', 'Series', 'Linear', 'Stations', 'Static', 'Function', 'Pattern'].includes(n.kind)).map(n => <fieldset key={n.id}><legend>{n.name ?? n.kind} · shared recipe</legend>
        {n.fields.map(f => { const key = JSON.stringify([n.id, f.name]); return <label key={key}>{f.name}<input aria-label={`${n.name ?? n.kind}.${f.name}`} value={changes[key] ?? f.text} disabled={props.disabled} onChange={e => update(key, e.target.value)} /></label>; })}
      </fieldset>)}
      <p>The mapping is Firmament source. Bind typed arguments to the element or its fields. Assembly mappings use the existing component and Placement syntax.</p>
    </>}
    <h3>Instances</h3>
    {props.candidate && !results && <p role="status">Resolving candidate layout…</p>}
    {!props.candidate && <p>Evaluated working layout. Preview checks the edited law and complete project.</p>}
    {layout && <><p>{layout.kind} · {layout.elementType} · {layout.rows.length} mapped values. Coordinates are local to the layout; the recipe resolves their support frame.</p>
      <PointPlot rows={layout.rows} />
      <div className="pattern-table"><table><thead><tr><th>Key</th><th>Value (mm)</th><th>Expansion</th></tr></thead><tbody>{layout.rows.map(r => <tr key={r.key} title={r.stableId ?? r.key}><th>{r.key}</th><td>{r.value}</td><td>{r.generatedIds.join(', ') || 'No consumer'}</td></tr>)}</tbody></table></div></>}
    {(results?.diagnostics ?? []).map((d, i) => <p key={i} role={d.severity === 'error' ? 'alert' : undefined}>{d.code} · {d.message}</p>)}
    <small>Layout resolution does not prove geometry admission. Generated rows cannot be edited independently.</small>
  </div>;
}

function PointPlot({ rows }: { rows: PatternProjection['layouts'][number]['rows'] }) {
  const points = rows.filter(r => r.coordinates?.length === 2 && r.coordinates.every(Number.isFinite));
  if (!points.length) return null;
  const xs = points.map(p => p.coordinates![0]), ys = points.map(p => p.coordinates![1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const extent = Math.max(maxX - minX, maxY - minY, 1), padding = extent * .1;
  return <svg className="pattern-point-preview" aria-label="Local 2D layout preview" viewBox={`${minX - padding} ${-maxY - padding} ${extent + 2 * padding} ${extent + 2 * padding}`}>
    {points.map(p => <circle key={p.key} cx={p.coordinates![0]} cy={-p.coordinates![1]} r={extent * .014}><title>{p.key}: {p.value}</title></circle>)}
  </svg>;
}

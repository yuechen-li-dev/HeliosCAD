import { useEffect, useMemo, useState } from 'react';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, ModelSession, SelectionDescription, SemanticSchema, SourceReference, UnitValue } from '@aetheris/cad';

interface Props {
  model: ModelSession | null;
  schema?: SemanticSchema | null;
  projection?: ConstructProjection | null;
  projectionCurrent?: boolean;
  entityId: string | null;
  faceId?: string | null;
  selection?: SelectionDescription | null;
  diagnostics: readonly Diagnostic[];
  onApply(property: EditableProperty, value: UnitValue): Promise<boolean>;
  onRewriteField?(field: FieldProjection, value: number): Promise<boolean>;
  onGoToSource?(source: SourceReference): void;
  onReferenceFace?(): void;
  onReferenceHoleWall?(): void;
}

export function Inspector({ model, schema, projection, projectionCurrent = true, entityId, faceId, selection, diagnostics, onApply, onRewriteField, onGoToSource, onReferenceFace, onReferenceHoleWall }: Props) {
  const entity = entityId ? model?.entity(entityId) : undefined;
  const occurrence = model?.mesh.occurrences.find(item => item.semanticEntityId === entityId || item.id === entityId);
  const properties = useMemo(() => model?.properties.filter(property => property.ownerEntityId === entityId) ?? [], [entityId, model]);
  const source = selection?.source ?? entity?.source;
  const construct = schema?.constructs.find(item => item.name === (entity?.semanticConstruct ?? entity?.kind));
  return <section className="panel inspector" aria-label="Inspector">
    <div className="panel-heading"><span>INSPECTOR</span><span className="panel-meta">{entity?.kind ?? '—'}</span></div>
    <div className="inspector-scroll">
      {entity ? <>
        <div className="entity-hero"><span className="entity-glyph">{entity.kind === 'Hole' ? '⊙' : '◆'}</span><div><strong>{entity.name}</strong><small>{entity.kind}</small></div></div>
        <dl className="identity-list"><dt>Semantic ID</dt><dd title={entity.id}>{entity.id}</dd>{faceId && <><dt>{selection?.topologyKind === 'Edge' ? 'Edge ID' : 'Face ID'}</dt><dd title={faceId}>{faceId}</dd></>}{selection && <><dt>Topology</dt><dd>{selection.semanticTopologyId ?? selection.sourceAddressability}</dd><dt>Selector</dt><dd>{selection.selector ?? selection.selectorReason ?? 'No source selector'}</dd></>}{source ? <><dt>Source</dt><dd><button className="source-link" onClick={() => onGoToSource?.(source)}>{source.source}:{source.line}</button></dd></> : <><dt>Source</dt><dd>No Firmament source</dd></>}</dl>
        <div className="inspector-actions"><button onClick={() => source && onGoToSource?.(source)} disabled={!source}>Go to Source</button>{selection?.selector && <><button onClick={() => void navigator.clipboard?.writeText(selection.selector!)}>Copy Selector</button>{selection.outputRole === 'BoxFace' && <button onClick={onReferenceFace}>Reference Face in Source</button>}{selection.outputRole === 'HoleWallFace' && entity.kind === 'Hole' && entity.holeDiameterMm != null && <button onClick={onReferenceHoleWall}>Reference Hole Wall in Source</button>}</>}<button onClick={() => void navigator.clipboard?.writeText(selection?.semanticTopologyId ?? faceId ?? entity.id)}>Copy Semantic ID</button></div>
        {occurrence && <><div className="section-label">OCCURRENCE</div><dl className="identity-list"><dt>Occurrence</dt><dd title={occurrence.id}>{occurrence.id}</dd><dt>Definition</dt><dd>{occurrence.definitionId ?? '—'}</dd><dt>Parent</dt><dd>{occurrence.parentId ?? 'Root'}</dd><dt>Translation</dt><dd>{formatTranslation(occurrence.transform)} mm</dd></dl></>}
        {construct?.outputs.length ? <><div className="section-label">SEMANTIC OUTPUTS</div><dl className="identity-list">{construct.outputs.map(output => <div key={output.id}><dt>{output.name}</dt><dd>{selection?.outputRole === output.sourceRole && selection.selector ? selection.selector : output.kind}</dd></div>)}</dl></> : null}
        {construct && <><div className="section-label">SEMANTIC FIELDS</div><dl className="identity-list">{construct.fields.map(field => {
          const projected = projection?.constructId === construct.id ? projection.fields.find(item => item.fieldId === field.id) : undefined;
          return <div key={field.id}><dt>{field.name}</dt><dd>
            {projected?.effectiveValue?.text ?? (field.default ? `Default: ${field.default}` : 'Value unavailable')}
            {' · '}{projected?.origin === 'Defaulted' ? 'Default' : projected?.origin ?? 'Unavailable'}
            {' · '}{field.kind}{field.unit !== 'None' ? ` (${field.unit})` : ''}
            {projected?.authoredValue && <small title={projected.authoredValue}> Source: {projected.authoredValue}</small>}
            {projected?.source && <button className="source-link" onClick={() => onGoToSource?.(projected.source!)}>Go to Source</button>}
            {projected?.editable && projectionCurrent && onRewriteField ? <FieldEditor field={projected} onApply={onRewriteField} /> :
              <small title={!projectionCurrent ? 'Stale source revision' : projected?.readOnlyReason ?? 'No current field projection'}> Read-only{!projectionCurrent ? ': Stale source revision' : projected?.readOnlyReason ? `: ${projected.readOnlyReason}` : ''}</small>}
          </dd></div>;
        })}</dl></>}
        <details className="override-details"><summary>SOURCE OVERRIDES · EXPERIMENTAL ({properties.length})</summary>
          <p>Edits here change the current model only. Edit Firmament source to save changes.</p>
          {properties.length ? properties.map(property => <PropertyEditor key={property.id} property={property} onApply={onApply} />) : <div className="empty-state compact">No editable properties on this entity.</div>}
        </details>
        <div className="section-label">RELATED DIAGNOSTICS</div>
        <div className="empty-state compact">{diagnostics.length ? `${diagnostics.length} model diagnostic${diagnostics.length === 1 ? '' : 's'}` : 'No diagnostics'}</div>
      </> : <div className="empty-state">Select model geometry or a tree item to inspect its semantic identity.</div>}
    </div>
  </section>;
}

function FieldEditor({ field, onApply }: { field: FieldProjection; onApply(field: FieldProjection, value: number): Promise<boolean> }) {
  const [draft, setDraft] = useState(String(field.effectiveValue?.number ?? ''));
  const [error, setError] = useState(false);
  const [applying, setApplying] = useState(false);
  useEffect(() => { setDraft(String(field.effectiveValue?.number ?? '')); setError(false); }, [field.effectiveValue?.number]);
  const commit = async () => {
    const number = Number(draft);
    if (!Number.isFinite(number) || number <= 0) { setError(true); return; }
    setApplying(true);
    setError(!(await onApply(field, number)));
    setApplying(false);
  };
  return <div className="property-control"><input aria-label={`Edit ${field.name}`} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void commit(); }} disabled={applying} /><span>mm</span><button onClick={() => void commit()} disabled={applying}>Apply</button>{error && <small>Invalid or stale source edit</small>}</div>;
}

function formatTranslation(transform: readonly number[]) { return `X ${formatNumber(transform[12])} · Y ${formatNumber(transform[13])} · Z ${formatNumber(transform[14])}`; }
function formatNumber(value: number | undefined) { return Number(value ?? 0).toFixed(2); }

function PropertyEditor({ property, onApply }: { property: EditableProperty; onApply(property: EditableProperty, value: UnitValue): Promise<boolean> }) {
  const [draft, setDraft] = useState(String(property.value));
  const [invalid, setInvalid] = useState(false);
  const [applying, setApplying] = useState(false);
  useEffect(() => { if (!invalid) setDraft(String(property.value)); }, [property.value, invalid]);
  const commit = async () => {
    const value = Number(draft);
    if (!Number.isFinite(value)) { setInvalid(true); return; }
    setApplying(true);
    const success = await onApply(property, { value, unit: property.unit });
    setInvalid(!success);
    setApplying(false);
  };
  return <div className={`property-editor ${invalid ? 'invalid' : ''}`}>
    <label htmlFor={property.id}>{property.name}</label>
    <div className="property-control">
      <input id={property.id} value={draft} disabled={!property.writable || applying} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void commit(); }} />
      <span>{property.unit}</span>
      <button onClick={() => void commit()} disabled={!property.writable || applying}>Apply</button>
    </div>
    <small>{invalid ? 'Invalid value retained. Last valid geometry remains.' : `Source value at line ${property.source.line}; edits are effective overrides.`}</small>
  </div>;
}

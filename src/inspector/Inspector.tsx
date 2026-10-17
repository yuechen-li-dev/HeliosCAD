import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { displayKind } from './displayKind';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, ModelSession, SelectionDescription, SemanticFieldSchema, SemanticSchema, SourceReference, UnitValue } from '@aetheris/cad';

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
  const construct = entity ? schema?.constructs.find(item => item.name === (entity.semanticConstruct ?? entity.kind)) : undefined;
  const fields = construct ? (construct.fields ?? []).map(field => ({ field,
    projected: projection?.constructId === construct.id ? projection.fields.find(item => item.fieldId === field.id) : undefined })) : [];
  // Fields with neither a value nor a default say nothing yet; they wait in their own closed group.
  const shown = fields.filter(({ field, projected }) => projected?.effectiveValue || field.default || projected?.authoredValue);
  const unset = fields.filter(item => !shown.includes(item));
  const fieldRow = ({ field, projected }: typeof fields[number]) => <SemanticFieldRow key={field.id} field={field} projected={projected}
    editable={!!projected?.editable && projectionCurrent && !!onRewriteField} stale={!projectionCurrent} onRewriteField={onRewriteField} onGoToSource={onGoToSource} />;
  return <section className="panel inspector" aria-label="Inspector">
    <div className="panel-heading"><span>Selection</span></div>
    <div className="inspector-scroll">
      {entity ? <>
        <div className="entity-hero"><span className="entity-glyph">{entity.kind === 'Hole' ? '⊙' : '◆'}</span><div><strong>{entity.name}</strong><small>{displayKind(entity.kind)}</small></div></div>
        <Section id="identity" label="Identity">
          <dl className="identity-list"><dt>Semantic ID</dt><dd className="identifier"><Identifier value={entity.id} /></dd>{faceId && <><dt>{selection?.topologyKind === 'Edge' ? 'Edge ID' : 'Face ID'}</dt><dd className="identifier"><Identifier value={faceId} /></dd></>}{selection && <><dt>Topology</dt><dd className="identifier"><Identifier value={selection.semanticTopologyId ?? selection.sourceAddressability} /></dd><dt>Selector</dt><dd className={selection.selector ? 'identifier' : 'note'}>{selection.selector ? <Identifier value={selection.selector} /> : selection.selectorReason ?? 'No source selector'}</dd></>}{source ? <><dt>Source</dt><dd><button className="source-link" onClick={() => onGoToSource?.(source)}>{source.source}:{source.line}</button></dd></> : <><dt>Source</dt><dd>No Firmament source</dd></>}</dl>
          <div className="inspector-actions"><button onClick={() => source && onGoToSource?.(source)} disabled={!source}>Go to source</button>{selection?.selector && <><button onClick={() => void navigator.clipboard?.writeText(selection.selector!)}>Copy selector</button>{selection.outputRole === 'BoxFace' && <button onClick={onReferenceFace}>Reference face in source</button>}{selection.outputRole === 'HoleWallFace' && entity.kind === 'Hole' && entity.holeDiameterMm != null && <button onClick={onReferenceHoleWall}>Reference hole wall in source</button>}</>}<button onClick={() => void navigator.clipboard?.writeText(selection?.semanticTopologyId ?? faceId ?? entity.id)}>Copy semantic ID</button></div>
        </Section>
        {occurrence && <Section id="occurrence" label="Occurrence">
          <dl className="identity-list"><dt>Occurrence</dt><dd className="identifier"><Identifier value={occurrence.id} /></dd><dt>Definition</dt><dd className="identifier"><Identifier value={occurrence.definitionId ?? '—'} /></dd><dt>Parent</dt><dd className="identifier"><Identifier value={occurrence.parentId ?? 'Root'} /></dd><dt>Translation</dt><dd>{formatTranslation(occurrence.transform)} mm</dd></dl>
        </Section>}
        {construct && fields.length > 0 && <Section id="fields" label="Semantic fields" count={shown.length}>
          {shown.length > 0 ? <ul className="semantic-fields">{shown.map(fieldRow)}</ul> : <div className="empty-state compact">No field has a value yet.</div>}
          {unset.length > 0 && <details className="semantic-unset"><summary>Not set <span>{unset.length}</span></summary><ul className="semantic-fields">{unset.map(fieldRow)}</ul></details>}
        </Section>}
        {construct?.outputs?.length ? <Section id="outputs" label="Semantic outputs" count={construct.outputs.length} defaultOpen={false}>
          <ul className="semantic-fields">{construct.outputs.map(output => <li key={output.id} className="semantic-field">
            <div className="semantic-field-head"><span className="semantic-field-name">{output.name}</span>
              <span className="semantic-field-value">{selection?.outputRole === output.sourceRole && selection.selector ? selection.selector : output.kind}</span></div>
            {output.sourceRole && <div className="semantic-field-meta"><span>{output.sourceAddressable ? 'Addressable from source' : 'Not addressable from source'}</span></div>}
          </li>)}</ul>
        </Section> : null}
        <Section id="overrides" label="Source overrides · experimental" count={properties.length} defaultOpen={false}>
          <p className="section-note">Edits here change the current model only. Edit Firmament source to save changes.</p>
          {properties.length ? properties.map(property => <PropertyEditor key={property.id} property={property} onApply={onApply} />) : <div className="empty-state compact">No editable properties on this entity.</div>}
        </Section>
        <Section id="diagnostics" label="Related diagnostics" count={diagnostics.length}>
          <div className="empty-state compact">{diagnostics.length ? `${diagnostics.length} model diagnostic${diagnostics.length === 1 ? '' : 's'}` : 'No diagnostics'}</div>
        </Section>
      </> : <div className="empty-state">Select a face in the viewport or an item in the model tree to see what it is and where it is written.</div>}
    </div>
  </section>;
}

const sectionKey = (id: string) => `helios-inspector-section:${id}`;

/** A collapsible inspector section; whether it is open is remembered per viewer. */
function Section({ id, label, count, defaultOpen = true, children }: { id: string; label: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { const stored = localStorage.getItem(sectionKey(id)); return stored === null ? defaultOpen : stored === 'open'; } catch { return defaultOpen; }
  });
  return <details className="inspector-section" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    setOpen(next);
    try { localStorage.setItem(sectionKey(id), next ? 'open' : 'closed'); } catch { /* per-viewer convenience only */ }
  }}>
    <summary><span>{label}</span>{count !== undefined && count > 0 && <span className="section-count">{count}</span>}</summary>
    <div className="inspector-section-body">{children}</div>
  </details>;
}

/** `8mm` and `8 mm` say the same thing; only a different spelling is worth showing. */
const compact = (text: string) => text.replace(/\s+/g, '');

const originLabel: Record<string, string> = { Authored: 'Authored', Defaulted: 'Default', Derived: 'Derived', Inherited: 'Inherited', Unavailable: 'Unavailable' };

function SemanticFieldRow({ field, projected, editable, stale, onRewriteField, onGoToSource }: {
  field: SemanticFieldSchema; projected: FieldProjection | undefined; editable: boolean; stale: boolean;
  onRewriteField?(field: FieldProjection, value: number): Promise<boolean>; onGoToSource?(source: SourceReference): void;
}) {
  const origin = projected?.origin ?? 'Unavailable';
  const value = projected?.effectiveValue?.text ?? (field.default ? field.default : null);
  const readOnly = stale ? 'The source changed since this was built.' : projected?.readOnlyReason ?? (projected ? null : 'Not projected for this selection.');
  return <li className="semantic-field">
    <div className="semantic-field-head" title={field.description ?? undefined}>
      <span className="semantic-field-name">{field.name}</span>
      <span className={`semantic-field-value${value ? '' : ' none'}`}>{value ?? '—'}</span>
    </div>
    <div className="semantic-field-meta">
      <span className={`origin origin-${origin.toLowerCase()}`}>{projected ? originLabel[origin] ?? origin : field.default ? 'Default' : 'Unavailable'}</span>
      <span>{field.kind}{field.unit !== 'None' && field.unit !== field.kind ? ` · ${field.unit}` : ''}{field.required ? ' · required' : ''}</span>
      {projected?.source && <button className="source-link" onClick={() => onGoToSource?.(projected.source!)}>Source</button>}
    </div>
    {projected?.authoredValue && compact(projected.authoredValue) !== compact(projected.effectiveValue?.text ?? '') && <div className="semantic-field-authored">Written as <code>{projected.authoredValue}</code></div>}
    {editable && projected ? <FieldEditor field={projected} onApply={onRewriteField!} />
      : readOnly && <div className="semantic-field-note">Read-only · {readOnly}</div>}
  </li>;
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

/** An id that wraps after its own separators (`definition:` · `Plate.` · `CenterMount`) before it breaks a name. */
function Identifier({ value }: { value: string }) {
  return <>{value.split(/(?<=[.:])/).map((part, index) => <Fragment key={index}>{part}<wbr /></Fragment>)}</>;
}

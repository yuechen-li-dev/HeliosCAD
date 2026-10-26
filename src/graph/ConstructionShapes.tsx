import { useEffect, useState } from 'react';
import type { DraftConstruction, SketchShape } from '@aetheris/cad';

/** Shape types and writable controls come from the compiler. This panel edits independent
 * dimensions; it never reconstructs rectangle corners or evaluates driven expressions. */
export function ConstructionShapes({ construction, selected, onSelect, onCreate, onRelated, onDimensions, onParameter, onPending, busy, revision }: {
  construction: DraftConstruction; selected: string; onSelect(id: string): void;
  onCreate(): void; onRelated(reference: string): void;
  onDimensions(changes: { control: string; value: number }[]): void;
  onParameter(id: string, value: number): void; onPending(pending: boolean): void; busy: boolean; revision: number;
}) {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [revision]);
  useEffect(() => { onPending(pending !== null); }, [pending, onPending]);
  useEffect(() => () => onPending(false), [onPending]);
  const shapes = construction.shapes ?? [];
  const shape = shapes.find(s => s.id === selected) ?? shapes[0];
  const directParameters = new Set(shapes.flatMap(s => s.controls.filter(c => c.editable).map(c => c.parameter)));
  const relationshipParameters = construction.elements.filter(e => e.kind === 'Static' && !directParameters.has(e.name))
    .flatMap(e => e.fields.filter(f => f.name === 'value' && f.number !== null && f.editable).map(f => ({ ...f, id: e.id, name: e.name })));
  return <div className="construction-shapes">
    <h3>Construction shapes</h3>
    <p>Dimensions and placement define the shape. Its type supplies the geometric relationships.</p>
    <div className="shape-cards">{shapes.map(s => <button key={s.id} type="button" disabled={busy || pending !== null} aria-pressed={shape?.id === s.id} onClick={() => onSelect(s.id)} aria-label={`Select ${s.name}`}><b>{s.name}</b><span>{s.kind}</span></button>)}</div>
    <button type="button" disabled={busy || pending !== null} onClick={onCreate}>Add rectangle</button>
    {shape?.kind === 'Rect2' && <><small>Rect2 retains four right angles and equal, parallel opposite sides.</small><button type="button" disabled={busy || pending !== null} onClick={() => onRelated(shape.id)}>Add related rectangle</button></>}
    {shape && <ShapeDimensions key={shape.id + ':' + revision} shape={shape} busy={busy || pending !== null && pending !== 'shape'} onApply={onDimensions} onDirty={dirty => setPending(dirty ? 'shape' : null)} />}
    {!!relationshipParameters.length && <div className="relationship-parameters"><h3>Relationship dimensions</h3><p>Changing these inputs updates the construction that depends on them.</p>
      {relationshipParameters.map(parameter => <ParameterDimension key={parameter.id + ':' + revision} name={parameter.name} value={parameter.number!} disabled={busy || pending !== null && pending !== parameter.id} onApply={value => onParameter(parameter.id, value)} onDirty={dirty => setPending(dirty ? parameter.id : null)} />)}
    </div>}
  </div>;
}

function ShapeDimensions({ shape, busy, onApply, onDirty }: { shape: SketchShape; busy: boolean; onApply(changes: { control: string; value: number }[]): void; onDirty(dirty: boolean): void }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const changes = shape.controls.filter(c => c.editable && values[c.id] !== undefined && values[c.id] !== c.value).map(c => ({ control: c.id, value: values[c.id] }));
  const controlField = (control: SketchShape['controls'][number]) => <label key={control.id}>{control.label} ({control.unit})<input aria-label={control.label} type="number" step="any" disabled={busy} readOnly={!control.editable} value={Number.isNaN(values[control.id]) ? '' : values[control.id] ?? control.value} onChange={e => {
      const next = { ...values, [control.id]: e.target.valueAsNumber }; setValues(next);
      onDirty(shape.controls.some(c => c.editable && next[c.id] !== undefined && next[c.id] !== c.value));
    }} required />
      <small>{control.editable ? control.parameter ? `Shared input: ${control.parameter}` : 'Independent dimension' : `Driven by ${control.authored}`}</small>
    </label>;
  return <form onSubmit={event => { event.preventDefault(); onApply(changes); }}><h3>{shape.name}</h3>
    {shape.controls.filter(c => !c.label.startsWith('Center')).map(controlField)}
    <details><summary>Placement</summary>{shape.controls.filter(c => c.label.startsWith('Center')).map(controlField)}</details>
    <button disabled={busy || !changes.length}>Apply shape dimensions</button>
    {!!changes.length && <button type="button" disabled={busy} onClick={() => { setValues({}); onDirty(false); }}>Discard dimension edits</button>}
  </form>;
}

function ParameterDimension({ name, value, disabled, onApply, onDirty }: { name: string; value: number; disabled: boolean; onApply(value: number): void; onDirty(dirty: boolean): void }) {
  const [next, setNext] = useState(value);
  return <form onSubmit={event => { event.preventDefault(); onApply(next); }}><label>{name} (mm)<input aria-label={name} type="number" step="any" required disabled={disabled} value={Number.isNaN(next) ? '' : next} onChange={e => { setNext(e.target.valueAsNumber); onDirty(e.target.valueAsNumber !== value); }} /></label><button disabled={disabled || next === value}>Apply {name}</button>{next !== value && <button type="button" disabled={disabled} onClick={() => { setNext(value); onDirty(false); }}>Discard {name} edit</button>}</form>;
}

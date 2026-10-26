import { useEffect, useRef, useState } from 'react';
import { shapeLabel } from './draftGeometry';

export function ConstructionShapeList({ shapes, selected, hidden, disabled, onSelect, onToggle, onShowAll }: {
  shapes: readonly { id: string; name: string; kind: string }[]; selected: string; hidden: ReadonlySet<string>; disabled: boolean;
  onSelect(id: string): void; onToggle(id: string): void; onShowAll(): void;
}) {
  const [filter, setFilter] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = list.current, selectedRow = container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!container || !selectedRow) return;
    const row = selectedRow.getBoundingClientRect(), viewport = container.getBoundingClientRect();
    // Scroll this list only; keep the drawing palette and dimension editor stationary.
    if (row.top < viewport.top) container.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) container.scrollTop += row.bottom - viewport.bottom;
  }, [selected, filter]);
  const visible = shapes.filter(shape => `${shape.name} ${shape.kind} ${shapeLabel(shape.kind)}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="construction-list" aria-label="Construction shapes">
    <div className="construction-list-title"><strong>Shapes ({shapes.length})</strong><button type="button" disabled={disabled || !hidden.size} onClick={onShowAll}>Show all</button></div>
    <input type="search" aria-label="Filter construction shapes" placeholder="Find a shape…" value={filter} onChange={e => setFilter(e.target.value)} />
    <div ref={list} className="construction-list-rows" role="list" aria-label="Construction shape list">{visible.map(shape => <div role="listitem" key={shape.id} className={hidden.has(shape.id) ? 'shape-hidden' : ''}>
      <input type="checkbox" aria-label={`Show ${shape.name}`} title="Show construction in this workspace; source and Profile stay unchanged" checked={!hidden.has(shape.id)} disabled={disabled} onChange={() => onToggle(shape.id)} />
      <button type="button" disabled={disabled} aria-pressed={selected === shape.id} aria-label={`Select ${shape.name}`} onClick={() => onSelect(shape.id)}><b>{shape.name}</b><small>{shapeLabel(shape.kind)}</small></button>
    </div>)}</div>
    {!visible.length && <small>No matching shapes.</small>}
    <small>Checkboxes only show or hide shapes here; the part is unchanged.</small>
  </section>;
}

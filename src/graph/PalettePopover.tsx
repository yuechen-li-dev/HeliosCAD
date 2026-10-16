import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaletteItem } from '@aetheris/cad';

interface Props {
  items: readonly PaletteItem[];
  /** Pane coordinates of the popover's top-left corner. */
  at: { x: number; y: number };
  /** Where features land (a body name), or why they cannot be added now. */
  featureTarget: { body: string } | { reason: string };
  /** Why an item cannot be added here, or null. */
  unavailable(item: PaletteItem): string | null;
  onPick(item: PaletteItem): void;
  onClose(): void;
}

/** Search-first palette: type to filter, arrows to move, Enter to add. */
export function PalettePopover({ items, at, featureTarget, unavailable, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => !q || `${item.label} ${item.category} ${item.description}`.toLowerCase().includes(q));
  }, [items, query]);
  const usable = (item: PaletteItem) => unavailable(item) === null;
  useEffect(() => setActive(index => Math.min(index, Math.max(0, shown.length - 1))), [shown.length]);
  useEffect(() => {
    const away = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) onClose(); };
    addEventListener('pointerdown', away, true);
    return () => removeEventListener('pointerdown', away, true);
  }, [onClose]);
  const pick = (item: PaletteItem | undefined) => { if (item && usable(item)) onPick(item); };
  const categories = [...new Set(shown.map(item => item.category))];
  let index = -1;
  return <div ref={root} className="graph-palette" role="dialog" aria-label="Add to model" style={{ left: at.x, top: at.y }}>
    <input autoFocus aria-label="Search parts and features" placeholder="Add a body or feature…" value={query} spellCheck={false}
      onChange={event => { setQuery(event.target.value); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (event.key === 'Enter') { event.preventDefault(); pick(shown[active]); }
        else if (event.key === 'Escape') onClose();
      }} />
    <div className="graph-palette-target">{'body' in featureTarget ? <>Features go on <b>{featureTarget.body}</b></> : featureTarget.reason}</div>
    <div className="graph-palette-list" role="listbox" aria-label="Palette">
      {categories.map(category => <div key={category} role="group" aria-label={category}>
        <span>{category}</span>
        {shown.filter(item => item.category === category).map(item => {
          const position = ++index;
          return <button key={item.id} role="option" aria-selected={position === active} disabled={!usable(item)}
            className={position === active ? 'active' : ''} onMouseEnter={() => setActive(position)} onClick={() => pick(item)}
            title={unavailable(item) ?? item.description}>
            <b>{item.label}</b><small>{item.description}</small>
          </button>;
        })}
      </div>)}
      {shown.length === 0 && <p>Nothing matches “{query}”.</p>}
    </div>
  </div>;
}

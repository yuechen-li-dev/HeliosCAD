import { useEffect, useRef, useState } from 'react';

export interface PaletteCommand { id: string; label: string; detail?: string; run(): void; }

export function CommandPalette({ commands, onClose }: { commands: readonly PaletteCommand[]; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = commands.filter(command => words.every(word => fuzzyMatch(word, `${command.label} ${command.detail ?? ''}`.toLowerCase())));
  const execute = (command: PaletteCommand) => { onClose(); command.run(); };
  return <div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="command-palette" role="dialog" aria-label="Command palette" aria-modal="true">
      <input ref={input} aria-label="Search commands" placeholder="Search commands…" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, matches.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
        if (event.key === 'Enter' && matches[active]) execute(matches[active]);
      }} />
      <div className="palette-results">{matches.length ? matches.map((command, index) => <button key={command.id} className={index === active ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => execute(command)}><strong>{command.label}</strong>{command.detail && <small>{command.detail}</small>}</button>) : <p>No matching command</p>}</div>
      <footer>↑ ↓ Navigate · Enter Run · Esc Close</footer>
    </div>
  </div>;
}

function fuzzyMatch(needle: string, haystack: string) {
  let index = 0;
  for (const letter of haystack) if (letter === needle[index]) index++;
  return index === needle.length;
}

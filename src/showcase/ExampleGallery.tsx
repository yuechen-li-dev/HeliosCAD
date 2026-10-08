import { useState } from 'react';
import { showcaseExamples } from './catalog';

export function ExampleGallery({ onOpen, opening, unavailableReason }: { onOpen(id: string): void; opening?: string | null; unavailableReason?: string }) {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const examples = showcaseExamples.filter(item => (category === 'All' || item.category === category) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="example-gallery" aria-label="Example gallery">
    <div className="gallery-heading"><h2>Models</h2>
      <input type="search" aria-label="Search examples" placeholder="Find an example…" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="category-tabs" aria-label="Example categories">{['All', ...new Set(showcaseExamples.map(item => item.category))].map(value => <button key={value} aria-pressed={value === category} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="showcase-grid">{examples.map(example => <button className="showcase-card" key={example.id} disabled={!!opening || !!unavailableReason} onClick={() => onOpen(example.id)} aria-label={`Open ${example.title}`}>
      <div className="showcase-image"><ShowcaseThumbnail source={example.thumbnail} title={example.title} /></div>
      <div className="showcase-copy"><h3>{({ atlas: 'ATLAS', guitar: 'Guitar', house: 'House', bracket: 'Mounting plate', bolt: 'CODEX bolt' } as Record<string, string>)[example.id] ?? example.title}</h3><span aria-hidden="true">{opening === example.id ? 'Opening…' : '↗'}</span></div>
    </button>)}</div>
    {!examples.length && <p className="empty-state">No examples match. Try a different name or category.</p>}
    {unavailableReason && <p className="gallery-footnote" role="status">{unavailableReason}</p>}
  </section>;
}

function ShowcaseThumbnail({ source, title }: { source: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="preview-unavailable">Preview unavailable<span>Open the source project to build its geometry.</span></div>
    : <img src={source} alt={`${title} wireframe from Aetheris geometry`} loading="lazy" onError={() => setFailed(true)} />;
}

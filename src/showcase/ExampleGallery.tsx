import { useEffect, useRef, useState } from 'react';
import { showcaseExamples } from './catalog';
import { GalleryRow } from './GalleryRow';
import { defaultGroups, useGalleryGroups, type GalleryGroup } from './galleryGroups';
import './gallery-rails.css';

export function ExampleGallery({ onOpen, opening, unavailableReason }: { onOpen(id: string): void; opening?: string | null; unavailableReason?: string }) {
  const [query, setQuery] = useState('');
  const { groups, save, temporary } = useGalleryGroups();
  const [editing, setEditing] = useState<GalleryGroup | null>(null), [error, setError] = useState('');
  const [removed, setRemoved] = useState<{ group: GalleryGroup; index: number } | null>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => { if (!editing && restoreFocus.current) { createButton.current?.focus(); restoreFocus.current = false; } }, [editing]);
  const search = query.trim().toLowerCase();
  const examples = showcaseExamples.filter(item => `${item.title} ${item.description} ${item.category} ${item.kind}`.toLowerCase().includes(search));
  const rows = [...defaultGroups, ...groups];
  const visibleRows = rows.flatMap(group => {
    const matchesName = group.name.toLowerCase().includes(search);
    const items = group.models.flatMap(id => (matchesName ? showcaseExamples : examples).find(example => example.id === id) ?? []);
    return search && !items.length && !matchesName ? [] : [{ group, items }];
  });
  const closeEditor = (restore = true) => { restoreFocus.current = restore; setEditing(null); setError(''); };
  const edit = (group: GalleryGroup) => { setFocusGroup(null); setEditing({ ...group, models: [...group.models] }); setError(''); };
  const saveGroup = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { setError('Give this group a name.'); return; }
    if (rows.some(group => group.id !== editing.id && group.name.toLowerCase() === name.toLowerCase())) { setError('A group with this name already exists.'); return; }
    const group = { ...editing, name };
    setRemoved(null);
    save(groups.some(item => item.id === group.id) ? groups.map(item => item.id === group.id ? group : item) : [...groups, group]);
    setQuery(''); setFocusGroup(group.id); closeEditor(false);
  };
  return <section className="example-gallery" aria-label="Example gallery">
    <div className="gallery-heading"><h2>Models</h2><div className="gallery-tools">
      <input type="search" aria-label="Search examples" placeholder="Find a model in any group…" value={query} onChange={event => setQuery(event.target.value)} />
      <button type="button" ref={createButton} disabled={!!opening || !!editing} aria-expanded={!!editing} onClick={() => edit({ id: crypto.randomUUID(), name: '', models: [] })}>+ New group</button>
    </div></div>
    {editing && <form className="gallery-group-editor" aria-label="Edit model group" onSubmit={event => { event.preventDefault(); saveGroup(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); } }}>
      <label>Group name<input autoFocus aria-label="Group name" maxLength={60} required value={editing.name} onChange={event => { setEditing({ ...editing, name: event.target.value }); setError(''); }} /></label>
      <fieldset><legend>Models in this group</legend>{showcaseExamples.map(example => <label key={example.id}><input type="checkbox" checked={editing.models.includes(example.id)} onChange={event => setEditing({ ...editing, models: event.target.checked ? [...editing.models, example.id] : editing.models.filter(id => id !== example.id) })} />{example.title}</label>)}</fieldset>
      <small>Personal groups are saved in this browser.</small>
      {error && <p role="alert">{error}</p>}
      <div className="gallery-group-buttons"><button type="submit">Save group</button><button type="button" onClick={() => closeEditor()}>Cancel</button>
        {groups.some(group => group.id === editing.id) && <button type="button" onClick={() => { const index = groups.findIndex(group => group.id === editing.id); setRemoved({ group: groups[index], index }); save(groups.filter(group => group.id !== editing.id)); closeEditor(); }}>Remove group</button>}
      </div>
    </form>}
    {temporary && <p role="status" className="gallery-footnote">Personal groups are temporary because browser storage is unavailable.</p>}
    {removed && <div className="gallery-group-undo" role="status">Removed {removed.group.name}. <button type="button" onClick={() => { if (!groups.some(group => group.id === removed.group.id)) save([...groups.slice(0, removed.index), removed.group, ...groups.slice(removed.index)]); setQuery(''); setFocusGroup(removed.group.id); setRemoved(null); }}>Undo remove group</button></div>}
    {visibleRows.map(({ group, items }) => {
      return <GalleryRow key={group.id} name={group.name} count={items.length} revision={items.map(item => item.id).join(',')}
        focusRequested={focusGroup === group.id} onFocusHandled={() => setFocusGroup(null)}
        actions={groups.some(item => item.id === group.id) && <button type="button" className="gallery-edit-group" disabled={!!opening || !!editing} aria-label={`Edit ${group.name} group`} onClick={() => edit(group)}>Edit group</button>}>
        {items.map(example => <button className="showcase-card" key={example.id} disabled={!!opening || !!unavailableReason || !!editing} onClick={() => onOpen(example.id)} aria-label={`Open ${example.title}`}>
          <div className="showcase-image"><ShowcaseThumbnail source={example.thumbnail} title={example.title} /></div>
          <div className="showcase-copy"><h4>{({ atlas: 'ATLAS', guitar: 'Guitar', house: 'House', bracket: 'Mounting plate', bolt: 'CODEX bolt' } as Record<string, string>)[example.id] ?? example.title}</h4><span aria-hidden="true">{opening === example.id ? 'Opening…' : '↗'}</span></div>
        </button>)}
        {!items.length && <p className="gallery-empty-group">Add models with Edit group.</p>}
      </GalleryRow>;
    })}
    {!visibleRows.length && <p className="empty-state" role="status">No models match. Try a different name, group or category.</p>}
    {unavailableReason && <p className="gallery-footnote" role="status">{unavailableReason}</p>}
  </section>;
}

function ShowcaseThumbnail({ source, title }: { source: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="preview-unavailable">Preview unavailable<span>Open the source project to build its geometry.</span></div>
    : <img src={source} alt={`${title} wireframe from Aetheris geometry`} loading="lazy" onError={() => setFailed(true)} />;
}

import { useEffect, useState } from 'react';
import { showcaseExamples } from './catalog';

export type GalleryGroup = { id: string; name: string; models: string[] };
export const defaultGroups: readonly GalleryGroup[] = [
  { id: 'basic', name: 'Basic', models: ['basic-bracket', 'paperclip'] },
  { id: 'advanced', name: 'Advanced', models: ['atlas', 'guitar', 'house', 'bracket', 'bolt'] },
];
const KEY = 'helios-example-groups-v1', CHANGED = 'helios-example-groups-changed';
const knownModels = new Set(showcaseExamples.map(example => example.id));

export function readGroups(): GalleryGroup[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const seen = new Set(defaultGroups.map(group => group.id));
    const names = new Set(defaultGroups.map(group => group.name.toLowerCase()));
    return stored.flatMap(group => {
      if (!group || typeof group.id !== 'string' || seen.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.models)) return [];
      const name = group.name.trim().slice(0, 60);
      if (names.has(name.toLowerCase())) return [];
      seen.add(group.id); names.add(name.toLowerCase());
      return [{ id: group.id, name, models: [...new Set(group.models.filter((id: unknown): id is string => typeof id === 'string' && knownModels.has(id)))] as string[] }];
    });
  } catch { return []; }
}

export function useGalleryGroups() {
  const [groups, setGroups] = useState(readGroups), [temporary, setTemporary] = useState(false);
  useEffect(() => {
    const changed = () => { setGroups(readGroups()); setTemporary(false); };
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) changed(); };
    window.addEventListener(CHANGED, changed); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(CHANGED, changed); window.removeEventListener('storage', storage); };
  }, []);
  const save = (next: GalleryGroup[]) => {
    setGroups(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setTemporary(false); window.dispatchEvent(new Event(CHANGED)); }
    catch { setTemporary(true); }
  };
  return { groups, save, temporary };
}

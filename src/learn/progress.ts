import { useEffect, useState } from 'react';
const key = 'helios.learning.progress.v1';
export type Progress = Record<string, number[]>;
export function readProgress(): Progress {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, steps]) => Array.isArray(steps)).map(([id, steps]) => [id, [...new Set((steps as unknown[]).filter((s): s is number => Number.isInteger(s) && Number(s) >= 0 && Number(s) < 3))]]));
  } catch { return {}; }
}
export function useLearningProgress() {
  const [progress, setProgress] = useState(readProgress);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setProgress(readProgress()); };
    addEventListener('storage', sync); return () => removeEventListener('storage', sync);
  }, []);
  const update = (id: string, step: number | null) => setProgress(current => {
    const next = { ...current, [id]: step === null ? [] : current[id]?.includes(step) ? current[id].filter(n => n !== step) : [...(current[id] ?? []), step] };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* learning remains usable with storage disabled */ }
    return next;
  });
  return { progress, update };
}

import { useSyncExternalStore } from 'react';
import type { ThemeName } from '../app/types';

// 'mars' and 'sirius' are the themes' former names; a stored choice keeps its look.
export const readTheme = (): ThemeName => {
  let stored: string | null = null;
  try { stored = localStorage.getItem('helios-theme'); } catch { /* storage can be unavailable */ }
  return stored === 'bronze-age' || stored === 'mars' ? 'bronze-age' : 'apollonia';
};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const setTheme = (theme: ThemeName) => {
  try { localStorage.setItem('helios-theme', theme); } catch { /* the choice still applies to this page */ }
  document.documentElement.dataset.theme = theme;
  listeners.forEach(listener => listener());
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme);
  return [theme, setTheme] as const;
}

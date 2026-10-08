import { useSyncExternalStore } from 'react';
import type { ThemeName } from '../app/types';

export const readTheme = (): ThemeName => localStorage.getItem('helios-theme') === 'mars' ? 'mars' : 'sirius';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const setTheme = (theme: ThemeName) => {
  localStorage.setItem('helios-theme', theme);
  document.documentElement.dataset.theme = theme;
  listeners.forEach(listener => listener());
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme);
  return [theme, setTheme] as const;
}

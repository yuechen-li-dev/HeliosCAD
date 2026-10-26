import { packProject } from './localProject';

/** The editor's latest source, kept outside React so it survives a render crash that unmounts the editor. */
export interface RecoverableSource { root: string; documents: Record<string, string> }

let latest: (() => RecoverableSource | null) | null = null;

/** The editor registers a reader once; it is replaced, never cleared, so the crash screen can still use it. */
export function registerRecoverableSource(read: () => RecoverableSource | null) { latest = read; }

export function recoverableSource(): RecoverableSource | null {
  try { const value = latest?.(); return value && Object.keys(value.documents).length ? value : null; } catch { return null; }
}

/** Downloads one document as text, or the whole workspace as the same .helios.zip that Save workspace writes. */
export function downloadRecoveredSource(value: RecoverableSource) {
  const names = Object.keys(value.documents);
  const blob = names.length === 1
    ? new Blob([value.documents[names[0]]], { type: 'text/plain' })
    : new Blob([Uint8Array.from(packProject(value)).buffer], { type: 'application/zip' });
  const name = names.length === 1 ? names[0] : `${value.root.replace(/\.[^.]+$/, '')}.helios.zip`;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

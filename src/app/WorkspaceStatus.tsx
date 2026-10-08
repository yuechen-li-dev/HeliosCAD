import type { Diagnostic, ModelSession } from '@aetheris/cad';
import type { BusyState, ThemeName, ViewMode } from './types';

export function WorkspaceStatus({ busy, elapsed, runtimeName, model, sourceRevision, displayRevision, diagnostics, timing, theme, viewMode, onRestart }: {
  busy: BusyState; elapsed: number; runtimeName: string; model: ModelSession | null;
  sourceRevision: number; displayRevision: number | null; diagnostics: readonly Diagnostic[];
  timing: { label: string; milliseconds: number } | null; theme: ThemeName; viewMode: ViewMode; onRestart(): void;
}) {
  const stale = model && displayRevision !== sourceRevision;
  return <footer className="statusbar">
    <span className={`status-ready ${diagnostics.some(item => item.severity === 'error') ? 'has-diagnostics' : ''}`} role="status"><i />{busy ?? (model ? 'READY' : 'NO MODEL')}{busy === 'Building' || busy === 'Initializing Aetheris Worker' ? ` ${elapsed.toFixed(1)}s` : ''}</span>
    <span className="status-runtime">{runtimeName}</span>
    {stale && <span className="status-stale">MODEL OUT OF DATE · Last valid build</span>}
    <span>{model?.mesh.definitions.length ?? 0} DEFS · {model?.mesh.occurrences.length ?? 0} OCC</span>
    <span className={diagnostics.length ? 'has-diagnostics' : ''}>{diagnostics.length ? `⚠ ${diagnostics.length}` : '✓ 0'} DIAGNOSTICS</span>
    {timing && <span className="status-timing">{timing.label} {timing.milliseconds.toFixed(0)}MS</span>}
    <span className="status-spacer" /><span className="status-revisions" title="Source and displayed geometry have separate revisions">SOURCE REV {sourceRevision} · DISPLAY REV {displayRevision ?? '—'}</span><span>{viewMode.toUpperCase()}</span><span>{theme.toUpperCase()}</span>
    {busy === 'Worker failed' && <button onClick={onRestart}>Restart Worker</button>}
  </footer>;
}

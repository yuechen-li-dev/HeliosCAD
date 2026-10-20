import type { Diagnostic, ModelSession } from '@aetheris/cad';
import type { BusyState, ThemeName, ViewMode } from './types';

export function WorkspaceStatus({ busy, elapsed, runtimeName, model, sourceRevision, displayRevision, diagnostics, timing, theme, viewMode, onRestart }: {
  busy: BusyState; elapsed: number; runtimeName: string; model: ModelSession | null;
  sourceRevision: number; displayRevision: number | null; diagnostics: readonly Diagnostic[];
  timing: { label: string; milliseconds: number } | null; theme: ThemeName; viewMode: ViewMode; onRestart(): void;
}) {
  const stale = model && displayRevision !== sourceRevision;
  const definitions = model?.mesh.definitions.length ?? 0, occurrences = model?.mesh.occurrences.length ?? 0;
  const errors = diagnostics.some(item => item.severity === 'error');
  const problems = diagnostics.filter(item => item.severity !== 'info').length;
  const information = diagnostics.length - problems;
  const status = busy ?? (errors ? displayRevision === sourceRevision ? 'Needs attention' : 'Build failed' : model ? 'Ready' : 'No model');
  return <footer className="statusbar">
    <span className={`status-ready ${errors ? 'has-diagnostics' : ''}`} role="status"><i />{status}{busy === 'Building' || busy === 'Initializing Aetheris Worker' ? ` · ${elapsed.toFixed(1)} s` : ''}</span>
    <span className="status-runtime">{runtimeName}</span>
    {stale && <span className="status-stale">Out of date · showing the last good build</span>}
    {model && <span>{plural(definitions, 'definition')} · {plural(occurrences, 'occurrence')}</span>}
    <span className={problems ? 'has-diagnostics' : ''}>{problems ? `⚠ ${plural(problems, 'problem')}` : 'No problems'}</span>
    {information > 0 && <span>{information} info</span>}
    {timing && <span className="status-timing">{timing.label} {timing.milliseconds.toFixed(0)} ms</span>}
    <span className="status-spacer" />
    <span className="status-revisions" title="Source and displayed geometry have separate revisions">{displayRevision === null ? `Revision ${sourceRevision} · not built yet` : displayRevision === sourceRevision ? `Revision ${sourceRevision}` : `Source revision ${sourceRevision} · showing ${displayRevision}`}</span>
    <span>{viewMode === 'perspective' ? 'Perspective' : 'Orthographic'}</span>
    <span>{theme === 'bronze-age' ? 'Bronze Age' : 'Apollonia'}</span>
    {busy === 'Worker failed' && <button onClick={onRestart}>Restart worker</button>}
  </footer>;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

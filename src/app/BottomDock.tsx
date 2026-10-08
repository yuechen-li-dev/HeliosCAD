import { useEffect, useRef, useState } from 'react';
import type { Diagnostic } from '@aetheris/cad';
import type { BusyState } from './types';

type DockTab = 'terminal' | 'output' | 'errors';

interface Props {
  diagnostics: readonly Diagnostic[];
  busy: BusyState;
  sourceName: string;
  sourceRevision: number;
  displayRevision: number | null;
  lastTiming: { label: string; milliseconds: number } | null;
  events: readonly string[];
  onDiagnosticClick(diagnostic: Diagnostic): void;
  collapsed?: boolean;
  onToggle?(): void;
}

export function BottomDock({ diagnostics, busy, sourceName, sourceRevision, displayRevision, lastTiming, events, onDiagnosticClick, collapsed, onToggle }: Props) {
  const [tab, setTab] = useState<DockTab>('output');
  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const outputRef = useRef<HTMLPreElement>(null);
  const terminalAvailable = Boolean(import.meta.hot);
  const tabs: readonly (readonly [DockTab, string])[] = terminalAvailable
    ? [['errors', 'Problems'], ['output', 'Output'], ['terminal', 'Terminal · local']]
    : [['errors', 'Problems'], ['output', 'Output']];

  useEffect(() => {
    if (!import.meta.hot || tab !== 'terminal') return;
    const onOutput = (payload: { text: string }) => setTerminalOutput(value => (value + payload.text).slice(-100_000));
    import.meta.hot.on('helios:terminal-output', onOutput);
    import.meta.hot.send('helios:terminal-start', {});
    return () => { import.meta.hot?.off?.('helios:terminal-output', onOutput); import.meta.hot?.send('helios:terminal-stop', {}); };
  }, [tab]);
  useEffect(() => { if (diagnostics.some(item => item.severity === 'error')) setTab('errors'); }, [diagnostics]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [terminalOutput, tab]);

  const runCommand = () => {
    if (!command.trim() || !import.meta.hot) return;
    import.meta.hot.send('helios:terminal-input', { text: command + '\n' });
    setCommand('');
  };

  return <section className="bottom-dock" aria-label="Bottom pane">
    <div className="dock-tabs" role="tablist" aria-label="Bottom pane tabs">
      {tabs.map(([id, label]) => <button key={id} role="tab" aria-label={label} aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); if (collapsed) onToggle?.(); }}>{label}{id === 'errors' && diagnostics.length > 0 && <span className="badge error">{diagnostics.length}</span>}</button>)}
      <button className="dock-collapse" aria-label={collapsed ? 'Expand bottom panel' : 'Collapse bottom panel'} onClick={onToggle}>{collapsed ? '⌃' : '⌄'}</button>
    </div>
    <div className="bottom-content" hidden={collapsed}>
      <div className="terminal-panel" hidden={tab !== 'terminal'}>
        <pre ref={outputRef} aria-label="Terminal output">{terminalAvailable ? terminalOutput || 'Starting local PowerShell…' : 'Local terminal is available with npm run dev.'}</pre>
        {terminalAvailable && <div className="terminal-command"><span>PS&gt;</span><input aria-label="Terminal command" value={command} onChange={event => setCommand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runCommand(); }} placeholder="Enter a command" /><button onClick={runCommand}>Run</button></div>}
      </div>
      {tab === 'output' && <div className="dock-output"><p>{busy ?? 'Ready'} · {sourceName}</p><p>Source revision {sourceRevision} · displayed model revision {displayRevision ?? '—'}</p>{lastTiming && <p>{lastTiming.label} · {lastTiming.milliseconds.toFixed(0)} ms</p>}{displayRevision !== sourceRevision && displayRevision !== null && <p>Showing the last successful build.</p>}{events.map((event, index) => <p key={index}>{event}</p>)}</div>}
      {tab === 'errors' && <div className="dock-errors">{diagnostics.length ? diagnostics.map((diagnostic, index) => <button key={`${diagnostic.code}-${index}`} onClick={() => onDiagnosticClick(diagnostic)}><span className={diagnostic.severity}>{diagnostic.severity}</span><span>{diagnostic.source ? `${diagnostic.source.source}:${diagnostic.source.line}:${diagnostic.source.column}` : sourceName}</span><span>{diagnostic.message}</span><small>{diagnostic.code}{diagnostic.details && ` · ${diagnostic.details}`}</small></button>) : <p>No language or build diagnostics.</p>}</div>}
    </div>
  </section>;
}

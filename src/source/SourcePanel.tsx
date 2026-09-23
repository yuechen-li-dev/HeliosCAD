import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Diagnostic, SourceReference } from '@aetheris/cad';

export interface SourcePanelHandle {
  focusAt(reference?: SourceReference): void;
  cursor(): number;
  insert(value: string, offset?: number): void;
}

interface Props {
  disabled?: boolean;
  source: string;
  diagnostics: readonly Diagnostic[];
  onSourceChange(value: string): void;
  onRebuild(): void;
  onDiagnosticClick(diagnostic: Diagnostic): void;
  onCursorChange?(offset: number): void;
  onInsert?(value: string, offset: number): void;
  fileName?: string;
  dirty?: boolean;
}

export const SourcePanel = forwardRef<SourcePanelHandle, Props>(function SourcePanel({ source, diagnostics, onSourceChange, onRebuild, onDiagnosticClick, onCursorChange, onInsert, fileName, dirty, disabled = false }, ref) {
  const [tab, setTab] = useState<'source' | 'diagnostics'>('source');
  const editor = useRef<HTMLTextAreaElement>(null);
  const lastCursor = useRef(-1);
  const lines = useMemo(() => Array.from({ length: Math.max(1, source.split('\n').length) }, (_, i) => i + 1), [source]);
  const focusAt = (reference?: SourceReference) => {
    setTab('source');
    const offset = reference ? Math.max(0, Math.min(source.length, reference.start)) : editor.current?.selectionStart ?? 0;
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(offset, offset + (reference?.length ?? 0)); editor.current?.scrollIntoView?.({ block: 'nearest' }); });
  };
  useImperativeHandle(ref, () => ({ focusAt, cursor: () => editor.current && document.activeElement === editor.current ? editor.current.selectionStart : lastCursor.current,
    insert: (value, offset = editor.current?.selectionStart ?? source.length) => { onInsert?.(value, offset); setTab('source'); requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(offset, offset); }); }
  }), [source, onInsert]);
  const jumpToDiagnostic = (diagnostic: Diagnostic) => { onDiagnosticClick(diagnostic); if (diagnostic.source) focusAt(diagnostic.source); };
  return <section className="panel source-panel" aria-label="Firmament source and diagnostics">
    <div className="bottom-tabs">
      <button className={tab === 'source' ? 'active' : ''} onClick={() => setTab('source')}>{fileName ?? 'FIRMAMENT SOURCE'} {dirty ? '●' : ''}</button>
      <button className={tab === 'diagnostics' ? 'active' : ''} onClick={() => setTab('diagnostics')}>PROBLEMS <span className={diagnostics.some(item => item.severity === 'error') ? 'badge error' : 'badge'}>{diagnostics.length}</span></button>
      <button className="rebuild-inline" onClick={onRebuild} disabled={disabled}>↻ Rebuild</button>
    </div>
    {tab === 'source' ? <div className="code-editor">
      <pre aria-hidden="true">{lines.join('\n')}</pre>
      <textarea ref={editor} aria-label="Firmament source" spellCheck={false} disabled={disabled} value={source} onChange={event => { lastCursor.current = event.currentTarget.selectionStart; onSourceChange(event.target.value); }} onClick={event => { lastCursor.current = event.currentTarget.selectionStart; onCursorChange?.(lastCursor.current); }} onKeyUp={event => { lastCursor.current = event.currentTarget.selectionStart; onCursorChange?.(lastCursor.current); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); onRebuild(); } }} />
    </div> : <div className="diagnostic-list">
      {diagnostics.length ? diagnostics.map((diagnostic, index) => <button key={`${diagnostic.code}-${index}`} className={`diagnostic ${diagnostic.severity}`} onClick={() => jumpToDiagnostic(diagnostic)}>
        <span className="severity-dot">●</span><strong>{diagnostic.code}</strong><span>{diagnostic.message}</span><small>{diagnostic.source ? `${diagnostic.source.source}:${diagnostic.source.line}:${diagnostic.source.column}` : ''}</small>
      </button>) : <div className="diagnostic-ok"><span>✓</span> Model is clean. No diagnostics.</div>}
    </div>}
  </section>;
});

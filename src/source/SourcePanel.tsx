import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as editorApi from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/documentSemanticTokens.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js';
import type * as Monaco from 'monaco-editor';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { Diagnostic, ModelSession, SourceReference } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { diagnosticMarkers, FirmamentLanguageClient } from './FirmamentLanguageClient';

const monaco = editorApi as unknown as typeof Monaco;
let nextDocumentId = 0;
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.languages.register({ id: 'firmament' });
monaco.languages.setLanguageConfiguration('firmament', { brackets: [['{', '}'], ['(', ')'], ['[', ']']], autoClosingPairs: [{ open: '{', close: '}' }, { open: '(', close: ')' }, { open: '[', close: ']' }] });
monaco.editor.defineTheme('helios-mars', {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C99A4C', fontStyle: 'bold' },
    { token: 'construct', foreground: 'E4BD75', fontStyle: 'bold' },
    { token: 'type', foreground: 'B8C6B6' },
    { token: 'field', foreground: 'B9CDB9' },
    { token: 'identifier', foreground: 'E4E8DB' },
    { token: 'number', foreground: '95C69E' },
    { token: 'unit', foreground: '78B68C' },
    { token: 'value', foreground: '91C7A0' },
    { token: 'selector', foreground: 'C4B681' },
    { token: 'string', foreground: 'A6C28C' },
    { token: 'comment', foreground: '758D7B', fontStyle: 'italic' },
    { token: 'punctuation', foreground: '829086' },
  ],
  colors: { 'editor.background': '#101713', 'editor.foreground': '#E4E8DB', 'editorCursor.foreground': '#D7AD62',
    'editor.selectionBackground': '#486C50', 'editor.inactiveSelectionBackground': '#334B39',
    'editor.lineHighlightBackground': '#1A261E', 'editorLineNumber.foreground': '#6C8273',
    'editorLineNumber.activeForeground': '#B2C2AD', 'editorIndentGuide.background1': '#2E3F33',
    'editorWidget.background': '#1C2520', 'editorWidget.border': '#48544C',
    'editorSuggestWidget.selectedBackground': '#314538', 'editorHoverWidget.background': '#1C2520',
    'scrollbarSlider.background': '#3C534399', 'scrollbarSlider.hoverBackground': '#57755FBB',
    'editorError.foreground': '#D86850', 'editorWarning.foreground': '#D79245' }
});
monaco.editor.defineTheme('helios-sirius', {
  base: 'vs', inherit: true,
  rules: [
    { token: 'keyword', foreground: '906017', fontStyle: 'bold' }, { token: 'construct', foreground: '875819', fontStyle: 'bold' },
    { token: 'field', foreground: '315F44' }, { token: 'number', foreground: '317F56' }, { token: 'unit', foreground: '317F56' },
    { token: 'value', foreground: '317F56' }, { token: 'string', foreground: '43774D' },
    { token: 'comment', foreground: '718174', fontStyle: 'italic' }, { token: 'punctuation', foreground: '839087' }
  ],
  colors: { 'editor.background': '#ECEEEA', 'editor.foreground': '#252B28', 'editorCursor.foreground': '#A66E16',
    'editor.selectionBackground': '#C9DCC8', 'editor.lineHighlightBackground': '#DFE7DF',
    'editorWidget.background': '#F5F4EF', 'editorWidget.border': '#AEB4AF', 'editorError.foreground': '#B83E2D' }
});

export interface SourcePanelHandle { focusAt(reference?: SourceReference): void; cursor(): number; insert(value: string, offset?: number): void; replace(reference: SourceReference, expected: string, replacement: string): boolean; formatDocument(): Promise<void> }
interface Props {
  disabled?: boolean; source: string; diagnostics: readonly Diagnostic[]; runtime?: CadRuntime; model?: ModelSession | null;
  selectedSelector?: string | null; theme?: 'mars' | 'sirius'; onSourceChange(value: string): void; onRebuild(): void;
  onDiagnosticClick(diagnostic: Diagnostic): void; onCursorChange?(offset: number): void; onInsert?(value: string, offset: number): void;
  onLiveDiagnostics?(diagnostics: readonly Diagnostic[]): void; onLanguageError?(error: unknown): void;
  fileName?: string; dirty?: boolean;
}

export const SourcePanel = forwardRef<SourcePanelHandle, Props>(function SourcePanel({ source, diagnostics, runtime, model, selectedSelector, theme = 'mars', onSourceChange, onRebuild, onDiagnosticClick, onCursorChange, onInsert, onLiveDiagnostics, onLanguageError, fileName = 'model.firmament', dirty, disabled = false }, ref) {
  const [tab, setTab] = useState<'source' | 'diagnostics'>('source');
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const documentId = useRef(0);
  if (documentId.current === 0) documentId.current = ++nextDocumentId;
  const client = useRef(runtime ? new FirmamentLanguageClient(runtime) : null);
  const lastCursor = useRef(-1);
  const sourceRef = useRef(source);
  const onCursorChangeRef = useRef(onCursorChange);
  const onRebuildRef = useRef(onRebuild);
  const onLiveDiagnosticsRef = useRef(onLiveDiagnostics);
  const onLanguageErrorRef = useRef(onLanguageError);
  sourceRef.current = source;
  onCursorChangeRef.current = onCursorChange;
  onRebuildRef.current = onRebuild;
  onLiveDiagnosticsRef.current = onLiveDiagnostics;
  onLanguageErrorRef.current = onLanguageError;
  client.current?.update(source, fileName, model ?? null, selectedSelector ?? null);
  useEffect(() => { const registration = client.current?.register(monaco); return () => registration?.dispose(); }, []);
  useEffect(() => { const document = editor.current?.getModel(); if (document) monaco.editor.setModelMarkers(document, 'aetheris', diagnosticMarkers(monaco, document, diagnostics)); }, [diagnostics, fileName]);
  useEffect(() => {
    if (!client.current || !onLiveDiagnosticsRef.current) return;
    let current = true;
    const timer = setTimeout(() => { void client.current?.analyze(source).then(result => {
      if (current && result) onLiveDiagnosticsRef.current?.(result.diagnostics);
    }); }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [source, fileName]);

  const focusAt = (reference?: SourceReference) => {
    setTab('source');
    requestAnimationFrame(() => {
      const instance = editor.current; const document = instance?.getModel(); if (!instance || !document) return;
      const start = document.getPositionAt(reference?.start ?? Math.max(0, lastCursor.current));
      const end = document.getPositionAt((reference?.start ?? Math.max(0, lastCursor.current)) + (reference?.length ?? 0));
      instance.setSelection(new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column));
      instance.revealLineInCenter(start.lineNumber); instance.focus();
    });
  };
  useImperativeHandle(ref, () => ({ focusAt, cursor: () => lastCursor.current,
    formatDocument: async () => {
      const instance = editor.current, document = instance?.getModel();
      if (!instance || !document || !client.current) return;
      const original = document.getValue();
      const position = instance.getPosition();
      const offset = position ? document.getOffsetAt(position) : 0;
      try {
        const result = await client.current.format(original);
        if (!result?.changed || document.isDisposed() || document.getValue() !== original) return;
        instance.pushUndoStop();
        instance.executeEdits('aetheris-format', [{ range: document.getFullModelRange(), text: result.text }]);
        instance.pushUndoStop();
        instance.setPosition(document.getPositionAt(Math.min(offset, result.text.length)));
        instance.focus();
      } catch (error) { onLanguageErrorRef.current?.(error); }
    },
    replace: (reference, expected, replacement) => {
      const instance = editor.current; const document = instance?.getModel();
      if (!instance || !document || document.getValue() !== sourceRef.current ||
          document.getValue().slice(reference.start, reference.start + reference.length) !== expected) return false;
      const start = document.getPositionAt(reference.start); const end = document.getPositionAt(reference.start + reference.length);
      instance.pushUndoStop();
      instance.executeEdits('helios-inspector', [{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: replacement }]);
      instance.pushUndoStop();
      return true;
    },
    insert: (value, offset) => {
      const instance = editor.current; const document = instance?.getModel();
      const at = offset ?? (document && instance?.getPosition() ? document.getOffsetAt(instance.getPosition()!) : sourceRef.current.length);
      if (document && instance) { const position = document.getPositionAt(at); instance.executeEdits('helios', [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: value }]); focusAt(); }
      else onInsert?.(value, at);
    }
  }), [onInsert]);
  const onMount: OnMount = instance => {
    editor.current = instance;
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRebuildRef.current());
    const reportCursor = () => { const position = instance.getPosition(); const offset = position ? instance.getModel()?.getOffsetAt(position) ?? -1 : -1; if (offset >= 0) { lastCursor.current = offset; onCursorChangeRef.current?.(offset); } };
    instance.onDidChangeCursorPosition(() => { if (instance.hasTextFocus()) reportCursor(); });
    instance.onDidFocusEditorText(reportCursor);
    const document = instance.getModel(); if (document) monaco.editor.setModelMarkers(document, 'aetheris', diagnosticMarkers(monaco, document, diagnostics));
  };
  const jumpToDiagnostic = (diagnostic: Diagnostic) => { onDiagnosticClick(diagnostic); if (diagnostic.source) focusAt(diagnostic.source); };
  return <section className="panel source-panel" aria-label="Firmament source and diagnostics">
    <div className="bottom-tabs">
      <button className={tab === 'source' ? 'active' : ''} onClick={() => setTab('source')}>{fileName} {dirty ? '●' : ''}</button>
      <button className={tab === 'diagnostics' ? 'active' : ''} onClick={() => setTab('diagnostics')}>PROBLEMS <span className={diagnostics.some(item => item.severity === 'error') ? 'badge error' : 'badge'}>{diagnostics.length}</span></button>
      <button className="rebuild-inline" onClick={onRebuild} disabled={disabled}>↻ Rebuild</button>
    </div>
    <div className="code-editor" style={{ display: tab === 'source' ? undefined : 'none' }} aria-label="Firmament editor">
      <Editor path={`/document-${documentId.current}/${fileName}`} language="firmament" theme={theme === 'sirius' ? 'helios-sirius' : 'helios-mars'} value={source} onChange={value => { client.current?.update(value ?? '', fileName, model ?? null, selectedSelector ?? null); onSourceChange(value ?? ''); }} onMount={onMount}
        options={{ fontFamily: 'Consolas, monospace', fontSize: 14, lineNumbers: 'on', minimap: { enabled: false }, automaticLayout: true, readOnly: false, wordWrap: 'off', tabSize: 2, scrollBeyondLastLine: false, quickSuggestions: true, suggestOnTriggerCharacters: true, wordBasedSuggestions: 'off', 'semanticHighlighting.enabled': true }} />
    </div>
    {tab === 'diagnostics' && <div className="diagnostic-list">
      {diagnostics.length ? diagnostics.map((diagnostic, index) => <button key={`${diagnostic.code}-${index}`} className={`diagnostic ${diagnostic.severity}`} onClick={() => jumpToDiagnostic(diagnostic)}>
        <span className="severity-dot">●</span><strong>{diagnostic.code}</strong><span>{diagnostic.message}</span><small>{diagnostic.source ? `${diagnostic.source.source}:${diagnostic.source.line}:${diagnostic.source.column}` : ''}</small>
      </button>) : <div className="diagnostic-ok"><span>✓</span> Model is clean. No diagnostics.</div>}
    </div>}
  </section>;
});

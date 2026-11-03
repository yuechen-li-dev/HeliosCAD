import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as editorApi from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/documentSemanticTokens.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import '../../node_modules/monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js';
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
// Immediate lexical colors and quote/comment behavior while compiler semantic
// tokens are in flight. All Firmament vocabulary and meaning stay in Aetheris.
monaco.languages.setMonarchTokensProvider('firmament', {
  tokenizer: {
    root: [[/\/\/.*$/, 'comment'], [/\/\*/, 'comment', '@comment'], [/"/, 'string', '@string'],
      [/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'], [/[{}()[\]]/, '@brackets'], [/[A-Za-z_]\w*/, 'identifier']],
    comment: [[/[^*/]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[*/]/, 'comment']],
    string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
  }
});
monaco.languages.setLanguageConfiguration('firmament', {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['(', ')'], ['[', ']']],
  autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }, { open: '(', close: ')', notIn: ['string', 'comment'] }, { open: '[', close: ']', notIn: ['string', 'comment'] }, { open: '"', close: '"', notIn: ['string', 'comment'] }],
  surroundingPairs: [{ open: '{', close: '}' }, { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '"', close: '"' }],
});
monaco.editor.defineTheme('helios-bronze-age', {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C99A4C', fontStyle: 'bold' },
    { token: 'construct', foreground: 'DFB878', fontStyle: 'bold' },
    { token: 'type', foreground: 'B8C6B6' },
    { token: 'field', foreground: 'B8C3D0' },
    { token: 'identifier', foreground: 'E4E8DB' },
    { token: 'number', foreground: '95C69E' },
    { token: 'unit', foreground: '78B68C' },
    { token: 'value', foreground: '91C7A0' },
    { token: 'selector', foreground: 'C4B681' },
    { token: 'string', foreground: 'A6C28C' },
    { token: 'comment', foreground: '7C8B9A', fontStyle: 'italic' },
    { token: 'punctuation', foreground: '829086' },
  ],
  colors: { 'editor.background': '#101713', 'editor.foreground': '#F0EADB', 'editorCursor.foreground': '#C99843',
    'editor.selectionBackground': '#394936', 'editor.inactiveSelectionBackground': '#283528',
    'editor.lineHighlightBackground': '#1C2520', 'editorLineNumber.foreground': '#738273',
    'editorLineNumber.activeForeground': '#B8C6B6', 'editorIndentGuide.background1': '#303B34',
    'editorWidget.background': '#1C2520', 'editorWidget.border': '#48544C',
    'editorSuggestWidget.selectedBackground': '#354535', 'editorHoverWidget.background': '#1C2520',
    'scrollbarSlider.background': '#48544C80', 'scrollbarSlider.hoverBackground': '#647563BB',
    'editorError.foreground': '#D86850', 'editorWarning.foreground': '#D79245' }
});
// Apollonia: structure in ink, vocabulary in gold, values in one deep petrol so a
// number never reads as a name. Brackets stay quiet; colour is for meaning only.
monaco.editor.defineTheme('helios-apollonia', {
  base: 'vs', inherit: true,
  rules: [
    { token: '', foreground: '111111' },
    { token: 'keyword', foreground: '7A5310', fontStyle: 'bold' },
    { token: 'construct', foreground: '111111', fontStyle: 'bold' },
    { token: 'type', foreground: '7A5310' },
    { token: 'identifier', foreground: '111111' },
    { token: 'field', foreground: '55524B' },
    { token: 'number', foreground: '0E5A6B' },
    { token: 'unit', foreground: '0E5A6B' },
    { token: 'value', foreground: '0E5A6B' },
    { token: 'selector', foreground: '7A5310', fontStyle: 'italic' },
    { token: 'string', foreground: '0E5A6B' },
    { token: 'comment', foreground: '8B877E', fontStyle: 'italic' },
    { token: 'punctuation', foreground: '9A968D' },
  ],
  colors: {
    'editor.background': '#FFFFFF', 'editor.foreground': '#111111', 'editorCursor.foreground': '#111111',
    'editor.selectionBackground': '#F1DFB8', 'editor.inactiveSelectionBackground': '#F6ECD6',
    'editor.selectionHighlightBackground': '#F6ECD699', 'editor.wordHighlightBackground': '#F6ECD6',
    'editor.findMatchBackground': '#E9CF95', 'editor.findMatchHighlightBackground': '#F6ECD6',
    'editor.lineHighlightBackground': '#FAF8F3', 'editor.lineHighlightBorder': '#00000000',
    'editorLineNumber.foreground': '#B5B1A8', 'editorLineNumber.activeForeground': '#111111',
    'editorIndentGuide.background1': '#EEEBE4', 'editorIndentGuide.activeBackground1': '#D6D2C8',
    'editorBracketMatch.background': '#F6ECD6', 'editorBracketMatch.border': '#A8741A',
    'editorBracketHighlight.foreground1': '#8A867D', 'editorBracketHighlight.foreground2': '#8A867D',
    'editorBracketHighlight.foreground3': '#8A867D', 'editorBracketHighlight.foreground4': '#8A867D',
    'editorBracketHighlight.foreground5': '#8A867D', 'editorBracketHighlight.foreground6': '#8A867D',
    'editorWhitespace.foreground': '#E3E0D8', 'editorRuler.foreground': '#EEEBE4',
    'editorWidget.background': '#FFFFFF', 'editorWidget.border': '#111111', 'editorWidget.foreground': '#111111',
    'editorSuggestWidget.background': '#FFFFFF', 'editorSuggestWidget.border': '#111111',
    'editorSuggestWidget.selectedBackground': '#F6ECD6', 'editorSuggestWidget.highlightForeground': '#7A5310',
    'editorHoverWidget.background': '#FFFFFF', 'editorHoverWidget.border': '#111111',
    'editorGutter.background': '#FFFFFF',
    'scrollbarSlider.background': '#1111111F', 'scrollbarSlider.hoverBackground': '#11111138', 'scrollbarSlider.activeBackground': '#A8741A80',
    'editorError.foreground': '#B3261E', 'editorWarning.foreground': '#9A5B12', 'editorInfo.foreground': '#0E5A6B',
    'editorOverviewRuler.border': '#00000000',
  }
});

export interface SourcePanelHandle { focusAt(reference?: SourceReference): void; cursor(): number; insert(value: string, offset?: number): void; replace(reference: SourceReference, expected: string, replacement: string): boolean; formatDocument(): Promise<void>; history(direction: 'undo' | 'redo'): Promise<void> }
// Monaco stores one EOL style per document; normalize before starting builds so
// opening or applying external edits cannot invalidate their source revision.
export function editorSource(source: string): string { return source.replace(/\r\n?|\n/g, source.includes('\r\n') ? '\r\n' : '\n'); }
interface Props {
  disabled?: boolean; source: string; diagnostics: readonly Diagnostic[]; runtime?: CadRuntime; model?: ModelSession | null;
  selectedSelector?: string | null; theme?: 'bronze-age' | 'apollonia'; onSourceChange(value: string): number | void; onRebuild(): void;
  onDiagnosticClick(diagnostic: Diagnostic): void; onCursorChange?(offset: number): void; onInsert?(value: string, offset: number): void;
  onLiveDiagnostics?(diagnostics: readonly Diagnostic[]): void; onLanguageError?(error: unknown): void;
  onNavigateSource?(reference: SourceReference): void;
  fileName?: string; dirty?: boolean;
  sourceRevision?: number;
  onHistoryState?(state: { undo: boolean; redo: boolean }): void;
  onHistoryApplied?(source: string): void;
}

export const SourcePanel = forwardRef<SourcePanelHandle, Props>(function SourcePanel({ source, diagnostics, runtime, model, selectedSelector, theme = 'bronze-age', onSourceChange, onRebuild, onDiagnosticClick, onCursorChange, onInsert, onLiveDiagnostics, onLanguageError, onNavigateSource, onHistoryState, onHistoryApplied, fileName = 'model.firmament', dirty, sourceRevision, disabled = false }, ref) {
  const [tab, setTab] = useState<'source' | 'diagnostics'>('source');
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('helios-word-wrap') === 'on');
  useEffect(() => { localStorage.setItem('helios-word-wrap', wordWrap ? 'on' : 'off'); }, [wordWrap]);
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const documentId = useRef(0);
  if (documentId.current === 0) documentId.current = ++nextDocumentId;
  const client = useRef(runtime ? new FirmamentLanguageClient(runtime) : null);
  const lastCursor = useRef(-1);
  const sourceRef = useRef(source);
  const sourceState = useRef({ source, fileName, sourceRevision, model, selectedSelector });
  const onSourceChangeRef = useRef(onSourceChange); onSourceChangeRef.current = onSourceChange;
  const localEdit = useRef<{ fileName: string; revision: number } | null>(null);
  const syncingSource = useRef(false);
  const onCursorChangeRef = useRef(onCursorChange);
  const onRebuildRef = useRef(onRebuild);
  const onLiveDiagnosticsRef = useRef(onLiveDiagnostics);
  const onLanguageErrorRef = useRef(onLanguageError);
  const onNavigateSourceRef = useRef(onNavigateSource); onNavigateSourceRef.current = onNavigateSource;
  const historyCallbacks = useRef({ onHistoryState, onHistoryApplied }); historyCallbacks.current = { onHistoryState, onHistoryApplied };
  const reportHistory = () => { const document = editor.current?.getModel(); historyCallbacks.current.onHistoryState?.({ undo: document?.canUndo() ?? false, redo: document?.canRedo() ?? false }); };
  useEffect(() => { queueMicrotask(reportHistory); }, [source, fileName]);
  const freshSnapshot = localEdit.current?.fileName !== fileName || sourceRevision === undefined || sourceRevision >= localEdit.current.revision;
  if (freshSnapshot) { sourceRef.current = source; sourceState.current = { source, fileName, sourceRevision, model, selectedSelector }; }
  onCursorChangeRef.current = onCursorChange;
  onRebuildRef.current = onRebuild;
  onLiveDiagnosticsRef.current = onLiveDiagnostics;
  onLanguageErrorRef.current = onLanguageError;
  if (freshSnapshot) client.current?.update(source, fileName, model ?? null, selectedSelector ?? null);
  const publishEditorSource = (value: string) => {
    const state = sourceState.current;
    sourceRef.current = value;
    sourceState.current = { ...state, source: value };
    client.current?.update(value, state.fileName, state.model ?? null, state.selectedSelector ?? null);
    const revision = onSourceChangeRef.current(value);
    if (typeof revision === 'number') localEdit.current = { fileName: state.fileName, revision };
  };
  const syncSourceFromProps = () => {
    const state = sourceState.current, instance = editor.current, document = instance?.getModel();
    if (!instance || !document || document.uri.path !== `/document-${documentId.current}/${state.fileName}` ||
        localEdit.current?.fileName === state.fileName && state.sourceRevision !== undefined && state.sourceRevision < localEdit.current.revision) return;
    if (document.getValue() !== state.source) {
      syncingSource.current = true;
      try {
        instance.pushUndoStop();
        document.setEOL(state.source.includes('\r\n') ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
        instance.executeEdits('helios-source', [{ range: document.getFullModelRange(), text: state.source }]); instance.pushUndoStop();
      } finally { syncingSource.current = false; }
    }
    // Monaco uses one line ending per document. Publish any normalization so
    // compiler offsets, project snapshots and editor requests see the same text.
    if (document.getValue() !== state.source) publishEditorSource(document.getValue());
  };
  useLayoutEffect(syncSourceFromProps, [source, fileName, sourceRevision]);
  useEffect(() => {
    const registration = client.current?.register(monaco, {
      ownsDocument: document => editor.current?.getModel() === document,
      onFormatError: error => onLanguageErrorRef.current?.(error),
      onNavigate: reference => onNavigateSourceRef.current?.(reference),
    });
    return () => registration?.dispose();
  }, []);
  useEffect(() => { const document = editor.current?.getModel(); if (document) monaco.editor.setModelMarkers(document, 'aetheris', diagnosticMarkers(monaco, document, diagnostics, fileName)); }, [diagnostics, fileName]);
  useEffect(() => {
    if (!freshSnapshot || !client.current || !onLiveDiagnosticsRef.current) return;
    let current = true;
    const timer = setTimeout(() => { void client.current?.analyze(source).then(result => {
      if (current && result) onLiveDiagnosticsRef.current?.(result.diagnostics);
    }); }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [source, fileName]);

  const focusAt = (reference?: SourceReference) => {
    setTab('source');
    requestAnimationFrame(() => {
      const instance = editor.current; const document = instance?.getModel(); if (!instance || !document || document.isDisposed()) return;
      const start = document.getPositionAt(reference?.start ?? Math.max(0, lastCursor.current));
      const end = document.getPositionAt((reference?.start ?? Math.max(0, lastCursor.current)) + (reference?.length ?? 0));
      instance.setSelection(new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column));
      instance.revealLineInCenter(start.lineNumber); instance.focus();
    });
  };
  const formatDocument = async () => {
    const instance = editor.current;
    if (!instance || disabled) return;
    setTab('source');
    await instance.getAction('editor.action.formatDocument')?.run();
    instance.focus();
  };
  useImperativeHandle(ref, () => ({ focusAt, cursor: () => lastCursor.current,
    history: async direction => {
      const document = editor.current?.getModel(); if (!document || disabled) return;
      editor.current?.pushUndoStop();
      if (direction === 'undo' && document.canUndo()) await document.undo();
      if (direction === 'redo' && document.canRedo()) await document.redo();
      reportHistory();
    },
    formatDocument,
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
  }), [onInsert, disabled]);
  const onMount: OnMount = instance => {
    editor.current = instance;
    instance.onDidChangeModel(() => { syncSourceFromProps(); reportHistory(); });
    instance.onDidChangeModelContent(event => {
      const document = instance.getModel(), value = document?.getValue();
      if (!syncingSource.current && value !== undefined) publishEditorSource(value);
      queueMicrotask(() => {
        reportHistory();
        if ((event.isUndoing || event.isRedoing) && document === instance.getModel() && value === document?.getValue())
          historyCallbacks.current.onHistoryApplied?.(value!);
      });
    });
    reportHistory();
    syncSourceFromProps();
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRebuildRef.current());
    instance.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => setWordWrap(value => !value));
    // A self-hosted proportional font can arrive after Monaco's first measurement.
    // Refresh its layout once Inter loads so cursor and wrap positions stay exact.
    void window.document.fonts.load('14px "Inter Variable"').then(() => {
      if (editor.current === instance && instance.getDomNode()?.isConnected) { monaco.editor.remeasureFonts(); instance.layout(); }
    });
    const reportCursor = () => { const position = instance.getPosition(); const offset = position ? instance.getModel()?.getOffsetAt(position) ?? -1 : -1; if (offset >= 0) { lastCursor.current = offset; onCursorChangeRef.current?.(offset); } };
    instance.onDidChangeCursorPosition(() => { if (instance.hasTextFocus()) reportCursor(); });
    instance.onDidFocusEditorText(reportCursor);
    const document = instance.getModel(); if (document) monaco.editor.setModelMarkers(document, 'aetheris', diagnosticMarkers(monaco, document, diagnostics, fileName));
  };
  const jumpToDiagnostic = (diagnostic: Diagnostic) => { onDiagnosticClick(diagnostic); if (diagnostic.source) focusAt(diagnostic.source); };
  return <section className="panel source-panel" aria-label="Firmament source and diagnostics">
    <div className="bottom-tabs">
      <button className={tab === 'source' ? 'active' : ''} onClick={() => setTab('source')}>{fileName} {dirty ? '●' : ''}</button>
      <button className={tab === 'diagnostics' ? 'active' : ''} onClick={() => setTab('diagnostics')}>Problems <span className={diagnostics.some(item => item.severity === 'error') ? 'badge error' : 'badge'}>{diagnostics.length}</span></button>
      <button className="word-wrap-toggle" aria-label="Toggle word wrap" aria-pressed={wordWrap} title="Word wrap · Alt+Z" onClick={() => { setTab('source'); setWordWrap(value => !value); }}>{wordWrap ? 'Wrap on' : 'Wrap'}</button>
      <button title="Format document · Shift+Alt+F" aria-label="Format document" disabled={disabled || !runtime} onClick={() => void formatDocument()}>Format</button>
      <button className="rebuild-inline" onClick={onRebuild} disabled={disabled}>↻ Rebuild</button>
    </div>
    <div className="code-editor" style={{ display: tab === 'source' ? undefined : 'none' }} aria-label="Firmament editor">
      <Editor path={`/document-${documentId.current}/${fileName}`} language="firmament" theme={theme === 'apollonia' ? 'helios-apollonia' : 'helios-bronze-age'} defaultValue={source} onMount={onMount}
        options={{ fontFamily: '"Inter Variable", Inter, sans-serif', fontSize: 14, fontWeight: '400', fontLigatures: '"cv05", "cv08"', lineNumbers: 'on', minimap: { enabled: false }, automaticLayout: true, readOnly: false, wordWrap: wordWrap ? 'on' : 'off', wrappingStrategy: 'advanced', scrollbar: { vertical: 'visible', verticalScrollbarSize: 14, horizontalScrollbarSize: 10, useShadows: false }, tabSize: 2, insertSpaces: true, detectIndentation: false, scrollBeyondLastLine: false, quickSuggestions: { other: true, comments: false, strings: false }, suggestOnTriggerCharacters: true, wordBasedSuggestions: 'off', snippetSuggestions: 'top', 'semanticHighlighting.enabled': true }} />
    </div>
    {tab === 'diagnostics' && <div className="diagnostic-list">
      {diagnostics.length ? diagnostics.map((diagnostic, index) => <button key={`${diagnostic.code}-${index}`} className={`diagnostic ${diagnostic.severity}`} onClick={() => jumpToDiagnostic(diagnostic)}>
        <span className="severity-dot">●</span><strong>{diagnostic.code}</strong><span>{diagnostic.message}</span><small>{diagnostic.source ? `${diagnostic.source.source}:${diagnostic.source.line}:${diagnostic.source.column}` : ''}</small>
      </button>) : <div className="diagnostic-ok"><span>✓</span> Model is clean. No diagnostics.</div>}
    </div>}
  </section>;
});

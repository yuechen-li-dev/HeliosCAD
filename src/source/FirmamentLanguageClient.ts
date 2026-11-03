import type { Diagnostic, LanguageAnalysis, LanguageCompletion, LanguageFormat, LanguageHover, ModelSession, SourceReference } from '@aetheris/cad';
import type * as Monaco from 'monaco-editor';
import type { CadRuntime } from '../sdk/CadRuntime';

const languageId = 'firmament';
const tokenTypes = ['keyword', 'construct', 'type', 'identifier', 'field', 'number', 'unit', 'string', 'comment', 'punctuation', 'selector', 'value'];
interface EditorCallbacks {
  ownsDocument?(document: Monaco.editor.ITextModel): boolean;
  onFormatError?(error: unknown): void;
  onNavigate?(reference: SourceReference): void;
}

export class FirmamentLanguageClient {
  private revision = 0;
  private source = '';
  private sourceName = 'model.firmament';
  private model: ModelSession | null = null;
  private selectedSelector: string | null = null;
  private analysisCache: { revision: number; request: Promise<LanguageAnalysis | null> } | null = null;

  constructor(private readonly runtime: CadRuntime) {}

  update(source: string, sourceName: string, model: ModelSession | null, selectedSelector: string | null) {
    if (source !== this.source || sourceName !== this.sourceName) { this.revision++; this.analysisCache = null; }
    this.source = source; this.sourceName = sourceName; this.model = model; this.selectedSelector = selectedSelector;
  }

  async complete(source: string, offset: number): Promise<LanguageCompletion | null> {
    const revision = this.revision;
    if (source !== this.source) return null;
    try {
      const start = performance.now();
      const result = await this.runtime.complete(source, offset, this.sourceName, String(revision));
      performance.measure('helios-lx-complete', { start, end: performance.now() });
      return revision === this.revision && result.document === this.sourceName && result.revision === String(revision) ? result : null;
    } catch (error) { console.warn('Firmament completion unavailable', error); return null; }
  }

  async analyze(source: string): Promise<LanguageAnalysis | null> {
    if (source !== this.source) return null;
    if (this.analysisCache?.revision === this.revision) return this.analysisCache.request;
    const revision = this.revision;
    const request = (async () => {
      try {
        const start = performance.now();
        const result = await this.runtime.analyze(source, this.sourceName, String(revision));
        performance.measure('helios-lx-analyze', { start, end: performance.now() });
        return revision === this.revision && result.document === this.sourceName && result.revision === String(revision) ? result : null;
      } catch (error) { console.warn('Firmament analysis unavailable', error); return null; }
    })();
    this.analysisCache = { revision, request }; return request;
  }

  async hover(source: string, offset: number): Promise<LanguageHover | null> {
    if (source !== this.source) return null;
    const revision = this.revision;
    try {
      const start = performance.now();
      const result = await this.runtime.hover(source, offset, this.sourceName, String(revision));
      performance.measure('helios-lx-hover', { start, end: performance.now() });
      return revision === this.revision && result?.document === this.sourceName && result.revision === String(revision) ? result : null;
    } catch { return null; }
  }

  async definition(source: string, offset: number): Promise<SourceReference | null> {
    if (source !== this.source) return null;
    const revision = this.revision;
    try {
      const result = await this.runtime.definition(source, offset, this.sourceName, String(revision));
      return revision === this.revision ? result : null;
    } catch { return null; }
  }

  async format(source: string): Promise<LanguageFormat | null> {
    if (source !== this.source) return null;
    const revision = this.revision;
    try {
      const start = performance.now();
      const result = await this.runtime.format(source, this.sourceName, String(revision));
      performance.measure('helios-lx-format', { start, end: performance.now() });
      return revision === this.revision && result.document === this.sourceName && result.revision === String(revision) ? result : null;
    } catch (error) { if (revision === this.revision) throw error; return null; }
  }

  register(monaco: typeof Monaco, callbacks: EditorCallbacks = {}): Monaco.IDisposable {
    const owns = (document: Monaco.editor.ITextModel) => !document.isDisposed() && (callbacks.ownsDocument?.(document) ?? true);
    const current = (document: Monaco.editor.ITextModel, version: number, cancellation: Monaco.CancellationToken) =>
      !cancellation.isCancellationRequested && owns(document) && document.getVersionId() === version;
    const completion = monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [':', '.', '(', '<'],
      provideCompletionItems: async (document, position, _context, cancellation) => {
        if (!owns(document) || cancellation.isCancellationRequested) return { suggestions: [] };
        const source = document.getValue(), version = document.getVersionId(), offset = document.getOffsetAt(position);
        const result = await this.complete(source, offset);
        if (!result || result.context === 'Literal' || !current(document, version, cancellation)) return { suggestions: [] };
        const start = document.getPositionAt(result.replaceStart), end = document.getPositionAt(result.replaceStart + result.replaceLength);
        const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
        const hasColon = /^\s*:/.test(source.slice(result.replaceStart + result.replaceLength));
        const suggestions: Monaco.languages.CompletionItem[] = result.fields.map(field => ({
          label: field.spelling ?? field.name, filterText: field.spelling ?? field.name,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: `${field.spelling ?? field.name}${hasColon ? '' : ': '}`, range,
          sortText: `${field.required ? '0' : '1'}${field.name}`,
          detail: `${field.type}${field.required ? ' · required' : ''}`,
          documentation: [field.meaning, field.choices?.length ? `Choices: ${field.choices.join(', ')}` : '', field.default ? `Default: ${field.default}` : ''].filter(Boolean).join('\n\n'),
          ...(!hasColon && field.choices?.length ? { command: { id: 'editor.action.triggerSuggest', title: 'Choose value' } } : {})
        }));
        for (const value of result.values ?? []) suggestions.push({
          label: value, kind: monaco.languages.CompletionItemKind.EnumMember, insertText: value, range,
          sortText: `0${value}`, detail: 'Aetheris schema value'
        });
        for (const symbol of result.symbols ?? []) suggestions.push({
          label: symbol.name, kind: symbol.kind === 'function' ? monaco.languages.CompletionItemKind.Function : symbol.kind === 'type' ? monaco.languages.CompletionItemKind.Class : monaco.languages.CompletionItemKind.Variable,
          insertText: symbol.name, range, detail: symbol.detail, sortText: `1${symbol.name}`
        });
        for (const entry of result.entries ?? []) suggestions.push({
          label: { label: entry.name, description: entry.context }, filterText: entry.name,
          kind: monaco.languages.CompletionItemKind.Snippet, insertText: entry.snippet ?? entry.insertText ?? entry.source,
          ...(entry.snippet ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet } : {}),
          range, detail: 'Aetheris entry template', documentation: `Owner: ${entry.context}\n\n\`\`\`firmament\n${entry.source}\n\`\`\``, sortText: `2${entry.name}`
        });
        // Only the compiler-qualified identities of the last successful build are offered.
        const selectorStart = source.slice(0, offset).match(/face\s*\([^)]*$/i);
        if (selectorStart && this.model) {
          const selectors = this.model.selectorCandidates('Face').filter(candidate => candidate.buildRevision === this.model?.revision && candidate.qualification !== 'RuntimeOnly');
          const selectorPosition = document.getPositionAt(offset - selectorStart[0].length);
          const selectorEnd = source[offset] === ')' ? document.getPositionAt(offset + 1) : position;
          const selectorRange = new monaco.Range(selectorPosition.lineNumber, selectorPosition.column, selectorEnd.lineNumber, selectorEnd.column);
          for (const candidate of selectors) suggestions.push({ label: candidate.selector, kind: monaco.languages.CompletionItemKind.Reference,
            insertText: candidate.selector, range: selectorRange, detail: `${candidate.outputRole ?? 'Qualified face selector'} · last build`,
            sortText: candidate.selector === this.selectedSelector ? '0000' : `1${candidate.selector}` });
        }
        return { suggestions };
      }
    });
    const semantic = monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
      getLegend: () => ({ tokenTypes, tokenModifiers: [] }),
      provideDocumentSemanticTokens: async (document, _lastResultId, cancellation) => {
        if (!owns(document) || cancellation.isCancellationRequested) return null;
        const version = document.getVersionId();
        const result = await this.analyze(document.getValue());
        if (!result || !current(document, version, cancellation)) return null;
        const encoded: number[] = [];
        let previousLine = 0, previousColumn = 0;
        for (const token of result.tokens) {
          const start = document.getPositionAt(token.start), end = document.getPositionAt(token.start + token.length);
          for (let line = start.lineNumber; line <= end.lineNumber; line++) {
            const column = line === start.lineNumber ? start.column : 1;
            const length = (line === end.lineNumber ? end.column : document.getLineMaxColumn(line)) - column;
            if (length <= 0) continue;
            const zeroLine = line - 1, zeroColumn = column - 1;
            encoded.push(zeroLine - previousLine, zeroLine === previousLine ? zeroColumn - previousColumn : zeroColumn,
              length, Math.max(0, tokenTypes.indexOf(token.kind)), 0);
            previousLine = zeroLine; previousColumn = zeroColumn;
          }
        }
        return { data: new Uint32Array(encoded) };
      },
      releaseDocumentSemanticTokens: () => undefined,
    });
    const hover = monaco.languages.registerHoverProvider(languageId, { provideHover: async (document, position, cancellation) => {
      if (!owns(document) || cancellation.isCancellationRequested) return null;
      const version = document.getVersionId(), info = await this.hover(document.getValue(), document.getOffsetAt(position));
      if (!info || !current(document, version, cancellation)) return null;
      const start = document.getPositionAt(info.start), end = document.getPositionAt(info.start + info.length);
      return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), contents: [{ value: `**${info.title}**\n\n${info.description}` }] };
    } });
    const definition = monaco.languages.registerDefinitionProvider(languageId, { provideDefinition: async (document, position, cancellation) => {
      if (!owns(document) || cancellation.isCancellationRequested) return null;
      const version = document.getVersionId(), reference = await this.definition(document.getValue(), document.getOffsetAt(position));
      if (!reference || !current(document, version, cancellation)) return null;
      if (reference.source === this.sourceName) {
        const start = document.getPositionAt(reference.start), end = document.getPositionAt(reference.start + reference.length);
        return { uri: document.uri, range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column) };
      }
      if (!callbacks.onNavigate) return null;
      const prefix = document.uri.path.slice(0, -this.sourceName.length);
      const uri = document.uri.with({ path: prefix + reference.source, query: new URLSearchParams({
        source: reference.source, start: String(reference.start), length: String(reference.length), line: String(reference.line), column: String(reference.column)
      }).toString() });
      return { uri, range: new monaco.Range(reference.line, reference.column, reference.line, reference.column + reference.length) };
    } });
    const opener = callbacks.onNavigate ? monaco.editor.registerEditorOpener({ openCodeEditor: (sourceEditor, resource) => {
      const document = sourceEditor.getModel();
      if (!document || !owns(document) || resource.path === document.uri.path) return false;
      const prefix = document.uri.path.slice(0, -this.sourceName.length);
      if (!resource.path.startsWith(prefix)) return false;
      const values = new URLSearchParams(resource.query), source = values.get('source');
      if (!source || resource.path !== prefix + source) return false;
      const reference = { source, start: Number(values.get('start')), length: Number(values.get('length')), line: Number(values.get('line')), column: Number(values.get('column')) };
      if (![reference.start, reference.length, reference.line, reference.column].every(Number.isSafeInteger) || reference.start < 0 || reference.length < 0 || reference.line < 1 || reference.column < 1) return false;
      callbacks.onNavigate?.(reference); return true;
    } }) : undefined;
    const formatting = monaco.languages.registerDocumentFormattingEditProvider(languageId, { provideDocumentFormattingEdits: async (document, _options, cancellation) => {
      if (!owns(document) || cancellation.isCancellationRequested) return [];
      const version = document.getVersionId();
      try {
        const result = await this.format(document.getValue());
        return result?.changed && current(document, version, cancellation) ? [{ range: document.getFullModelRange(), text: result.text }] : [];
      } catch (error) { if (current(document, version, cancellation)) callbacks.onFormatError?.(error); return []; }
    } });
    return { dispose: () => { completion.dispose(); semantic.dispose(); hover.dispose(); definition.dispose(); opener?.dispose(); formatting.dispose(); } };
  }
}

export function diagnosticMarkers(monaco: typeof Monaco, model: Monaco.editor.ITextModel, diagnostics: readonly Diagnostic[], sourceName = model.uri.path.replace(/^\/document-\d+\//, '')): Monaco.editor.IMarkerData[] {
  const normalize = (name: string) => name.replaceAll('\\', '/');
  return diagnostics.filter(item => item.source && normalize(item.source.source) === normalize(sourceName)).map(item => {
    const source = item.source!;
    const start = model.getPositionAt(source.start), end = model.getPositionAt(source.start + Math.max(source.length, 1));
    return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber,
      endColumn: start.lineNumber === end.lineNumber && start.column === end.column ? end.column + 1 : end.column,
      message: item.message, code: item.code, severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
      source: 'Aetheris' };
  });
}

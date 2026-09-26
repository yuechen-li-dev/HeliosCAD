import type { Diagnostic, LanguageAnalysis, LanguageCompletion, LanguageFormat, LanguageHover, ModelSession, SourceReference } from '@aetheris/cad';
import type * as Monaco from 'monaco-editor';
import type { CadRuntime } from '../sdk/CadRuntime';

const languageId = 'firmament';
const tokenTypes = ['keyword', 'construct', 'type', 'identifier', 'field', 'number', 'unit', 'string', 'comment', 'punctuation', 'selector', 'value'];

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
    this.source = source;
    this.sourceName = sourceName;
    this.model = model;
    this.selectedSelector = selectedSelector;
  }

  async complete(source: string, offset: number): Promise<LanguageCompletion | null> {
    const revision = this.revision;
    if (source !== this.source) return null;
    try {
      const start = performance.now();
      const result = await this.runtime.complete(source, offset, this.sourceName, String(revision));
      performance.measure('helios-lx-complete', { start, end: performance.now() });
      return revision === this.revision && result.revision === String(revision) ? result : null;
    } catch (error) {
      console.warn('Firmament completion unavailable', error);
      return null;
    }
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
        return revision === this.revision && result.revision === String(revision) ? result : null;
      } catch (error) { console.warn('Firmament analysis unavailable', error); return null; }
    })();
    this.analysisCache = { revision, request };
    return request;
  }

  async hover(source: string, offset: number): Promise<LanguageHover | null> {
    if (source !== this.source) return null;
    const revision = this.revision;
    try {
      const start = performance.now();
      const result = await this.runtime.hover(source, offset, this.sourceName, String(revision));
      performance.measure('helios-lx-hover', { start, end: performance.now() });
      return revision === this.revision && result?.revision === String(revision) ? result : null;
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
    const start = performance.now();
    const result = await this.runtime.format(source, this.sourceName, String(revision));
    performance.measure('helios-lx-format', { start, end: performance.now() });
    return revision === this.revision && result.revision === String(revision) ? result : null;
  }

  register(monaco: typeof Monaco): Monaco.IDisposable {
    const completion = monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [' ', '{', ':', '.', '(', '+', '-'],
      provideCompletionItems: async (document, position) => {
        const source = document.getValue();
        const offset = document.getOffsetAt(position);
        const result = await this.complete(source, offset);
        if (document.isDisposed() || source !== this.source) return { suggestions: [] };
        const start = document.getPositionAt(result?.replaceStart ?? offset);
        const end = document.getPositionAt((result?.replaceStart ?? offset) + (result?.replaceLength ?? 0));
        const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
        const suggestions: Monaco.languages.CompletionItem[] = (result?.fields ?? []).map((field, index) => ({
          label: field.name,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: `${field.name}: `,
          range,
          sortText: String(index).padStart(4, '0'),
          detail: `${field.type}${field.required ? ' · required' : ''}`,
          documentation: [field.meaning, field.choices?.length ? `Choices: ${field.choices.join(', ')}` : '', field.default ? `Default: ${field.default}` : ''].filter(Boolean).join('\n\n')
        }));
        for (const [index, value] of (result?.values ?? []).entries()) suggestions.push({
          label: value, kind: monaco.languages.CompletionItemKind.EnumMember, insertText: value, range,
          sortText: `0${String(index).padStart(4, '0')}`, detail: 'Aetheris schema value'
        });
        for (const entry of result?.entries ?? []) {
          const wholeDraft = source.trim() === source.slice(result!.replaceStart, result!.replaceStart + result!.replaceLength).trim();
          suggestions.push({ label: `${entry.name} · ${entry.context}`, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wholeDraft || entry.context.startsWith('Model') && !entry.source.startsWith('Model ') ? entry.source : entry.name,
            range: wholeDraft ? document.getFullModelRange() : range,
            detail: 'Aetheris canonical entry template',
            documentation: `Legal owner: ${entry.context}\n\n${entry.source}`,
            sortText: `0${entry.name}` });
        }
        // These are compiler-qualified candidates from the current built model.
        // Never derive selectors from tessellation or display IDs.
        const selectorStart = source.slice(0, offset).match(/face\s*\([^)]*$/i);
        if (selectorStart && this.model) {
          const selectors = this.model.selectorCandidates('Face').filter(candidate => candidate.buildRevision === this.model?.revision && candidate.qualification !== 'RuntimeOnly');
          const selectorOffset = offset - selectorStart[0].length;
          const selectorPosition = document.getPositionAt(selectorOffset);
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
      provideDocumentSemanticTokens: async document => {
        const result = await this.analyze(document.getValue());
        if (!result || document.isDisposed()) return { data: new Uint32Array() };
        const encoded: number[] = [];
        let previousLine = 0, previousColumn = 0;
        for (const token of result.tokens) {
          const start = document.getPositionAt(token.start);
          const end = document.getPositionAt(token.start + token.length);
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
    const hover = monaco.languages.registerHoverProvider(languageId, { provideHover: async (document, position) => {
      const info = await this.hover(document.getValue(), document.getOffsetAt(position));
      if (!info) return null;
      const start = document.getPositionAt(info.start), end = document.getPositionAt(info.start + info.length);
      return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), contents: [{ value: `**${info.title}**\n\n${info.description}` }] };
    } });
    const definition = monaco.languages.registerDefinitionProvider(languageId, { provideDefinition: async (document, position) => {
      const source = await this.definition(document.getValue(), document.getOffsetAt(position));
      if (!source || source.source !== this.sourceName) return null;
      const start = document.getPositionAt(source.start), end = document.getPositionAt(source.start + source.length);
      return { uri: document.uri, range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column) };
    } });
    const formatting = monaco.languages.registerDocumentFormattingEditProvider(languageId, { provideDocumentFormattingEdits: async document => {
      try { const result = await this.format(document.getValue()); return result?.changed ? [{ range: document.getFullModelRange(), text: result.text }] : []; }
      catch { return []; }
    } });
    return { dispose: () => { completion.dispose(); semantic.dispose(); hover.dispose(); definition.dispose(); formatting.dispose(); } };
  }
}

export function diagnosticMarkers(monaco: typeof Monaco, model: Monaco.editor.ITextModel, diagnostics: readonly Diagnostic[]): Monaco.editor.IMarkerData[] {
  return diagnostics.filter(item => item.source && item.source.source === model.uri.path.split('/').at(-1)).map(item => {
    const source = item.source!;
    const start = model.getPositionAt(source.start);
    const end = model.getPositionAt(source.start + Math.max(source.length, 1));
    return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column,
      message: item.message, code: item.code, severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
      source: 'Aetheris' };
  });
}

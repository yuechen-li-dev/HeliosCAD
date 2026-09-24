import type { Diagnostic, LanguageCompletion, ModelSession } from '@aetheris/cad';
import type * as Monaco from 'monaco-editor';
import type { CadRuntime } from '../sdk/CadRuntime';

const languageId = 'firmament';

export class FirmamentLanguageClient {
  private revision = 0;
  private source = '';
  private sourceName = 'model.firmament';
  private model: ModelSession | null = null;
  private selectedSelector: string | null = null;

  constructor(private readonly runtime: CadRuntime) {}

  update(source: string, sourceName: string, model: ModelSession | null, selectedSelector: string | null) {
    if (source !== this.source || sourceName !== this.sourceName) this.revision++;
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

  register(monaco: typeof Monaco): Monaco.IDisposable {
    const registration = monaco.languages.registerCompletionItemProvider(languageId, {
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
        for (const entry of result?.entries ?? []) {
          const wholeDraft = source.trim() === source.slice(result!.replaceStart, result!.replaceStart + result!.replaceLength).trim();
          suggestions.push({ label: `${entry.name} · ${entry.context}`, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wholeDraft ? entry.source : entry.name,
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
    return registration;
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

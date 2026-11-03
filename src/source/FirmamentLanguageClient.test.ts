import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LanguageAnalysis, LanguageCompletion, LanguageFormat } from '@aetheris/cad';
import * as editorApi from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import type * as Monaco from 'monaco-editor';
import type { CadRuntime } from '../sdk/CadRuntime';
import { diagnosticMarkers, FirmamentLanguageClient } from './FirmamentLanguageClient';

const monaco = editorApi as unknown as typeof Monaco;
const models: Monaco.editor.ITextModel[] = [];
let modelId = 0;
function document(source: string, name = 'part.firmament') {
  const model = monaco.editor.createModel(source, 'plaintext', monaco.Uri.parse(`file:///document-${++modelId}/${name}`));
  models.push(model); return model;
}
afterEach(() => { for (const model of models.splice(0)) model.dispose(); });
const cancellation = () => ({ isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
function providers(client: FirmamentLanguageClient, model: Monaco.editor.ITextModel, callbacks = {}) {
  let completion!: Monaco.languages.CompletionItemProvider, formatting!: Monaco.languages.DocumentFormattingEditProvider;
  let definition!: Monaco.languages.DefinitionProvider, opener!: Monaco.editor.ICodeEditorOpener;
  const disposable = () => ({ dispose: vi.fn() });
  const api = { ...monaco, languages: { ...monaco.languages,
    registerCompletionItemProvider: (_id: string, value: Monaco.languages.CompletionItemProvider) => { completion = value; return disposable(); },
    registerDocumentSemanticTokensProvider: disposable, registerHoverProvider: disposable,
    registerDefinitionProvider: (_id: string, value: Monaco.languages.DefinitionProvider) => { definition = value; return disposable(); },
    registerDocumentFormattingEditProvider: (_id: string, value: Monaco.languages.DocumentFormattingEditProvider) => { formatting = value; return disposable(); },
  }, editor: { ...monaco.editor, registerEditorOpener: (value: Monaco.editor.ICodeEditorOpener) => { opener = value; return disposable(); } } } as unknown as typeof Monaco;
  const registration = client.register(api, { ownsDocument: candidate => candidate === model, ...callbacks });
  return { completion, formatting, definition, opener, registration };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const reply = (overrides: Partial<LanguageCompletion> = {}): LanguageCompletion => ({ document: 'part.firmament', revision: '1', context: 'Box', replaceStart: 0, replaceLength: 4, fields: [], missingRequiredFields: [], ...overrides });

describe('FirmamentLanguageClient revisions', () => {
  it('discards a late response after the source changes', async () => {
    let resolve!: (value: LanguageCompletion) => void;
    const pending = new Promise<LanguageCompletion>(done => { resolve = done; });
    const runtime = { complete: vi.fn(() => pending) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime);
    client.update('Helix H {', 'test.firmament', null, null);
    const request = client.complete('Helix H {', 9);
    client.update('Helix H {\nRadius:', 'test.firmament', null, null);
    resolve({ document: 'test.firmament', revision: '1', context: 'Helix', replaceStart: 9, replaceLength: 0, fields: [], missingRequiredFields: [] });
    expect(await request).toBeNull();
  });
});

describe('editor providers', () => {
  it('replaces a complete field word using compiler spelling without duplicating an existing colon', async () => {
    const model = document('Size: [10mm, 8mm, 4mm]');
    const runtime = { complete: vi.fn(async () => reply({ fields: [{ name: 'Size', spelling: 'size', type: 'Vector3', required: false, meaning: 'Dimensions' }] })) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update(model.getValue(), 'part.firmament', null, null);
    const { completion, registration } = providers(client, model);
    const result = await completion.provideCompletionItems(model, model.getPositionAt(2), {} as Monaco.languages.CompletionContext, cancellation());
    expect(result?.suggestions[0]).toMatchObject({ label: 'size', insertText: 'size', range: { startColumn: 1, endColumn: 5 } }); registration.dispose();
  });

  it('inserts compiler-prepared templates and tab stops without reinterpreting their context', async () => {
    const model = document('Bo');
    const runtime = { complete: vi.fn(async () => reply({ replaceLength: 2, entries: [{ constructId: 'Box', name: 'Box', context: 'Model or Struct', source: 'reference example', insertText: 'Box body {}', snippet: 'Box ${1:body} {}$0' }] })) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('Bo', 'part.firmament', null, null);
    const { completion, registration } = providers(client, model);
    const result = await completion.provideCompletionItems(model, model.getPositionAt(2), {} as Monaco.languages.CompletionContext, cancellation());
    expect(result?.suggestions[0]).toMatchObject({ insertText: 'Box ${1:body} {}$0', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }); registration.dispose();
  });

  it('never sends another editor document to this workspace runtime', async () => {
    const model = document('Bo'), foreign = document('Bo', 'other.firmament');
    const runtime = { complete: vi.fn() } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('Bo', 'part.firmament', null, null);
    const { completion, registration } = providers(client, model);
    expect(await completion.provideCompletionItems(foreign, foreign.getPositionAt(2), {} as Monaco.languages.CompletionContext, cancellation())).toEqual({ suggestions: [] });
    expect(runtime.complete).not.toHaveBeenCalled(); registration.dispose();
  });

  it('discards a cancelled completion even when its runtime response is current', async () => {
    const model = document('Bo'), pending = deferred<LanguageCompletion>(), token = cancellation();
    const runtime = { complete: vi.fn(() => pending.promise) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('Bo', 'part.firmament', null, null);
    const { completion, registration } = providers(client, model);
    const request = completion.provideCompletionItems(model, model.getPositionAt(2), {} as Monaco.languages.CompletionContext, token);
    token.isCancellationRequested = true; pending.resolve(reply());
    expect(await request).toEqual({ suggestions: [] }); registration.dispose();
  });

  it('does not apply a delayed formatter after typing or an edit-then-undo cycle', async () => {
    const model = document('original'), pending = deferred<LanguageFormat>();
    const runtime = { format: vi.fn(() => pending.promise) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('original', 'part.firmament', null, null);
    const { formatting, registration } = providers(client, model);
    const request = formatting.provideDocumentFormattingEdits(model, { tabSize: 2, insertSpaces: true }, cancellation());
    model.setValue('new typing'); client.update('new typing', 'part.firmament', null, null);
    model.setValue('original'); client.update('original', 'part.firmament', null, null);
    pending.resolve({ document: 'part.firmament', revision: '1', changed: true, text: 'old formatting' });
    expect(await request).toEqual([]); expect(model.getValue()).toBe('original'); registration.dispose();
  });

  it('reports formatting refusal and preserves the authored text', async () => {
    const model = document('unfinished'), onFormatError = vi.fn(), error = new Error('Fix syntax errors first');
    const runtime = { format: vi.fn(async () => { throw error; }) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('unfinished', 'part.firmament', null, null);
    const { formatting, registration } = providers(client, model, { onFormatError });
    expect(await formatting.provideDocumentFormattingEdits(model, { tabSize: 2, insertSpaces: true }, cancellation())).toEqual([]);
    expect(onFormatError).toHaveBeenCalledWith(error); expect(model.getValue()).toBe('unfinished'); registration.dispose();
  });

  it('navigates to a compiler-resolved project definition only when the editor opener is invoked', async () => {
    const model = document('library'), onNavigate = vi.fn();
    const reference = { source: 'parts/library.firmament', start: 11, length: 7, line: 2, column: 3 };
    const runtime = { definition: vi.fn(async () => reference) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('library', 'part.firmament', null, null);
    const { definition, opener, registration } = providers(client, model, { onNavigate });
    const location = await definition.provideDefinition(model, model.getPositionAt(2), cancellation()) as Monaco.languages.Location;
    expect(location.uri.path).toMatch(/parts\/library.firmament$/); expect(onNavigate).not.toHaveBeenCalled();
    expect(await opener.openCodeEditor({ getModel: () => model } as Monaco.editor.ICodeEditor, location.uri)).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith(reference); registration.dispose();
  });
});

describe('analysis and markers', () => {
  it('shares analysis for one source revision and invalidates it on a file switch with identical text', async () => {
    const runtime = { analyze: vi.fn(async (_source, document, revision) => ({ document, revision, tokens: [], diagnostics: [] } as LanguageAnalysis)) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime); client.update('same', 'a.firmament', null, null);
    await Promise.all([client.analyze('same'), client.analyze('same')]); expect(runtime.analyze).toHaveBeenCalledTimes(1);
    client.update('same', 'b.firmament', null, null); expect((await client.analyze('same'))?.document).toBe('b.firmament'); expect(runtime.analyze).toHaveBeenCalledTimes(2);
  });
  it('matches full project paths and gives an EOF diagnostic a visible marker range', () => {
    const model = document('Model m {}', 'parts/part.firmament');
    const markers = diagnosticMarkers(monaco, model, [
      { severity: 'error', code: 'EOF', message: 'Missing declaration', source: { source: 'parts/part.firmament', start: 10, length: 0, line: 1, column: 11 } },
      { severity: 'error', code: 'OTHER', message: 'Other file', source: { source: 'other/part.firmament', start: 0, length: 1, line: 1, column: 1 } },
    ], 'parts/part.firmament');
    expect(markers).toHaveLength(1); expect(markers[0].code).toBe('EOF'); expect(markers[0].endColumn).toBeGreaterThan(markers[0].startColumn);
  });
});

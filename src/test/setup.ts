import '@testing-library/jest-dom/vitest';
(document as Document & { queryCommandSupported?: (command: string) => boolean }).queryCommandSupported = () => false;
Object.defineProperty(document, 'fonts', { configurable: true, value: { load: async () => [] } });
import { vi } from 'vitest';
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  const monaco = await import('../../node_modules/monaco-editor/esm/vs/editor/editor.api.js');
  return { loader: { config: () => undefined }, default: function MockEditor({ path, value, defaultValue, onMount, onChange }: {
    path: string; value?: string; defaultValue?: string; onMount?: (editor: unknown) => void; onChange?: (value: string) => void;
  }) {
    const [, redraw] = React.useReducer(n => n + 1, 0);
    const state = React.useRef<ReturnType<typeof monaco.editor.createModel> | null>(null);
    const modelListeners = React.useRef<(() => void)[]>([]);
    const contentListeners = React.useRef<((event: unknown) => void)[]>([]);
    React.useLayoutEffect(() => {
      const model = monaco.editor.createModel(value ?? defaultValue ?? '', 'firmament', monaco.Uri.parse(`inmemory:${path}`));
      state.current = model;
      const subscription = model.onDidChangeContent(event => { contentListeners.current.forEach(listener => listener(event)); redraw(); });
      modelListeners.current.forEach(listener => listener()); redraw();
      return () => { subscription.dispose(); state.current = null; model.dispose(); };
    }, [path]);
    React.useEffect(() => {
      const disposable = { dispose() {} };
      onMount?.({ getModel: () => state.current, onDidChangeModel: (listener: () => void) => { modelListeners.current.push(listener); return disposable; },
        onDidChangeModelContent: (listener: (event: unknown) => void) => { contentListeners.current.push(listener); return disposable; },
        pushUndoStop() {}, executeEdits: (_source: string, edits: Parameters<NonNullable<typeof state.current>['applyEdits']>[0]) => state.current?.applyEdits(edits),
        addCommand() {}, getDomNode: () => null, onDidChangeCursorPosition: () => disposable, onDidFocusEditorText: () => disposable,
        getPosition: () => null, focus() {}, setSelection() {}, revealLineInCenter() {},
      });
    }, []);
    return React.createElement('textarea', { 'aria-label': 'Firmament source', value: state.current?.getValue() ?? value ?? defaultValue,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => { state.current?.setValue(event.target.value); onChange?.(event.target.value); } });
  } };
});
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as typeof ResizeObserver;
window.matchMedia ??= query => ({ matches: false, media: query, onchange: null,
  addListener: () => undefined, removeListener: () => undefined,
  addEventListener: () => undefined, removeEventListener: () => undefined,
  dispatchEvent: () => false });

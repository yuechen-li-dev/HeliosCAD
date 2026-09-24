import '@testing-library/jest-dom/vitest';
(document as Document & { queryCommandSupported?: (command: string) => boolean }).queryCommandSupported = () => false;
import { vi } from 'vitest';
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  return { loader: { config: () => undefined }, default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) =>
    React.createElement('textarea', { 'aria-label': 'Firmament source', value, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value) }) };
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

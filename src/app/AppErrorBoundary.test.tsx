import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';
import { registerRecoverableSource } from './crashRecovery';

function Broken(): never { throw new Error('render failed'); }

afterEach(() => { registerRecoverableSource(() => null); vi.restoreAllMocks(); });

it('replaces a crashed tree with a recovery screen that offers the latest source', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  registerRecoverableSource(() => ({ root: 'part.firmament', documents: { 'part.firmament': 'Model Part {}' } }));
  render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
  expect(screen.getByRole('heading', { name: 'Helios hit an unexpected error' })).toBeInTheDocument();
  expect(screen.getByText(/Your source is still in this tab/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download source' })).toBeInTheDocument();
  expect(screen.getByText(/render failed/)).toBeInTheDocument();
});

it('does not promise a download when no editor source exists', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
  expect(screen.getByText(/Nothing was saved from this tab/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download source' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Reload Helios' })).toBeInTheDocument();
});

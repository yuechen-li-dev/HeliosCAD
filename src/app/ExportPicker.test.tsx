import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExportPicker } from './ExportPicker';

it('offers Scene formats and explains why STEP is unavailable', async () => {
  const onOpen = vi.fn(); const onExport = vi.fn().mockResolvedValue(undefined);
  render(<ExportPicker formats={[
    { format: 'step', label: 'STEP AP242', description: 'Exact', available: false, reason: 'Scenes have no STEP product artifact.' },
    { format: 'glb', label: 'glTF / GLB', description: 'Static scene', available: true },
    { format: 'usda', label: 'OpenUSD / USDA', description: 'Scene hierarchy', available: true },
  ]} disabled={false} open onOpen={onOpen} onExport={onExport} />);
  expect(screen.getByRole('checkbox', { name: /STEP/ })).toBeDisabled();
  expect(screen.getByText('Scenes have no STEP product artifact.')).toBeVisible();
  const glb = screen.getByRole('checkbox', { name: /glTF/ });
  await waitFor(() => expect(glb).toBeChecked());
  fireEvent.click(glb);
  expect(screen.getByRole('button', { name: 'Download selected format' })).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(onOpen).toHaveBeenCalledWith(false);
  expect(screen.getByRole('button', { name: 'Export ▾' })).toHaveFocus();
});

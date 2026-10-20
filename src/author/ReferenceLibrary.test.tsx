import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReferenceLibrary } from './ReferenceLibrary';
import { request } from '../cloud/api';
vi.mock('../cloud/api', () => ({ request: vi.fn() }));
describe('reference library', () => {
  it('uploads a real selected file, attaches its server identity and reports import errors', async () => {
    const reference = { id: 'ref1', name: 'motor.md', sha256: '1234567890123456', sections: 2, tables: [] };
    vi.mocked(request).mockResolvedValueOnce([]).mockResolvedValueOnce(reference).mockResolvedValueOnce([reference]);
    const onChange = vi.fn(), onBusyChange = vi.fn();
    render(<ReferenceLibrary selected={[]} disabled={false} onChange={onChange} onBusyChange={onBusyChange} />);
    const file = new File(['Motor pitch: 31 mm'], 'motor.md');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('Motor pitch: 31 mm').buffer });
    fireEvent.change(screen.getByLabelText('Add engineering reference'), { target: { files: [file] } });
    await screen.findByText('motor.md');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['ref1']));
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    const payload = JSON.parse(vi.mocked(request).mock.calls[1][1]!.body as string);
    expect(atob(payload.contentBase64)).toBe('Motor pitch: 31 mm');
    vi.mocked(request).mockRejectedValueOnce(new Error('PDF needs selectable text'));
    fireEvent.change(screen.getByLabelText('Add engineering reference'), { target: { files: [file] } });
    await screen.findByText('PDF needs selectable text');
  });
});

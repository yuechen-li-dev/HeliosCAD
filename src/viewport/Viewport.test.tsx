import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./LegacyViewport', () => ({ LegacyViewport: () => <section aria-label="3D viewport">webgl</section> }));

describe('Viewport renderer choice', () => {
  it('draws with WebGL, not an error, when WebGPU has no adapter', async () => {
    vi.stubGlobal('navigator', { ...navigator, gpu: { requestAdapter: async () => null } });
    const { Viewport, probeWebGpu } = await import('./Viewport');
    expect(await probeWebGpu()).toMatch(/No WebGPU adapter/);
    const { container } = render(<Viewport model={null} selectedEntityId={null} selectedTopologyId={null} theme="apollonia" displayMode="shaded"
      viewMode="perspective" viewCommand="fit" selectionMode="face" onSelect={() => {}} />);
    expect(await screen.findByText('webgl')).toBeTruthy();
    expect(container.querySelector('[data-display-host="transitional-webgl"]')).toBeTruthy();
    expect(screen.getByLabelText(/Drawing with WebGL\. No WebGPU adapter/).textContent).toBe('WebGL');
    expect(container.querySelector('.viewport-error')).toBeNull();
    vi.unstubAllGlobals();
  });
  it('remembers an explicit WebGL choice and offers WebGPU again from the renderer note', async () => {
    localStorage.setItem('helios.viewport.renderer', 'webgl');
    const { Viewport } = await import('./Viewport');
    const { container } = render(<Viewport model={null} selectedEntityId={null} selectedTopologyId={null} theme="apollonia" displayMode="shaded"
      viewMode="perspective" viewCommand="fit" selectionMode="face" onSelect={() => {}} />);
    expect(container.querySelector('[data-display-host="transitional-webgl"]')).toBeTruthy();
    const note = screen.getByRole('button', { name: 'WebGL' });
    expect(note).toHaveAttribute('title', expect.stringMatching(/by your choice/));
    note.click();
    expect(localStorage.getItem('helios.viewport.renderer')).toBeNull();
    localStorage.clear();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExampleGallery } from './ExampleGallery';

describe('curated example gallery', () => {
  it('filters and opens the selected project identity', () => {
    const open = vi.fn(); render(<ExampleGallery onOpen={open} />);
    fireEvent.change(screen.getByLabelText('Search examples'), { target: { value: 'guitar' } });
    expect(screen.queryByRole('button', { name: 'Open Mounting plate' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Sunburst electric guitar' }));
    expect(open).toHaveBeenCalledWith('guitar');
  });
  it('prevents duplicate opens during document loading', () => {
    render(<ExampleGallery opening="house" onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Open Warm-modern house' })).toBeDisabled();
    expect(screen.getByText('Opening…')).toBeVisible();
  });
  it('keeps real source available when a preview asset fails', () => {
    const open = vi.fn(); render(<ExampleGallery onOpen={open} />);
    fireEvent.error(screen.getByRole('img', { name: 'Mounting plate wireframe from Aetheris geometry' }));
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Mounting plate' }));
    expect(open).toHaveBeenCalledWith('bracket');
  });
});

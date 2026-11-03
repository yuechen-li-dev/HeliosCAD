import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ExampleGallery } from './ExampleGallery';
import { readGroups } from './galleryGroups';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

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
  it('puts the small starter parts in Basic and all existing showcase projects in Advanced', () => {
    render(<ExampleGallery onOpen={vi.fn()} />);
    const basic = within(screen.getByRole('group', { name: 'Basic models' }));
    expect(basic.getByRole('button', { name: 'Open Simple bracket' })).toBeVisible();
    expect(basic.getByRole('button', { name: 'Open Paperclip' })).toBeVisible();
    expect(basic.queryByRole('button', { name: 'Open Mounting plate' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Advanced models' })).getAllByRole('button')).toHaveLength(5);
  });
  it('saves, renames, removes and restores model references without copying a project', () => {
    const open = vi.fn(), view = render(<ExampleGallery onOpen={open} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Workshop' } });
    fireEvent.click(screen.getByLabelText('Simple bracket')); fireEvent.click(screen.getByLabelText('Industrial ATLAS'));
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    const group = within(screen.getByRole('group', { name: 'Workshop models' }));
    fireEvent.click(group.getByRole('button', { name: 'Open Industrial ATLAS' }));
    expect(open).toHaveBeenCalledWith('atlas'); expect(readGroups()[0].models).toEqual(['basic-bracket', 'atlas']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Workshop group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Prototypes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prototypes group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove group' }));
    expect(screen.queryByRole('group', { name: 'Prototypes models' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove group' }));
    view.unmount(); render(<ExampleGallery onOpen={open} />);
    expect(screen.getByRole('group', { name: 'Prototypes models' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search examples'), { target: { value: 'Prototypes' } });
    expect(screen.queryByRole('group', { name: 'Advanced models' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Industrial ATLAS' })).toBeVisible();
  });
  it('protects an open group draft, rejects duplicate names and explains unavailable persistence', () => {
    render(<ExampleGallery onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New group' }));
    expect(screen.getByRole('button', { name: 'Open Simple bracket' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'basic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Temporary' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(screen.getByRole('status')).toHaveTextContent('temporary');
    expect(screen.getByRole('group', { name: 'Temporary models' })).toBeVisible();
  });
  it('ignores malformed groups and retired model references in saved organization', () => {
    localStorage.setItem('helios-example-groups-v1', JSON.stringify([null, { id: 'basic', name: 'Override', models: [] },
      { id: 'one', name: 'Saved', models: ['paperclip', 'missing', 'paperclip', 42] }, { id: 'one', name: 'Duplicate', models: [] }]));
    expect(readGroups()).toEqual([{ id: 'one', name: 'Saved', models: ['paperclip'] }]);
  });
});

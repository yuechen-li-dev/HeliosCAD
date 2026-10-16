import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutlineField, OutlineNode } from '@aetheris/cad';
import { fieldSuggestions, NodeInspector, startingValue } from './NodeInspector';

const source = 'Box Plate { Size: [50mm, 40mm, 8mm] Kind: Solid }';
const field = (name: string, text: string, shape: OutlineField['shape']): OutlineField => {
  const start = source.indexOf(text);
  return { name, text, shape, span: { start, length: text.length }, valueSpan: { start, length: text.length } };
};
const plate: OutlineNode = { id: 'Plate', kind: 'Box', variant: null, modifiers: [], name: 'Plate', occurrence: false, parentId: null, order: 0,
  span: { start: 0, length: source.length }, nameSpan: null, schemaId: null, parameters: [],
  fields: [field('Size', '[50mm, 40mm, 8mm]', 'sequence'), field('Kind', 'Solid', 'reference')], children: [] };

const renderInspector = (overrides: Partial<Parameters<typeof NodeInspector>[0]> = {}) => {
  const structural = () => vi.fn(async () => null as string | null);
  const props = { node: plate, nodes: new Map([[plate.id, plate]]), external: null, schema: null, completion: [], focusField: null, edit: null, problems: [], readOnly: null,
    onCommit: vi.fn(() => null), onAddField: structural(), onRemoveField: structural(), onRename: structural(), onMove: structural(), onDelete: structural(),
    onRevert: vi.fn(), onSelectNode: vi.fn(), onOpenSource: vi.fn(), ...overrides };
  render(<NodeInspector {...props} />);
  return props;
};

describe('node inspector', () => {
  it('commits one vector component as the whole list, once', () => {
    const props = renderInspector();
    const x = screen.getByLabelText('X');
    fireEvent.change(x, { target: { value: '60' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    fireEvent.blur(x);
    expect(props.onCommit).toHaveBeenCalledOnce();
    expect(props.onCommit).toHaveBeenCalledWith(plate, plate.fields[0], '[60mm, 40mm, 8mm]');
  });

  it('nudges with arrow keys and keeps the authored unit', () => {
    const props = renderInspector();
    const z = screen.getByLabelText('Z');
    fireEvent.keyDown(z, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(z, { key: 'Enter' });
    expect(props.onCommit).toHaveBeenCalledWith(plate, plate.fields[0], '[50mm, 40mm, 18mm]');
  });

  it('refuses structural text without touching the source', () => {
    const props = renderInspector();
    const kind = screen.getByDisplayValue('Solid');
    fireEvent.change(kind, { target: { value: 'Solid }' } });
    fireEvent.keyDown(kind, { key: 'Enter' });
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Braces change the model structure/);
  });

  it('offers a revert while the draft does not build', () => {
    const props = renderInspector({ edit: { nodeId: 'Plate', field: 'Size', label: 'Size: [50mm, 40mm, 8mm] → [0mm, 40mm, 8mm]', warnings: [], status: 'failed' } });
    expect(screen.getByText("Draft doesn't build")).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revert to last good' }));
    expect(props.onRevert).toHaveBeenCalledOnce();
  });

  it('renames from the title and keeps the name when it is refused', async () => {
    const onRename = vi.fn(async () => 'Another Box here is already called Rib.');
    renderInspector({ onRename });
    fireEvent.click(screen.getByRole('button', { name: 'Plate' }));
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Rib' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('already called Rib'));
    expect(onRename).toHaveBeenCalledWith(plate, 'Rib');
    expect(screen.getByLabelText('Name')).toHaveValue('Rib');
  });

  it('deletes only after confirming', () => {
    const props = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('alertdialog', { name: 'Delete declaration' }).querySelector('button.danger')!);
    expect(props.onDelete).toHaveBeenCalledWith(plate);
  });

  it('removes a field and adds a suggested one with its starting value', async () => {
    const props = renderInspector({ completion: [{ name: 'Bounds', type: 'Length', required: false, meaning: 'Clamp', default: null }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Kind' }));
    expect(props.onRemoveField).toHaveBeenCalledWith(plate, plate.fields[1]);
    fireEvent.click(screen.getByRole('button', { name: /\+ Bounds/ }));
    expect(screen.getByLabelText('New field value')).toHaveValue('1mm');
    fireEvent.keyDown(screen.getByLabelText('New field value'), { key: 'Enter' });
    await waitFor(() => expect(props.onAddField).toHaveBeenCalledWith(plate, 'Bounds', '1mm'));
  });

  it('suggests unset fields from completion first, then the schema, required ones leading', () => {
    const schema = { id: 'Box', name: 'Box', context: null, entry: null, description: null, compatibilityAlias: null, outputs: [],
      fields: [{ id: 'Box.Size', name: 'Size', kind: 'Vector', unit: 'Length' as const, required: true, default: null, choices: [], description: null, sourceEditable: false },
        { id: 'Box.Material', name: 'Material', kind: 'Reference', unit: 'None' as const, required: true, default: null, choices: [], description: null, sourceEditable: false }] };
    const names = fieldSuggestions(plate, [{ name: 'Finish', type: 'Choice', required: false, meaning: '', choices: ['Matte', 'Gloss'] }], schema);
    expect(names.map(n => n.name)).toEqual(['Material', 'Finish']);
    expect(names[1].value).toBe('Matte');
    expect(startingValue('Angle')).toBe('0deg');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutlineField, OutlineNode } from '@aetheris/cad';
import { FieldSet, fieldSuggestions, NodeInspector, startingValue } from './NodeInspector';

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
    onCommit: vi.fn(() => null), onAddField: structural(), onRemoveField: structural(), onRename: structural(), onMove: structural(), onDelete: structural(), onPromote: structural(), onExtract: structural(),
    onRevert: vi.fn(), onSelectNode: vi.fn(), onOpenSource: vi.fn(), ...overrides };
  const view = render(<NodeInspector {...props} />);
  return { ...props, rerender: view.rerender };
};

describe('node inspector', () => {
  it('discards a focused numeric or text edit on Escape without committing on blur', () => {
    const props = renderInspector();
    for (const input of [screen.getByLabelText('X'), screen.getByDisplayValue('Solid')]) {
      input.focus(); fireEvent.change(input, { target: { value: '123' } });
      fireEvent.keyDown(input, { key: 'Escape' });
    }
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('X')).toHaveValue('50');
    expect(screen.getByDisplayValue('Solid')).toBeVisible();
  });

  it('applies all vector components and other fields atomically, including the focused input', async () => {
    const apply = vi.fn(async () => null);
    render(<FieldSet fields={plate.fields} disabled={false} onApply={apply} />);
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '80' } });
    fireEvent.blur(screen.getByLabelText('X'));
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'Different' } });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(apply).toHaveBeenCalledExactlyOnceWith([
      { field: 'Size', value: '[80mm, 60mm, 8mm]' }, { field: 'Kind', value: 'Different' },
    ]));
  });

  it('keeps an invalid draft out of the compiler and can discard every field', () => {
    const apply = vi.fn(async () => null);
    render(<FieldSet fields={plate.fields} disabled={false} onApply={apply} />);
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('finite number');
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits' }));
    expect(screen.getByLabelText('X')).toHaveValue('50');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('edits blind depth as a dimension and preserves the termination constructor', async () => {
    const apply = vi.fn(async () => null);
    render(<FieldSet fields={[field('End', 'Blind 5mm', 'expression')]} disabled={false} onApply={apply} />);
    fireEvent.change(screen.getByLabelText('Blind depth'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith([{ field: 'End', value: 'Blind(7mm)' }]));
  });

  it('resets rejected local text when the source revision is restored before an outline refresh', () => {
    const props = renderInspector({ revision: 1, onApplyFields: vi.fn(async () => null) });
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '1000' } });
    props.rerender(<NodeInspector {...props} revision={2} />);
    expect(screen.getByLabelText('X')).toHaveValue('50');
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });
  it('edits point coordinates without requiring constructor syntax or replacing references', () => {
    const center = { ...field('Center', 'Point2(0mm, Offset)', 'call'), span: { start: 20, length: 19 } };
    const hole = { ...plate, kind: 'Hole', fields: [center] };
    const props = renderInspector({ node: hole });
    const x = screen.getByLabelText('X');
    fireEvent.change(x, { target: { value: '20' } }); fireEvent.keyDown(x, { key: 'Enter' }); fireEvent.blur(x);
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(hole, center, 'Point2(20mm, Offset)');
    expect(screen.getByRole('button', { name: /Y.*Offset/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Make Center a parameter' })).toBeNull();
  });

  it('discloses a document build error when no precise node diagnostic exists', () => {
    renderInspector({ edit: { nodeId: 'Plate', field: null, label: 'Added Hole', warnings: [], status: 'failed' },
      buildProblems: [{ code: 'overlap', severity: 'error', message: 'Hole overlaps CenterMount' }] });
    expect(screen.getByText('Build error · not located on this declaration')).toBeVisible();
    expect(screen.getByText('Hole overlaps CenterMount')).toBeVisible();
  });

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

describe('variant-aware suggestions', () => {
  it('offers counterbore fields only on a counterbored hole', () => {
    const hole = { ...plate, kind: 'Hole', variant: 'Shaft', fields: [] };
    const relief = { id: 'Hole.CounterboreDepth', name: 'CounterboreDepth', kind: 'Length', unit: 'Length' as const, required: false, default: null, choices: [], variants: ['Counterbore'], description: null, sourceEditable: false };
    const diameter = { ...relief, id: 'Hole.Diameter', name: 'Diameter', variants: [] };
    const schema = { id: 'Hole', name: 'Hole', context: null, entry: null, description: null, compatibilityAlias: null, outputs: [], fields: [diameter, relief] };
    expect(fieldSuggestions(hole, [], schema).map(s => s.name)).toEqual(['Diameter']);
    expect(fieldSuggestions({ ...hole, variant: 'Counterbore' }, [], schema).map(s => s.name)).toEqual(['Diameter', 'CounterboreDepth']);
  });

  it('promotes one component of a dimension to a named parameter', async () => {
    const props = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Make Size a parameter' }));
    // The last numeric component is offered first: Z, the plate thickness.
    expect(screen.getByRole('button', { name: 'Z' })).toHaveAttribute('aria-pressed', 'true');
    const name = screen.getByLabelText('Parameter name');
    expect(name).toHaveValue('PlateSizeZ');
    fireEvent.change(name, { target: { value: 'Thickness' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make parameter' }));
    await waitFor(() => expect(props.onPromote).toHaveBeenCalledWith(plate, plate.fields[0], 2, 'Thickness'));
  });

  it('makes a feature in a Modify reusable with the chosen fields as parameters', async () => {
    const holeSource = 'Hole<Shaft> Mount { Center: Point2(0mm, 0mm) Diameter: 8mm On: +Z }';
    const at = (text: string) => ({ start: holeSource.indexOf(text), length: text.length });
    const f = (name: string, text: string, shape: OutlineField['shape']): OutlineField => ({ name, text, shape, span: at(text), valueSpan: at(text) });
    const modify: OutlineNode = { ...plate, id: 'Modify:Plate', kind: 'Modify', fields: [], children: ['Modify:Plate/Mount'] };
    const hole: OutlineNode = { ...plate, id: 'Modify:Plate/Mount', kind: 'Hole', variant: 'Shaft', name: 'Mount', parentId: 'Modify:Plate',
      fields: [f('Center', 'Point2(0mm, 0mm)', 'call'), f('Diameter', '8mm', 'quantity'), f('On', '+Z', 'expression')] };
    const props = renderInspector({ node: hole, nodes: new Map([[modify.id, modify], [hole.id, hole]]) });
    fireEvent.click(screen.getByRole('button', { name: 'Make reusable…' }));
    // Center is chosen to vary by default; +Z cannot be a parameter and is not offered.
    expect(screen.getByRole('checkbox', { name: 'Center' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'On' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Diameter' }));
    fireEvent.change(screen.getByLabelText('Feature name'), { target: { value: 'MountHole' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make reusable' }));
    await waitFor(() => expect(props.onExtract).toHaveBeenCalledWith(hole, 'MountHole', ['Center', 'Diameter']));
  });
});

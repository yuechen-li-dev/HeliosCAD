import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutlineField, OutlineNode } from '@aetheris/cad';
import { NodeInspector } from './NodeInspector';

const source = 'Box Plate { Size: [50mm, 40mm, 8mm] Kind: Solid }';
const field = (name: string, text: string, shape: OutlineField['shape']): OutlineField => {
  const start = source.indexOf(text);
  return { name, text, shape, span: { start, length: text.length }, valueSpan: { start, length: text.length } };
};
const plate: OutlineNode = { id: 'Plate', kind: 'Box', variant: null, modifiers: [], name: 'Plate', occurrence: false, parentId: null, order: 0,
  span: { start: 0, length: source.length }, nameSpan: null, schemaId: null, parameters: [],
  fields: [field('Size', '[50mm, 40mm, 8mm]', 'sequence'), field('Kind', 'Solid', 'reference')], children: [] };

const renderInspector = (overrides: Partial<Parameters<typeof NodeInspector>[0]> = {}) => {
  const props = { node: plate, nodes: new Map([[plate.id, plate]]), external: null, schema: null, focusField: null, edit: null, problems: [], readOnly: null,
    onCommit: vi.fn(() => null), onRevert: vi.fn(), onSelectNode: vi.fn(), onOpenSource: vi.fn(), ...overrides };
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
    const props = renderInspector({ edit: { nodeId: 'Plate', field: 'Size', from: '[50mm, 40mm, 8mm]', to: '[0mm, 40mm, 8mm]', status: 'failed' } });
    expect(screen.getByText("Draft doesn't build")).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revert to last good' }));
    expect(props.onRevert).toHaveBeenCalledOnce();
  });
});

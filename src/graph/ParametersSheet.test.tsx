import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LanguageOutline, OutlineField, OutlineNode } from '@aetheris/cad';
import { parameterNodes, ParametersSheet } from './ParametersSheet';
import { argumentSuggestions } from './NodeInspector';

const source = 'Static Thickness: Length = 8mm\nBox Plate { Size: [50mm, 40mm, Thickness] }';
const span = (text: string) => ({ start: source.indexOf(text), length: text.length });
const field = (name: string, text: string, shape: OutlineField['shape']): OutlineField => ({ name, text, shape, span: span(text), valueSpan: span(text) });
const node = (partial: Partial<OutlineNode> & Pick<OutlineNode, 'id' | 'kind'>): OutlineNode => ({ variant: null, modifiers: [], name: null, occurrence: false,
  parentId: 'M', order: 0, span: { start: 0, length: source.length }, nameSpan: null, schemaId: null, parameters: [], fields: [], children: [], ...partial });
const thickness = node({ id: 'M/Thickness', kind: 'Static', name: 'Thickness', value: field('=', '8mm', 'quantity'), annotation: 'Length' });
const plate = node({ id: 'M/Plate', kind: 'Box', name: 'Plate', order: 1, fields: [field('Size', '[50mm, 40mm, Thickness]', 'sequence')] });
const record = node({ id: 'M/Policy', kind: 'Static', name: 'Policy', order: 2 });
const outline = { version: 'firmament-outline/1', document: 'm.firmament', revision: '1', nodes: [thickness, plate, record],
  edges: [{ from: 'M/Plate', to: 'M/Thickness', kind: 'reference', via: 'field:Size', member: null, span: span('Thickness]'), ambiguous: false, toDocument: null }],
  externals: [], diagnostics: [] } as unknown as LanguageOutline;

const renderSheet = (overrides: Partial<Parameters<typeof ParametersSheet>[0]> = {}) => {
  const props = { outline, edit: null, readOnly: null, onCommit: vi.fn(() => null), onRename: vi.fn(async () => null as string | null),
    onDelete: vi.fn(async () => null as string | null), onAdd: vi.fn(async () => null as string | null), onSelect: vi.fn(), ...overrides };
  render(<ParametersSheet {...props} />);
  return props;
};

describe('parameters sheet', () => {
  it('lists named values, not records, with what uses them', () => {
    expect(parameterNodes(outline).map(n => n.name)).toEqual(['Thickness']);
    const props = renderSheet();
    expect(screen.getByRole('region', { name: 'Parameter Thickness' })).toHaveTextContent('Length');
    fireEvent.click(screen.getByRole('button', { name: 'Plate' }));
    expect(props.onSelect).toHaveBeenCalledWith('M/Plate');
  });

  it('edits the value in place', () => {
    const props = renderSheet();
    const value = screen.getByDisplayValue('8');
    fireEvent.change(value, { target: { value: '10' } });
    fireEvent.keyDown(value, { key: 'Enter' });
    expect(props.onCommit).toHaveBeenCalledWith(thickness, thickness.value, '10mm');
  });

  it('adds a parameter by name and value', async () => {
    const props = renderSheet();
    fireEvent.change(screen.getByLabelText('New parameter name'), { target: { value: 'Width' } });
    fireEvent.change(screen.getByLabelText('New parameter value'), { target: { value: '50mm' } });
    fireEvent.keyDown(screen.getByLabelText('New parameter value'), { key: 'Enter' });
    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith('Width', '50mm'));
  });
});

describe('placed Features', () => {
  it('suggests the parameters a call does not pass yet, with their defaults', () => {
    const call = node({ id: 'M/Modify:Plate/MountHole#1', kind: 'MountHole', call: true, fields: [field('center', 'Point2(0mm, 0mm)', 'call')] });
    const suggestions = argumentSuggestions(call, [{ name: 'center', type: 'Point2', default: null }, { name: 'diameter', type: 'Length', default: '3.4mm' }]);
    expect(suggestions).toEqual([expect.objectContaining({ name: 'diameter', value: '3.4mm', hint: 'default 3.4mm' })]);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { DraftConstruction, SketchShape } from '@aetheris/cad';
import { ConstructionShapes } from './ConstructionShapes';

it('keeps dimension edits local until Apply and requires Apply or Discard before another editor', async () => {
  const shape = (id: string): SketchShape => ({ id, name: id, kind: 'Rect2', center: [0, 0], controls: [{
    id: id + '/width', label: 'Width', authored: '60mm', value: 60, unit: 'mm', editable: true,
    parameter: id + 'Width', readOnlyReason: null, span: { start: 0, length: 4 },
  }] });
  const construction: DraftConstruction = { shapes: [shape('outer'), shape('other')], spans: [], frames: [], points: [], guides: [], diagnostics: [], validationLevel: 'ConstructionResolvedNotTraced',
    elements: [{ id: 'wall', name: 'wall', kind: 'Static', parent: 'Part', span: { start: 0, length: 4 }, fields: [{ name: 'value', value: '8mm', number: 8, unit: 'mm', editable: true }] }] };
  const dimensions = vi.fn(), parameter = vi.fn(), pending = vi.fn();
  render(<ConstructionShapes construction={construction} selected="outer" onRelated={vi.fn()} onDimensions={dimensions} onParameter={parameter} onPending={pending} busy={false} revision={0} />);
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '80' } });
  await waitFor(() => expect(pending).toHaveBeenLastCalledWith(true));
  expect(dimensions).not.toHaveBeenCalled(); expect(parameter).not.toHaveBeenCalled();
  expect(screen.getByLabelText('wall')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard dimension edits' }));
  expect(screen.getByLabelText('Width')).toHaveValue(60); await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
  expect(screen.getByLabelText('wall')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '80' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply shape dimensions' }));
  expect(dimensions).toHaveBeenCalledWith([{ control: 'outer/width', value: 80 }]);
});

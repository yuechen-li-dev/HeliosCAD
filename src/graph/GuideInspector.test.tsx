import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { DraftConstruction, DraftElement } from '@aetheris/cad';
import { GuideInspector } from './GuideInspector';

const point = (name: string, position: string): DraftElement => ({ id: name, name, kind: 'Point2', parent: 'layout', span: { start: 0, length: 0 },
  fields: [{ name: 'position', value: position, number: null, unit: null, editable: false }] });
const arc: DraftElement = { id: 'arc', name: 'arc', kind: 'Arc2', parent: 'layout', span: { start: 0, length: 0 }, fields: ['center', 'from', 'to'].map((name, i) => ({ name, value: ['a', 'b', 'c'][i], number: null, unit: null, editable: false })) };
const construction: DraftConstruction = { elements: [point('a', '[0mm, 0mm]'), point('b', '[10mm, 0mm]'), point('c', '[0mm, 10mm]'), arc], points: [
  { name: 'a', x: 0, y: 0 }, { name: 'b', x: 10, y: 0 }, { name: 'c', x: 0, y: 10 }], guides: [], frames: [], diagnostics: [], validationLevel: 'ConstructionResolvedNotTraced' };

it('holds invalid radius edits locally and discards them without changing source', () => {
  const apply = vi.fn(async () => null), pending = vi.fn(), discard = vi.fn();
  render(<GuideInspector element={arc} construction={construction} disabled={false} onApply={apply} onPending={pending} onDiscard={discard} />);
  fireEvent.change(screen.getByLabelText('Guide Radius'), { target: { value: '0' } });
  expect(pending).toHaveBeenLastCalledWith(true);
  fireEvent.submit(screen.getByRole('button', { name: 'Apply guide dimensions' }).closest('form')!);
  expect(screen.getByRole('alert')).toHaveTextContent('greater than zero'); expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard guide edits' }));
  expect(screen.getByLabelText('Guide Radius')).toHaveValue(10); expect(pending).toHaveBeenLastCalledWith(false); expect(discard).toHaveBeenCalledOnce();
});
it('exposes read-only guidance for driven defining points, and disables inputs outside Draw', () => {
  const view = render(<GuideInspector element={arc} construction={{ ...construction, elements: [point('a', '[offset, 0mm]'), ...construction.elements.slice(1)] }} disabled={false} onApply={vi.fn()} onPending={vi.fn()} />);
  expect(screen.queryByLabelText('Guide Radius')).toBeNull(); expect(screen.getByText(/driven or unsupported inputs/)).toBeVisible();
  view.unmount(); render(<GuideInspector element={arc} construction={construction} disabled onApply={vi.fn()} onPending={vi.fn()} />);
  expect(screen.getByLabelText('Guide Radius')).toBeDisabled();
});

it('refreshes fields when an asynchronous history projection changes without creating pending edits', () => {
  const pending = vi.fn(), props = { element: arc, disabled: false, onApply: vi.fn(), onPending: pending };
  const view = render(<GuideInspector {...props} construction={construction} />);
  const moved = { ...construction, points: construction.points.map(p => ({ ...p, x: p.x + 5, y: p.y + 7 })) };
  view.rerender(<GuideInspector {...props} construction={moved} />);
  expect(screen.getByLabelText('Guide Center X')).toHaveValue(5);
  expect(screen.getByLabelText('Guide Center Y')).toHaveValue(7);
  expect(screen.getByRole('button', { name: 'Apply guide dimensions' })).toBeDisabled();
  expect(pending).toHaveBeenLastCalledWith(false);
  view.rerender(<GuideInspector {...props} construction={construction} />);
  expect(screen.getByLabelText('Guide Center X')).toHaveValue(0);
  expect(screen.queryByRole('button', { name: 'Discard guide edits' })).toBeNull();
  expect(pending).toHaveBeenLastCalledWith(false);
});

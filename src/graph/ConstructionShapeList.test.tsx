import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ConstructionShapeList } from './ConstructionShapeList';

it('filters a long list, selects hidden shapes without revealing them, and toggles only visibility', () => {
  const shapes = Array.from({ length: 30 }, (_, n) => ({ id: `s${n}`, name: `shape${n}`, kind: n % 2 ? 'Circle2' : 'Rect2' }));
  const hidden = new Set(['s29']), select = vi.fn(), toggle = vi.fn(), all = vi.fn();
  render(<ConstructionShapeList shapes={shapes} selected="s0" hidden={hidden} disabled={false} onSelect={select} onToggle={toggle} onShowAll={all} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(30);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'shape29' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByLabelText('Show shape29')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Select shape29' }));
  expect(select).toHaveBeenCalledWith('s29'); expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Show shape29')); expect(toggle).toHaveBeenCalledWith('s29');
  expect(hidden).toEqual(new Set(['s29']));
  fireEvent.click(screen.getByRole('button', { name: 'Show all' })); expect(all).toHaveBeenCalledOnce();
});

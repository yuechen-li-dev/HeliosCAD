import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { SelectionDescription } from '@aetheris/cad';
import { PmiAuthor } from './PmiAuthor';

it('requires explicit allowances and writes a source-owned requirement instead of changing geometry', async () => {
  const apply = vi.fn(async () => null);
  render(<PmiAuthor selection={{ surfaceKind: 'Cylinder', diameterMm: 2, selector: 'part.face("#191")' } as SelectionDescription}
    outline={{ nodes: [], edges: [] } as never} disabled={false} onApply={apply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add diameter' }));
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('explicit');
  fireEvent.change(screen.getByLabelText('Upper allowance (mm)'), { target: { value: '.1' } });
  fireEvent.change(screen.getByLabelText('Lower allowance (mm)'), { target: { value: '.05' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add diameter' }));
  expect(apply).toHaveBeenCalledWith([expect.objectContaining({ kind: 'insertDeclaration', source: expect.stringContaining('tolerance: PlusMinus(0.1mm, 0.05mm)') })], expect.stringContaining('part.face'));
});

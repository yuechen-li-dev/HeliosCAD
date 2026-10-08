import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

it('resizes panes through the keyboard with the correct axis', () => {
  const resize = vi.fn(); render(<ResizeHandle axis="vertical" label="Bottom split" onResize={resize} />);
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowUp' });
  expect(resize).toHaveBeenLastCalledWith(-24);
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowDown' });
  expect(resize).toHaveBeenLastCalledWith(24);
});

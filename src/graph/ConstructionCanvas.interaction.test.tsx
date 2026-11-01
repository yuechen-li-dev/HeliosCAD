import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SketchShape } from '@aetheris/cad';
import { ConstructionCanvas } from './ConstructionCanvas';

const shape: SketchShape = { id: 'rect', name: 'plate', kind: 'Rect2', center: [20, 20],
  controls: ['Center X', 'Center Y'].map(label => ({ id: label, label, authored: '20mm', value: 20, unit: 'mm', editable: true, parameter: null, readOnlyReason: null, span: { start: 0, length: 4 } })) };
const frames = new Map<number, FrameRequestCallback>(); let serial = 0;
beforeEach(() => {
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1; });
  vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return this; } });
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const onMove = vi.fn(), layer = vi.fn(() => <text>Dimensions</text>);
  const props = { bounds: { x: 0, y: 0, width: 100, height: 100 }, shapes: [{ shape, owner: 'layout', bounds: { x: 15, y: 15, width: 10, height: 10 } }], selected: 'rect', drawing: false, movable: true, disabled: false,
    onSelect: vi.fn(), onDraw: vi.fn(), onMove, hint: '', revision: 0, autoFit: false, layer, children: <path d="M15 -15h10v-10h-10z" /> };
  const ui = render(<ConstructionCanvas {...props} />), svg = ui.getByRole('group') as unknown as SVGSVGElement;
  const matrix = { a: 1, d: 1, inverse() { return this; } };
  svg.getScreenCTM = vi.fn(() => matrix) as unknown as typeof svg.getScreenCTM;
  svg.setPointerCapture = vi.fn(); svg.releasePointerCapture = vi.fn(); svg.hasPointerCapture = () => true;
  return { ...ui, props, svg, target: ui.getByRole('button', { name: 'Move plate' }), onMove, layer };
}
const pointer = (x: number, y: number, button = 0) => ({ clientX: x, clientY: y, altKey: true, button });
function flush() { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); }); }

it('coalesces pointer bursts, keeps the grab offset, and commits the final drop exactly once', () => {
  const { target, svg, onMove, layer, container } = mount();
  fireEvent.pointerDown(target, pointer(17, -23));
  expect(container.querySelector('[transform="translate(0,0)"]')).not.toBeNull();
  vi.mocked(svg.getScreenCTM).mockClear();
  for (let i = 1; i <= 100; i++) fireEvent.pointerMove(svg, pointer(17 + i / 10, -23 - i / 20));
  expect(svg.getScreenCTM).not.toHaveBeenCalled(); expect(frames.size).toBe(1); expect(onMove).not.toHaveBeenCalled();
  flush();
  expect(svg.getScreenCTM).toHaveBeenCalledTimes(1); expect(layer).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[transform="translate(10,-5)"]')).not.toBeNull();
  fireEvent.pointerMove(svg, pointer(30, -29));
  fireEvent.pointerUp(svg, pointer(32, -30)); // Later than the queued preview; must win.
  expect(onMove).toHaveBeenCalledExactlyOnceWith(shape, [35, 27]);
  flush(); expect(onMove).toHaveBeenCalledTimes(1); expect(container.querySelector('.draft-gesture-preview')).toBeNull();
});
it('a click selects without snapping or moving a shape', () => {
  const { target, svg, onMove } = mount();
  fireEvent.pointerDown(target, pointer(17, -23)); fireEvent.pointerUp(svg, pointer(17, -23));
  expect(onMove).not.toHaveBeenCalled();
});
it('returning to the grab point restores the original position without an edit', () => {
  const { target, svg, onMove } = mount();
  fireEvent.pointerDown(target, pointer(17, -23));
  fireEvent.pointerMove(svg, pointer(30, -30)); flush();
  fireEvent.pointerUp(svg, pointer(17, -23));
  expect(onMove).not.toHaveBeenCalled();
});
it.each(['escape', 'cancel', 'capture', 'revision', 'disabled', 'unmount'])('cancels pending work on %s without a geometry edit', reason => {
  const ui = mount();
  fireEvent.pointerDown(ui.target, pointer(17, -23)); fireEvent.pointerMove(ui.svg, pointer(30, -30));
  if (reason === 'escape') fireEvent.keyDown(ui.svg, { key: 'Escape' });
  if (reason === 'cancel') fireEvent.pointerCancel(ui.svg);
  if (reason === 'capture') fireEvent.lostPointerCapture(ui.svg);
  if (reason === 'revision') ui.rerender(<ConstructionCanvas {...ui.props} revision={1} />);
  if (reason === 'disabled') ui.rerender(<ConstructionCanvas {...ui.props} disabled />);
  if (reason === 'unmount') ui.unmount();
  expect(frames.size).toBe(0); flush(); expect(ui.onMove).not.toHaveBeenCalled();
});
it('pans by the complete screen displacement when pointer events are coalesced', () => {
  const { svg, onMove } = mount();
  fireEvent.pointerDown(svg, pointer(5, 5, 1));
  for (let i = 1; i <= 100; i++) fireEvent.pointerMove(svg, pointer(5 + i / 5, 5 + i / 10, 1));
  flush(); expect(svg).toHaveAttribute('viewBox', '-20 -10 100 100');
  fireEvent.pointerUp(svg, pointer(35, 25, 1));
  expect(svg).toHaveAttribute('viewBox', '-30 -20 100 100'); expect(onMove).not.toHaveBeenCalled();
});

it('creates a circle by clicking its centre and a radius, including a horizontal radius', () => {
  const ui = mount();
  ui.rerender(<ConstructionCanvas {...ui.props} drawing drawKind="Circle2" />);
  const click = (x: number, y: number) => { fireEvent.pointerDown(ui.svg, pointer(x, y)); fireEvent.pointerUp(ui.svg, pointer(x, y)); };
  click(10, -20); expect(ui.props.onDraw).not.toHaveBeenCalled();
  click(25, -20);
  expect(ui.props.onDraw).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20, width: 30, height: 30 });
});

it('previews the compiler arc direction and commits only after centre, start and end clicks', () => {
  const ui = mount(), onStroke = vi.fn();
  ui.rerender(<ConstructionCanvas {...ui.props} drawing drawKind="Arc" stroke="arc" onStroke={onStroke} />);
  fireEvent.pointerDown(ui.svg, pointer(0, 0)); fireEvent.pointerDown(ui.svg, pointer(10, 0));
  expect(onStroke).not.toHaveBeenCalled();
  fireEvent.pointerMove(ui.svg, pointer(0, -10)); flush();
  expect(ui.container.querySelector('path.draft-gesture-preview')).toHaveAttribute('d', 'M 10 0 A 10 10 0 0 0 0 -10');
  fireEvent.pointerDown(ui.svg, pointer(0, -10));
  expect(onStroke).toHaveBeenCalledExactlyOnceWith([{ at: [0, 0], name: undefined, snap: undefined }, { at: [10, 0], name: undefined, snap: undefined }, { at: [0, 10] }]);
});

it('abandons an unfinished radial gesture when switching tools or stages', () => {
  const ui = mount();
  ui.rerender(<ConstructionCanvas {...ui.props} drawing drawKind="Circle2" />);
  fireEvent.pointerDown(ui.svg, pointer(10, -20));
  ui.rerender(<ConstructionCanvas {...ui.props} drawing drawKind="Ellipse2" />);
  fireEvent.pointerDown(ui.svg, pointer(10, -20));
  ui.rerender(<ConstructionCanvas {...ui.props} movable={false} />);
  fireEvent.pointerUp(ui.svg, pointer(30, -30));
  expect(ui.props.onDraw).not.toHaveBeenCalled(); expect(ui.onMove).not.toHaveBeenCalled();
  expect(ui.queryByRole('button', { name: 'Move plate' })).toBeNull();
});

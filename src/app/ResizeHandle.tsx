import { useRef } from 'react';

export function ResizeHandle({ axis, label, value, onResize }: { axis: 'horizontal' | 'vertical'; label: string; value?: number; onResize(delta: number): void }) {
  const previous = useRef<number | null>(null);
  return <div className={`resize-handle resize-${axis}`} role="separator" aria-label={label} aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'} aria-valuenow={value} tabIndex={0}
    onPointerDown={event => { previous.current = axis === 'horizontal' ? event.clientX : event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (previous.current === null) return; const position = axis === 'horizontal' ? event.clientX : event.clientY; onResize(position - previous.current); previous.current = position; }}
    onPointerUp={() => { previous.current = null; }} onLostPointerCapture={() => { previous.current = null; }}
    onKeyDown={event => { const backward = axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'; const forward = axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown'; if (event.key === backward || event.key === forward) { event.preventDefault(); onResize(event.key === backward ? -24 : 24); } }} />;
}

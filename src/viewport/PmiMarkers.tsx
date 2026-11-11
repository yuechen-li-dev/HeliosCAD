import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { PmiDisplayAnnotation } from '@aetheris/cad';
import { layoutTags, leaderStart, markerTags, type Placement } from './pmiMarkers';

export type Project = (point: readonly number[]) => readonly [number, number, number] | null;

const FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const TAG_HEIGHT = 22, BADGE = 18;

let measureContext: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string) {
  if (measureContext === undefined) { try { measureContext = document.createElement('canvas').getContext('2d'); } catch { measureContext = null; } }
  if (measureContext) { measureContext.font = FONT; return measureContext.measureText(text).width; }
  return text.length * 6.6;
}

/**
 * Markers: numbered tags over the viewport, one per PMI record, coloured like its target, with a leader to the
 * target's centre. Tags are laid out in screen space so none overlap, and are re-laid out when the view changes.
 */
export function PmiMarkers({ annotations, projectRef, composeRef }: {
  annotations: readonly PmiDisplayAnnotation[];
  projectRef: MutableRefObject<Project | null>;
  /** Set to a function drawing the current tags onto a 2D context, for screenshots. */
  composeRef: MutableRefObject<((context: CanvasRenderingContext2D, scale: number) => void) | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useMemo(() => markerTags(annotations), [annotations]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const signature = useRef('');
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const project = projectRef.current, element = host.current;
      if (!project || !element) return;
      const { clientWidth: width, clientHeight: height } = element;
      const visible = tags.flatMap(tag => {
        const p = project(tag.anchor);
        return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [{ id: tag.id, ax: p[0], ay: p[1], width: BADGE + 22 + textWidth(tag.label), height: TAG_HEIGHT }] : [];
      });
      const key = `${width}x${height}:` + visible.map(v => `${v.ax.toFixed(1)},${v.ay.toFixed(1)}`).join(';');
      if (key === signature.current) return;
      signature.current = key;
      setPlacements(layoutTags(visible, width, height));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tags, projectRef]);

  const byId = new Map(tags.map(t => [t.id, t]));
  composeRef.current = (context, scale) => {
    context.save(); context.scale(scale, scale); context.font = FONT; context.textBaseline = 'middle';
    for (const p of placements) {
      const tag = byId.get(p.id); if (!tag) continue;
      const [sx, sy] = leaderStart(p);
      context.strokeStyle = tag.color; context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(sx, sy); context.lineTo(p.ax, p.ay); context.stroke();
      context.fillStyle = tag.color; context.beginPath(); context.arc(p.ax, p.ay, 3, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(255,255,255,.94)'; context.fillRect(p.x, p.y, p.width, p.height);
      context.strokeStyle = tag.color; context.strokeRect(p.x + .5, p.y + .5, p.width - 1, p.height - 1);
      context.fillStyle = tag.color; context.fillRect(p.x, p.y, BADGE + 2, p.height);
      context.fillStyle = '#10131a'; context.textAlign = 'center'; context.fillText(String(tag.number), p.x + (BADGE + 2) / 2, p.y + p.height / 2);
      context.textAlign = 'left'; context.fillText(tag.label, p.x + BADGE + 7, p.y + p.height / 2);
    }
    context.restore();
  };

  return <div ref={host} className="pmi-markers" aria-hidden="true">
    <svg width="100%" height="100%">
      {placements.map(p => { const tag = byId.get(p.id); if (!tag) return null; const [sx, sy] = leaderStart(p);
        return <g key={p.id}><line x1={sx} y1={sy} x2={p.ax} y2={p.ay} stroke={tag.color} strokeWidth={1.5} /><circle cx={p.ax} cy={p.ay} r={3} fill={tag.color} /></g>; })}
    </svg>
    {placements.map(p => { const tag = byId.get(p.id); if (!tag) return null;
      return <div key={p.id} className="pmi-marker" data-record={tag.number} style={{ left: p.x, top: p.y, width: p.width, height: p.height, borderColor: tag.color }}>
        <b style={{ background: tag.color }}>{tag.number}</b><span>{tag.label}</span></div>; })}
  </div>;
}

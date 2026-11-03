import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Native scrolling keeps touch, trackpad and focused cards on the same path. */
export function GalleryRow({ name, count, children, actions, revision, focusRequested, onFocusHandled }: {
  name: string; count: number; children: ReactNode; actions?: ReactNode; revision: string;
  focusRequested?: boolean; onFocusHandled?(): void;
}) {
  const rail = useRef<HTMLDivElement>(null), id = useId();
  const [ends, setEnds] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = rail.current!;
    const update = () => setEnds({ previous: count > 0 && element.scrollLeft > 1, next: count > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    element.scrollLeft = 0; update();
    const observer = new ResizeObserver(update); observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [revision, count]);
  useEffect(() => {
    if (!focusRequested) return;
    rail.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    rail.current?.focus({ preventScroll: true }); onFocusHandled?.();
  }, [focusRequested, onFocusHandled]);
  const scroll = (direction: number, edge = false) => {
    const element = rail.current!;
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (edge) element.scrollTo({ left: direction < 0 ? 0 : element.scrollWidth, behavior });
    else element.scrollBy({ left: direction * element.clientWidth * .85, behavior });
  };
  return <section className="gallery-row" aria-labelledby={`${id}-heading`}>
    <div className="gallery-row-heading"><h3 id={`${id}-heading`}>{name} <small>{count} {count === 1 ? 'model' : 'models'}</small></h3>
      <div className="gallery-row-actions">{actions}<div className="gallery-row-controls" aria-label={`${name} scrolling`}>
        <button type="button" aria-label={`Previous ${name} models`} aria-controls={id} disabled={!ends.previous} onClick={() => { scroll(-1); rail.current?.focus({ preventScroll: true }); }}>←</button>
        <button type="button" aria-label={`Next ${name} models`} aria-controls={id} disabled={!ends.next} onClick={() => { scroll(1); rail.current?.focus({ preventScroll: true }); }}>→</button>
      </div></div>
    </div>
    <div ref={rail} id={id} className="showcase-grid gallery-rail" role="group" aria-label={`${name} models`} tabIndex={count ? 0 : -1}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); scroll(event.key === 'ArrowLeft' || event.key === 'Home' ? -1 : 1, event.key === 'Home' || event.key === 'End');
      }}>{children}</div>
  </section>;
}

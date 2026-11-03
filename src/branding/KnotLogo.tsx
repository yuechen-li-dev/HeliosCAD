import { useEffect, useRef, useState } from 'react';
import './knot-logo.css';

/** Decorative GLB presentation. Firmament and the exported asset own the geometry. */
export function KnotLogo({ hero = false }: { hero?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    void import('./knotLogoScene').then(({ mountKnotLogo }) => {
      if (cancelled) return;
      dispose = mountKnotLogo(host.current!, () => { if (!cancelled) setState('ready'); }, () => { if (!cancelled) setState('fallback'); });
    }).catch(() => { if (!cancelled) setState('fallback'); });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <span ref={host} className={`knot-logo${hero ? ' knot-logo--hero' : ''}`} data-state={state} aria-hidden="true">
    <span className="knot-logo-fallback">H</span>
  </span>;
}

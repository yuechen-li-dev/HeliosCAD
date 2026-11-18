import { useEffect, useRef, useState } from 'react';
import './knot-logo.css';

/** Decorative GLB presentation. Firmament and the exported asset own the geometry. */
export function KnotLogo({ hero = false }: { hero?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState('loading');
  const [motion, setMotion] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playing = motion ?? !reduced;
  const playRef = useRef(playing); playRef.current = playing;
  const scene = useRef<{ setPlaying(playing: boolean): void; dispose(): void } | null>(null);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import('./knotLogoScene').then(({ mountKnotLogo }) => {
      if (cancelled) return;
      scene.current = mountKnotLogo(host.current!, playRef.current, () => { if (!cancelled) setState('ready'); }, () => { if (!cancelled) setState('fallback'); });
    }).catch(() => { if (!cancelled) setState('fallback'); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => scene.current?.setPlaying(playing), [playing]);
  const action = playing ? 'Pause knot animation' : 'Play knot animation';
  return <span ref={host} className={`knot-logo${hero ? ' knot-logo--hero' : ''}`} data-state={state}>
    <span className="knot-logo-fallback" aria-hidden="true">H</span>
    {hero && state === 'ready' && <button type="button" className="knot-motion-button" aria-label={action} title={action}
      onClick={() => setMotion(!playing)}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span></button>}
  </span>;
}

import { useEffect, useRef, useState } from 'react';
import type { MotionClip, MotionPose } from '@aetheris/cad';

interface Props {
  clips: readonly MotionClip[];
  /** The build the clips belong to; a new build stops playback and drops the pose. */
  revision: number;
  sample(motion: string, timeSeconds: number): Promise<MotionPose>;
  onPose(pose: MotionPose | null): void;
  /** How many built occurrences a pose moves; a pose that moves none is reported, not shown silently. */
  coverage(pose: MotionPose): number;
}

const format = (value: number, unit: string) => `${Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(unit === 'deg' ? 1 : 2))}${unit ? ` ${unit}` : ''}`;

/** Play, pause and scrub an authored Motion. The kernel samples every pose; the strip only asks for
 * one at a time, so a slow sample drops frames instead of queueing them. */
export function MotionStrip({ clips, revision, sample, onPose, coverage }: Props) {
  const [name, setName] = useState(clips[0]?.name ?? '');
  const clip = clips.find(c => c.name === name) ?? clips[0];
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pose, setPose] = useState<MotionPose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const wanted = useRef<number | null>(null);
  const clock = useRef<{ start: number; from: number } | null>(null);

  const request = (t: number) => {
    if (!clip) return;
    wanted.current = t;
    if (inFlight.current) return;
    const run = () => {
      const at = wanted.current;
      if (at === null) return;
      wanted.current = null;
      inFlight.current = true;
      sample(clip.name, at)
        .then(next => { setPose(next); onPose(next); setError(null); })
        .catch(reason => { setPlaying(false); setError(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { inFlight.current = false; if (wanted.current !== null) run(); });
    };
    run();
  };

  // A new build or another clip starts from the built pose.
  useEffect(() => { setPlaying(false); setTime(0); setPose(null); onPose(null); setError(null); }, [revision, clip?.name]);
  useEffect(() => () => onPose(null), []);

  useEffect(() => {
    if (!playing || !clip) { clock.current = null; return; }
    clock.current = { start: performance.now(), from: time >= clip.durationSeconds ? 0 : time };
    let frame = 0;
    const tick = (now: number) => {
      const c = clock.current!;
      let t = c.from + (now - c.start) / 1000;
      if (t >= clip.durationSeconds) {
        if (clip.repeat === 'Loop') t %= clip.durationSeconds;
        else { setTime(clip.durationSeconds); request(clip.durationSeconds); setPlaying(false); return; }
      }
      setTime(t); request(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, clip?.name]);

  if (!clip) return null;
  const units = new Map(clip.tracks.map(track => [track.jointName, track.valueDimension === 'Angle' ? 'deg' : 'mm']));
  const joints = Object.entries(pose?.state ?? {});
  const moved = pose ? coverage(pose) : null;
  return <div className="motion-strip" role="group" aria-label="Motion" data-moved={moved ?? undefined}>
    <div className="motion-controls">
      <button className="motion-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(p => !p)}>{playing ? '❚❚' : '▶'}</button>
      {clips.length > 1
        ? <select aria-label="Motion clip" value={clip.name} onChange={event => setName(event.target.value)}>{clips.map(c => <option key={c.name}>{c.name}</option>)}</select>
        : <strong>{clip.name}</strong>}
      <input aria-label="Motion time" type="range" min={0} max={clip.durationSeconds} step={0.001} value={time}
        onChange={event => { const t = Number(event.target.value); setPlaying(false); setTime(t); request(t); }} />
      <span className="motion-time">{time.toFixed(2)} / {clip.durationSeconds.toFixed(2)} s{clip.repeat === 'Loop' ? ' · loop' : ''}</span>
      {pose && <button className="motion-reset" title="Back to the built pose" onClick={() => { setPlaying(false); setTime(0); setPose(null); onPose(null); }}>Reset</button>}
    </div>
    {joints.length > 0 && <div className="motion-joints" aria-label="Joint values">{joints.map(([joint, value]) =>
      <span key={joint} className={units.has(joint) ? 'driven' : undefined} title={units.has(joint) ? 'Driven by this motion' : 'Not driven by this motion'}><b>{joint}</b> {format(value, units.get(joint) ?? '')}</span>)}</div>}
    {moved === 0 && pose && pose.transforms.length > 0 && <p className="motion-error" role="alert">This pose names no part of the displayed model, so nothing moves. Rebuild and try again.</p>}
    {error && <p className="motion-error" role="alert">{error}</p>}
  </div>;
}

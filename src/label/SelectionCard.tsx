import { useEffect, useMemo, useState } from 'react';
import type { MeasurementResult, ModelSession, SelectionDescription } from '@aetheris/cad';
import { acuteAngle, findFace } from './geometry';
import { measureSelection, measurementMode } from './measure';

/** The current selection's measurement, recomputed when the selection or the model changes. */
export function useSelectionMeasurement(model: ModelSession | null, picks: readonly SelectionDescription[]) {
  const faces = useMemo(() => picks.map(p => model && p.selector && p.topologyKind !== 'Edge' ? findFace(model.mesh, p.selector, p.occurrenceId) : null), [model, picks]);
  const [state, setState] = useState<{ result: MeasurementResult | null; error: string | null; pending: boolean }>({ result: null, error: null, pending: false });
  useEffect(() => {
    let live = true;
    if (!model || !measurementMode(faces)) { setState({ result: null, error: null, pending: false }); return; }
    setState({ result: null, error: null, pending: true });
    measureSelection(model, faces).then(result => { if (live) setState({ result, error: null, pending: false }); },
      error => { if (live) setState({ result: null, error: error instanceof Error ? error.message : String(error), pending: false }); });
    return () => { live = false; };
  }, [model, model?.revision, faces]);
  return { ...state, faces };
}

const kindLabel = (p: SelectionDescription) => p.topologyKind === 'Edge' ? 'Edge' : p.surfaceKind ?? 'Face';
const shortSelector = (p: SelectionDescription) => p.selector?.match(/"(#[^"]+)"/)?.[1] ?? p.faceId.split(':').pop();

/** Chips for the ordered selection and what it measures. Read-only: labeling happens in the Label tab. */
export function SelectionCard({ picks, measurement, inches, onToggleUnits, onRemove, onClear, onLabel }: {
  picks: readonly SelectionDescription[];
  measurement: ReturnType<typeof useSelectionMeasurement>;
  inches: boolean;
  onToggleUnits(): void;
  onRemove(index: number): void;
  onClear(): void;
  /** Present outside the Label tab: opens it with this selection. */
  onLabel?: () => void;
}) {
  if (picks.length === 0) return null;
  const fmt = (mm: number) => `${(mm / (inches ? 25.4 : 1)).toLocaleString('en-US', { minimumFractionDigits: inches ? 4 : 3, maximumFractionDigits: inches ? 5 : 4 })} ${inches ? 'in' : 'mm'}`;
  const { result, error, pending, faces } = measurement;
  const single = picks.length === 1 ? faces[0] : null;
  // Plane–plane: the angle between the faces. Plane–axis: the angle between the axis and the plane.
  const mixed = faces.length === 2 && faces.some(f => f?.surfaceKind === 'Plane') && faces.some(f => f?.surfaceKind !== 'Plane');
  const between = faces.length === 2 && faces.every(f => f?.direction) ? acuteAngle(faces[0]!.direction!, faces[1]!.direction!) : null;
  const planesAngle = between == null ? null : mixed ? 90 - between : between;
  return <aside className="selection-card" aria-label="Selection">
    <div className="selection-chips">
      {picks.map((p, i) => <span key={`${p.occurrenceId}/${p.faceId}`} className="selection-chip" title={p.selector ?? p.faceId}>
        <b>{i + 1}</b>{kindLabel(p)} {shortSelector(p)}<button type="button" aria-label={`Remove ${kindLabel(p)} ${shortSelector(p)} from selection`} onClick={() => onRemove(i)}>×</button></span>)}
      <button type="button" className="selection-clear" onClick={onClear} title="Clear selection (Esc)">Clear</button>
    </div>
    <div className="selection-measure" aria-live="polite">
      {single?.diameterMm != null && <div>Ø <b>{fmt(single.diameterMm)}</b></div>}
      {pending && <div>Measuring the exact geometry…</div>}
      {result && <>
        {result.distanceMm != null && <div>Distance <b>{fmt(result.distanceMm)}</b></div>}
        {result.angleDegrees != null && <div>Angle <b>{result.angleDegrees.toFixed(4)}°</b></div>}
        {result.deltaMm && result.distanceMm != null && <small>ΔX {fmt(result.deltaMm[0]!)} · ΔY {fmt(result.deltaMm[1]!)} · ΔZ {fmt(result.deltaMm[2]!)}</small>}
        {result.distanceMm == null && result.angleDegrees != null && result.angleDegrees > 1e-6 && <small>Not parallel: no single distance.</small>}
      </>}
      {!result && !pending && planesAngle != null && <div>{mixed ? 'Axis to plane' : 'Angle'} <b>{planesAngle.toFixed(3)}°</b> <small>(from display normals)</small></div>}
      {error && <small className="label-error">{error}</small>}
      {picks.length === 1 && !single?.diameterMm && <small>Ctrl- or Shift-click a second face to measure between them.</small>}
    </div>
    <div className="selection-footer">
      <button type="button" onClick={onToggleUnits}>{inches ? 'in' : 'mm'}</button>
      {onLabel && <button type="button" className="primary" onClick={onLabel}>Label…</button>}
    </div>
  </aside>;
}

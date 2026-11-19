import { useCallback, useEffect, useRef, useState } from 'react';
import type { EdgeFinishAdmission, EdgeFinishCandidate, EdgeFinishKind, EdgeFinishRange, ModelSession } from '@aetheris/cad';

/** One kind's admission for the current build: still checking, checked, or the check failed. */
export type AdmissionState = { status: 'loading' } | { status: 'ready'; admission: EdgeFinishAdmission } | { status: 'failed'; error: string };

/** The edges to light while picking: admitted ones, and the refused ones (left unlit, explained on click). */
export interface FinishHighlight { readonly kind: EdgeFinishKind; readonly admitted: ReadonlySet<string>; readonly refused: ReadonlySet<string> }

/** The candidate an edge belongs to, by display topology id (`edge:12`). */
export function candidateFor(admission: EdgeFinishAdmission | undefined, edgeTopologyId: string | null | undefined): EdgeFinishCandidate | undefined {
  if (!admission || !edgeTopologyId) return undefined;
  return admission.edges.find(candidate => candidate.edgeIds.includes(edgeTopologyId));
}

/** Whether the Fillet or Chamfer button may start on the selected edge, and what to say when it may not. */
export function finishVerdict(state: AdmissionState | undefined, edgeTopologyId: string | null | undefined, kind: EdgeFinishKind):
  { readonly enabled: boolean; readonly note: string | null } {
  const noun = kind === 'fillet' ? 'fillet' : 'chamfer';
  if (!state || state.status === 'loading') return { enabled: false, note: `Checking whether this edge takes a ${noun}…` };
  if (state.status === 'failed') return { enabled: false, note: `Could not check this edge: ${state.error}` };
  const candidate = candidateFor(state.admission, edgeTopologyId);
  if (!candidate) return { enabled: false, note: null };
  return candidate.admitted ? { enabled: true, note: null } : { enabled: false, note: candidate.reason ?? `This edge cannot take a ${noun}.` };
}

/** The highlight for finish-picking mode, once that kind's admission is known. */
export function finishHighlight(kind: EdgeFinishKind, state: AdmissionState | undefined): FinishHighlight | null {
  if (state?.status !== 'ready') return null;
  const admitted = new Set<string>(), refused = new Set<string>();
  for (const candidate of state.admission.edges) for (const id of candidate.edgeIds) (candidate.admitted ? admitted : refused).add(id);
  return { kind, admitted, refused };
}

/** A one-line summary for finish-picking mode, in the words of what is on screen. */
export function finishSummary(kind: EdgeFinishKind, state: AdmissionState | undefined): string {
  const noun = kind === 'fillet' ? 'fillet' : 'chamfer';
  if (!state || state.status === 'loading') return `Finding the edges that can take a ${noun}…`;
  if (state.status === 'failed') return `Could not check the edges: ${state.error}`;
  const admitted = state.admission.edges.filter(c => c.admitted).length;
  const refused = state.admission.edges.length - admitted;
  if (admitted === 0) return `No edge here can take a ${noun} yet. Click an edge to see why.`;
  const lit = `${admitted} ${admitted === 1 ? 'edge' : 'edges'} can take a ${noun}, shown in gold. Click one to set its size.`;
  return refused === 0 ? lit : `${lit} Click a grey edge to see why it can't.`;
}

/** What to say about the selected edge's finishes: one line per kind that cannot start, once known. */
export function finishNotes(states: Readonly<Record<EdgeFinishKind, AdmissionState | undefined>>, edgeTopologyId: string | null | undefined,
  first: EdgeFinishKind | null): string[] {
  const kinds: EdgeFinishKind[] = first === 'chamfer' ? ['chamfer', 'fillet'] : ['fillet', 'chamfer'];
  if (kinds.every(kind => !states[kind] || states[kind]!.status === 'loading')) return ['Checking which finishes this edge can take…'];
  const notes: string[] = [];
  for (const kind of kinds) {
    const state = states[kind];
    if (!state || state.status === 'loading') continue;
    const verdict = finishVerdict(state, edgeTopologyId, kind);
    if (!verdict.enabled && verdict.note) notes.push(`${kind === 'fillet' ? 'Fillet' : 'Chamfer'}: ${verdict.note}`);
  }
  return notes;
}

/**
 * The runtime's trial-build admission for the current build, per finish kind, loaded on demand and
 * dropped when the model or its revision changes. Ranges are fetched per edge when authoring starts.
 */
export function useEdgeFinishAdmission(model: ModelSession | null) {
  const key = model ? `${model.id}:${model.revision}` : '';
  const [states, setStates] = useState<Readonly<Record<string, AdmissionState>>>({});
  const current = useRef(key); current.current = key;
  const requested = useRef(new Set<string>());
  useEffect(() => { requested.current = new Set(); setStates({}); }, [key]);
  const load = useCallback((kind: EdgeFinishKind) => {
    if (!model || !key) return;
    const slot = `${key}:${kind}`;
    if (requested.current.has(slot)) return;
    requested.current.add(slot);
    setStates(s => ({ ...s, [slot]: { status: 'loading' } }));
    void model.edgeFinishAdmission(kind).then(
      admission => { if (current.current === key) setStates(s => ({ ...s, [slot]: { status: 'ready', admission } })); },
      (error: unknown) => {
        if (current.current !== key) return;
        requested.current.delete(slot);
        setStates(s => ({ ...s, [slot]: { status: 'failed', error: error instanceof Error ? error.message : String(error) } }));
      });
  }, [model, key]);
  const state = useCallback((kind: EdgeFinishKind): AdmissionState | undefined => states[`${key}:${kind}`], [states, key]);
  const range = useCallback((kind: EdgeFinishKind, edgeTopologyId: string): Promise<EdgeFinishRange> =>
    model ? model.edgeFinishRange(kind, edgeTopologyId) : Promise.reject(new Error('No model is built.')), [model]);
  return { load, state, range };
}

import { describe, expect, it } from 'vitest';
import type { EdgeFinishAdmission } from '@aetheris/cad';
import { candidateFor, finishHighlight, finishNotes, finishSummary, finishVerdict, type AdmissionState } from './edgeFinishAdmission';
import { edgeRangeText, edgeSizeProblem } from './AuthoringPanel';

const admission: EdgeFinishAdmission = { revision: 3, kind: 'Fillet', edges: [
  { edgeIds: ['edge:4', 'edge:9'], body: 'Plate', face: 'Longitudinal', target: 'P.Outer.A.Start', label: 'Outside corner · full length', admitted: true, probeMm: 0.05, code: null, reason: null },
  { edgeIds: ['edge:7'], body: 'Plate', face: 'Top', target: 'P.Outer.B', label: 'Extrusion end-face edge', admitted: false, probeMm: null,
    code: 'EdgeFinishFilletNotOffered', reason: 'Full-edge fillets are not offered on extrusion end-face edges.' },
] };
const ready: AdmissionState = { status: 'ready', admission };

describe('edge finish admission', () => {
  it('finds the candidate an edge belongs to', () => {
    expect(candidateFor(admission, 'edge:9')?.target).toBe('P.Outer.A.Start');
    expect(candidateFor(admission, 'edge:99')).toBeUndefined();
  });
  it('enables a button only for an admitted edge, and says why otherwise', () => {
    expect(finishVerdict(ready, 'edge:4', 'fillet')).toEqual({ enabled: true, note: null });
    expect(finishVerdict(ready, 'edge:7', 'fillet')).toEqual({ enabled: false, note: 'Full-edge fillets are not offered on extrusion end-face edges.' });
    expect(finishVerdict({ status: 'loading' }, 'edge:4', 'fillet').enabled).toBe(false);
    expect(finishVerdict({ status: 'failed', error: 'stale' }, 'edge:4', 'chamfer').note).toContain('stale');
  });
  it('lights admitted edges only', () => {
    const lit = finishHighlight('fillet', ready)!;
    expect([...lit.admitted]).toEqual(['edge:4', 'edge:9']);
    expect([...lit.refused]).toEqual(['edge:7']);
    expect(finishHighlight('fillet', { status: 'loading' })).toBeNull();
    expect(finishSummary('fillet', ready)).toBe('1 edge can take a fillet, shown in gold. Click one to set its size. Click a grey edge to see why it can\'t.');
  });
  it('explains each finish the selected edge cannot take, once known', () => {
    expect(finishNotes({ fillet: { status: 'loading' }, chamfer: undefined }, 'edge:7', null)).toEqual(['Checking which finishes this edge can take…']);
    expect(finishNotes({ fillet: ready, chamfer: { status: 'loading' } }, 'edge:7', null))
      .toEqual(['Fillet: Full-edge fillets are not offered on extrusion end-face edges.']);
    expect(finishNotes({ fillet: ready, chamfer: { status: 'loading' } }, 'edge:4', null)).toEqual([]);
  });
  it('checks a size against the edge range', () => {
    const range = { revision: 3, kind: 'Fillet' as const, edgeId: 'edge:4', minimumMm: 0.01, maximumMm: 4.2, maximumIsSearchLimit: false };
    expect(edgeRangeText(range)).toBe('0.01 mm to 4.2 mm');
    expect(edgeSizeProblem(2, range, 'Radius')).toBeNull();
    expect(edgeSizeProblem(5, range, 'Radius')).toContain('0.01 mm to 4.2 mm');
    expect(edgeSizeProblem(5, { ...range, maximumIsSearchLimit: true }, 'Radius')).toBeNull();
    expect(edgeSizeProblem(5, null, 'Radius')).toBeNull();
  });
});

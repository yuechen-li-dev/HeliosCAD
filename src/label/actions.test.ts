import { describe, expect, it } from 'vitest';
import type { LanguageOutline, SelectionDescription } from '@aetheris/cad';
import { recognizedHoles } from './holes';
import { checkValues, emitDeclarations, labelActions, labelOperations, nextDatumLetter, pmiRecords, type LabelDatum } from './actions';
import type { LabelFace } from './geometry';
import { defaultGrid, fitAllowances, roundTo } from './fits';

const pick = (id: number, extra: Partial<SelectionDescription> = {}): SelectionDescription => ({
  semanticEntityId: 'part', faceId: `face:${id}`, occurrenceId: 'occ', definitionId: 'def', semanticTopologyId: null, topologyKind: 'Face',
  outputRole: null, originFeature: null, selector: `part.face("#${id}")`, sourceAddressability: 'ImportedStable', selectorReason: null,
  source: null, buildRevision: 1, sourceAddressable: true, ...extra,
});
const face = (id: number, kind: 'Plane' | 'Cylinder', direction: number[], diameterMm: number | null = null, point = [0, 0, 0]): LabelFace => ({
  selector: `part.face("#${id}")`, occurrenceId: 'occ', faceId: `face:${id}`, surfaceKind: kind, diameterMm, direction, point, pointNormal: direction,
});
const node = (id: string, kind: string, name: string | null, parentId: string | null, fields: Record<string, string> = {}) => ({
  id, kind, variant: null, modifiers: [], name, occurrence: false, parentId, order: 0, span: { start: 0, length: 0 }, nameSpan: null, schemaId: null,
  parameters: [], fields: Object.entries(fields).map(([name, text]) => ({ name, text, span: { start: 0, length: 0 } })), children: [],
}) as unknown as LanguageOutline['nodes'][number];
const outline = (...nodes: LanguageOutline['nodes']): LanguageOutline => ({ version: 'firmament-outline/1', document: 'm', revision: '1',
  nodes: [node('m', 'Model', 'Part', null), ...nodes], edges: [], externals: [], diagnostics: [] });

const z = [0, 0, 1], x = [1, 0, 0];
const datumA: LabelDatum = { name: 'A', selector: 'part.face("#1")', face: face(1, 'Plane', z), nodeId: 'a' };
const withA = outline(node('p', 'Pmi', null, 'm'), node('a', 'Datum', 'A', 'p', { target: 'part.face("#1")' }));

describe('label actions', () => {
  it('offers a datum, flatness and the orientation that holds for one plane', () => {
    const { actions } = labelActions([pick(2)], [face(2, 'Plane', [0, 0, -1])], [datumA], withA);
    expect(actions.map(a => a.id)).toEqual(['datum', 'flatness', 'parallelism', 'perpendicularity']);
    expect(actions[0]!.title).toBe('Datum B');
    expect(actions.find(a => a.id === 'parallelism')!.disabled).toBeNull();
    expect(actions.find(a => a.id === 'parallelism')!.defaultDatums).toEqual(['A']);
    expect(actions.find(a => a.id === 'perpendicularity')!.disabled).toMatch(/No datum plane is perpendicular/);
  });
  it('puts perpendicularity first for a side face', () => {
    const { actions } = labelActions([pick(3)], [face(3, 'Plane', x)], [datumA], withA);
    expect(actions.slice(2).map(a => a.id)).toEqual(['perpendicularity', 'parallelism']);
  });
  it('refuses a second datum on the same face and orientation without datums', () => {
    const { actions } = labelActions([pick(1)], [datumA.face], [datumA], withA);
    expect(actions[0]!.disabled).toBe('This face is already datum A.');
    const bare = labelActions([pick(5)], [face(5, 'Plane', z)], [], outline()).actions;
    expect(bare.find(a => a.id === 'parallelism')!.disabled).toMatch(/Declare a datum first/);
  });
  it('offers a hole its diameter, position and axis perpendicularity', () => {
    const { actions } = labelActions([pick(9, { diameterMm: 6.6002 })], [face(9, 'Cylinder', z, 6.6002)], [datumA], withA);
    expect(actions.map(a => a.id)).toEqual(['diameter', 'position', 'axis-perpendicularity', 'cylindricity', 'datum', 'recognize']);
    expect(actions[0]!.measured).toBe(6.6002);
    expect(actions[2]!.disabled).toBeNull();
    const tilted = labelActions([pick(9)], [face(9, 'Cylinder', x, 6)], [datumA], withA).actions;
    expect(tilted[2]!.disabled).toMatch(/not perpendicular to this axis|No datum plane/);
  });
  it('offers the distance between two parallel planes first, measured', () => {
    const { actions } = labelActions([pick(2), pick(7)], [face(2, 'Plane', z, null, [0, 0, 24.9973]), face(7, 'Plane', [0, 0, -1])], [], outline());
    const distance = actions[0]!;
    expect(distance.id).toBe('distance');
    expect(distance.measured).toBeCloseTo(24.9973, 9);
    expect(emitDeclarations(distance, { name: 'Thickness', nominal: 25, plus: 0.1, minus: 0.1 })).toEqual([
      'Distance Thickness { between: [part.face("#2"), part.face("#7")] value: 25mm tolerance: PlusMinus(0.1mm, 0.1mm) }']);
    const written = outline(node('p', 'Pmi', null, 'm'), node('d', 'Distance', 'Thickness', 'p', { between: '[part.face("#7"), part.face("#2")]' }));
    expect(labelActions([pick(2), pick(7)], [face(2, 'Plane', z, null, [0, 0, 25]), face(7, 'Plane', [0, 0, -1])], [], written).actions[0]!.disabled)
      .toBe('Thickness already sets this distance; edit it instead.');
  });
  it('offers a distance from a parallel datum plane', () => {
    const { actions } = labelActions([pick(2)], [face(2, 'Plane', z, null, [5, 5, 12.5])], [datumA], withA);
    const distance = actions.find(a => a.id === 'distance')!;
    expect(distance.title).toBe('Distance from A 12.500');
    expect(distance.between).toEqual(['part.face("#1")', 'part.face("#2")']);
  });
  it('makes a cylinder a datum axis', () => {
    const { actions } = labelActions([pick(9)], [face(9, 'Cylinder', z, 6)], [], outline());
    expect(emitDeclarations(actions.find(a => a.id === 'datum')!, { name: 'A' })).toEqual(['Datum A { target: part.face("#9") }']);
  });
  it('makes the second of two parallel planes a datum for parallelism', () => {
    const { actions } = labelActions([pick(2), pick(7)], [face(2, 'Plane', z), face(7, 'Plane', [0, 0, -1])], [], outline());
    const parallelism = actions[1]!;
    expect(parallelism.id).toBe('parallelism');
    expect(parallelism.newDatum).toEqual({ selector: 'part.face("#7")', letter: 'A' });
    expect(actions[2]!.disabled).toMatch(/not perpendicular/);
    expect(emitDeclarations(parallelism, { name: 'TopParallel', tolerance: 0.05, datumRefs: ['A'] })).toEqual([
      'Datum A { target: part.face("#7") }',
      'Parallelism TopParallel { target: part.face("#2") tolerance: 0.05mm datumRefs: [A] }',
    ]);
  });
  it('does not offer parallelism for faces 2 degrees apart', () => {
    const tilt = [Math.sin(2 * Math.PI / 180), 0, Math.cos(2 * Math.PI / 180)];
    const { actions } = labelActions([pick(2), pick(7)], [face(2, 'Plane', z), face(7, 'Plane', tilt)], [], outline());
    expect(actions.every(a => a.disabled)).toBe(true);
    expect(actions[0]!.disabled).toMatch(/2\.000° apart: a distance needs parallel faces/);
    expect(actions[1]!.disabled).toMatch(/2\.000° apart, not parallel/);
  });
  it('refuses edges, generated faces and mixed parts with a reason', () => {
    expect(labelActions([pick(1, { topologyKind: 'Edge' })], [null], [], null).notice).toMatch(/Edges/);
    expect(labelActions([pick(1, { sourceAddressability: 'AuthoredStable', originFeature: 'Boss' })], [null], [], null).notice).toMatch(/Boss/);
    expect(labelActions([pick(1), pick(2, { occurrenceId: 'other' })], [null, null], [], null).notice).toMatch(/spans parts/);
  });
  it('refuses a second record of the same kind on the same face', () => {
    const flat = outline(node('p', 'Pmi', null, 'm'), node('a', 'Datum', 'A', 'p', { target: 'part.face("#1")' }),
      node('f', 'Flatness', 'TopFlat', 'p', { target: 'part.face("#2")', tolerance: '0.05mm' }));
    const { actions } = labelActions([pick(2)], [face(2, 'Plane', z)], [datumA], flat);
    expect(actions.find(a => a.id === 'flatness')!.disabled).toBe('TopFlat already sets this flatness; edit it instead.');
    expect(actions.find(a => a.id === 'parallelism')!.disabled).toBeNull();
  });
  it('offers a note with nothing selected', () => {
    const [note] = labelActions([], [], [], null).actions;
    expect(emitDeclarations(note!, { name: 'Material', text: 'PA12, black' })).toEqual(['Note Material { text: "PA12, black" }']);
  });
});

describe('holes', () => {
  const half = (id: number, axisPoint = [0, 0, 0], d = 6.6) => ({ ...face(id, 'Cylinder', z, d), axisPoint });
  const recognized = (name: string, ...ids: number[]) => node(name, 'Region', name, 'r', { kind: 'HoleShaft', stepFaceEntities: `[${ids.map(i => `"#${i}"`).join(', ')}]` });
  const tree = (...regions: LanguageOutline['nodes']) => outline(node('i', 'InlineStep', 'part', 'm'), node('r', 'Recognize', 'part', 'm'), ...regions,
    node('p', 'Pmi', null, 'm'), node('a', 'Datum', 'A', 'p', { target: 'part.face("#1")' }));
  it('asks to recognize a hole split into halves before labeling it', () => {
    const halves = [half(20), half(21)];
    const { actions, notice } = labelActions([pick(20, { diameterMm: 6.6 })], [halves[0]!], [datumA], withA, [], halves);
    expect(actions.map(a => a.id)).toEqual(['recognize']);
    expect(notice).toMatch(/split this hole/);
    expect(emitDeclarations(actions[0]!, { name: 'Bore' })).toEqual(['Region Bore { kind: HoleShaft stepFaceEntities: ["#20", "#21"] }']);
    expect(labelOperations(tree(), ['Region Bore { kind: HoleShaft stepFaceEntities: ["#20", "#21"] }'], 'part'))
      .toEqual([{ kind: 'insertDeclaration', parent: 'r', source: 'Region Bore { kind: HoleShaft stepFaceEntities: ["#20", "#21"] }' }]);
    expect(labelOperations(withA, ['Region Bore { kind: HoleShaft stepFaceEntities: ["#20"] }'], 'part')[0])
      .toMatchObject({ parent: 'm', source: 'Recognize part {\n    Region Bore { kind: HoleShaft stepFaceEntities: ["#20"] }\n}' });
  });
  it('labels a recognized hole by its name, whichever half is picked', () => {
    const t = tree(recognized('Bore', 20, 21));
    const holes = recognizedHoles(t), halves = [half(20), half(21)];
    const { actions } = labelActions([pick(21)], [halves[1]!], [datumA], t, holes, halves);
    expect(actions.map(a => a.id)).toEqual(['diameter', 'position', 'axis-perpendicularity', 'cylindricity']);
    expect(actions.every(a => a.target === 'part.region("Bore")')).toBe(true);
    // Both halves picked are still one hole.
    expect(labelActions([pick(20), pick(21)], halves, [datumA], t, holes, halves).actions[0]!.title).toBe('Diameter Ø6.600');
  });
  it('recognizes several holes at once, then gives them one 4X callout', () => {
    const four = [1, 2, 3, 4].map(i => half(30 + i, [i * 20, 0, 0], 35));
    const fresh = labelActions(four.map((_, i) => pick(31 + i)), four, [datumA], withA, [], four).actions;
    expect(fresh.map(a => a.title)).toEqual(['Recognize 4 holes']);
    expect(emitDeclarations(fresh[0]!, { name: 'Hole' })).toHaveLength(4);
    expect(checkValues(fresh[0]!, { name: 'Hole' }, withA).errors).toEqual([]);
    const t = tree(...[1, 2, 3, 4].map(i => recognized(`Hole${i}`, 30 + i)));
    const { actions } = labelActions(four.map((_, i) => pick(31 + i)), four, [datumA], t, recognizedHoles(t), four);
    expect(actions.map(a => a.title)).toEqual(['4X Ø35.000', '4X Position']);
    expect(emitDeclarations(actions[0]!, { name: 'Bolt', nominal: 35, plus: 0.1, minus: 0 }))
      .toEqual(['HoleDiameter Bolt { target: [Hole1, Hole2, Hole3, Hole4] value: 35mm tolerance: PlusMinus(0.1mm, 0mm) }']);
    const mixed = [...four.slice(0, 3), half(34, [80, 0, 0], 25)];
    expect(labelActions(mixed.map((_, i) => pick(31 + i)), mixed, [datumA], t, recognizedHoles(t), mixed).actions[0]!.disabled).toMatch(/differ in diameter/);
  });
});

describe('label values', () => {
  const hole = labelActions([pick(9, { diameterMm: 6.6002 })], [face(9, 'Cylinder', z, 6.6002)], [datumA], withA).actions;
  it('requires explicit allowances and warns when the model is outside its own band', () => {
    expect(checkValues(hole[0]!, { name: 'Bore', nominal: 6.6 }, withA).errors.join()).toMatch(/never inferred/);
    expect(checkValues(hole[0]!, { name: 'Bore', nominal: 6.6, plus: 0.1, minus: 0.1 }, withA)).toEqual({ errors: [], warnings: [] });
    expect(checkValues(hole[0]!, { name: 'Bore', nominal: 6.5, plus: 0.05, minus: 0 }, withA).warnings[0]).toMatch(/does not meet its own requirement/);
    expect(emitDeclarations(hole[0]!, { name: 'Bore', nominal: 6.6, plus: 0.015, minus: 0 })).toEqual(['HoleDiameter Bore { target: part.face("#9") value: 6.6mm tolerance: PlusMinus(0.015mm, 0mm) }']);
  });
  it('accepts only declared, distinct datums and rejects taken names', () => {
    const position = hole[1]!;
    expect(checkValues(position, { name: 'A', tolerance: 0.1, datumRefs: ['A'] }, withA).errors).toContain('The name A is already used.');
    expect(checkValues(position, { name: 'P', tolerance: 0.1, datumRefs: ['A', 'A'] }, withA).errors).toContain('A datum can be referenced once.');
    expect(checkValues(position, { name: 'P', tolerance: 0.1, datumRefs: ['Z'] }, withA).errors).toContain('Z is not a declared datum.');
    expect(emitDeclarations(position, { name: 'P', tolerance: 0.1, datumRefs: ['A'], maximumMaterial: true }))
      .toEqual(['Position P { target: part.face("#9") tolerance: 0.1mm zone: Cylindrical datumRefs: [A] modifiers: [MaximumMaterial] }']);
  });
  it('skips I, O and Q and taken letters', () => {
    expect(nextDatumLetter(outline(...'ABCDEFGH'.split('').map(l => node(l, 'Datum', l, 'm'))))).toBe('J');
  });
  it('reads records and writes into an existing or a new Pmi block', () => {
    expect(pmiRecords(withA)).toEqual([{ nodeId: 'a', kind: 'Datum', name: 'A', target: 'part.face("#1")', fields: { target: 'part.face("#1")' } }]);
    expect(labelOperations(withA, ['Flatness F { target: part.face("#2") tolerance: 0.05mm }'])).toEqual([{ kind: 'insertDeclaration', parent: 'p', source: 'Flatness F { target: part.face("#2") tolerance: 0.05mm }' }]);
    expect(labelOperations(outline(), ['Datum A { target: part.face("#7") }', 'Datum B { target: part.face("#8") }'])[0])
      .toEqual({ kind: 'insertDeclaration', parent: 'm', source: 'Pmi {\n    Datum A { target: part.face("#7") }\n    Datum B { target: part.face("#8") }\n}' });
  });
});

describe('fits and rounding', () => {
  it('rounds export noise away without rounding real sizes', () => {
    expect([24.9973, 6.6, 100.3, 25.4, 24.95].map(defaultGrid)).toEqual([1, 0.1, 0.1, 0.1, 0.01]);
    expect(roundTo(24.9973, 1)).toBe(25);
    expect(roundTo(6.6000001, 0.1)).toBe(6.6);
  });
  it('expands H7 and H8 to allowances by size range', () => {
    expect(fitAllowances('H7', 10)).toEqual({ plus: 0.015, minus: 0 });
    expect(fitAllowances('H7', 10.01)).toEqual({ plus: 0.018, minus: 0 });
    expect(fitAllowances('H8', 6.6)).toEqual({ plus: 0.022, minus: 0 });
    expect(fitAllowances('H7', 600)).toBeNull();
  });
});

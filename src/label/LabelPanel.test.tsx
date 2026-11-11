import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LanguageOutline, ModelSession, SelectionDescription } from '@aetheris/cad';
import { LabelPanel } from './LabelPanel';
import type { CadRuntime } from '../sdk/CadRuntime';

const selection = (id: number): SelectionDescription => ({
  semanticEntityId: 'part', faceId: `face:${id}`, occurrenceId: 'occ', definitionId: 'def', semanticTopologyId: null, topologyKind: 'Face',
  outputRole: null, originFeature: null, selector: `part.face("#${id}")`, sourceAddressability: 'ImportedStable', selectorReason: null,
  source: null, buildRevision: 1, sourceAddressable: true, surfaceKind: 'Plane',
});
// Two unit squares: face #1 at z = 0 (normal −Z) and face #2 at z = 10 (normal +Z).
const square = (z: number, n: number) => ({ positions: [0, 0, z, 1, 0, z, 1, 1, z, 0, 1, z], normals: Array(4).fill([0, 0, n]).flat() });
const a = square(0, -1), b = square(10, 1);
const model = {
  id: 'm', revision: 1,
  mesh: {
    occurrences: [{ id: 'occ', path: 'part', definitionId: 'def', semanticEntityId: 'part', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    definitions: [{ id: 'def', positions: new Float64Array([...a.positions, ...b.positions]), normals: new Float64Array([...a.normals, ...b.normals]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
      ranges: [{ startTriangle: 0, triangleCount: 2, faceId: 'face:1', selector: 'part.face("#1")', surfaceKind: 'Plane' },
        { startTriangle: 2, triangleCount: 2, faceId: 'face:2', selector: 'part.face("#2")', surfaceKind: 'Plane' }] }],
  },
} as unknown as ModelSession;
const node = (id: string, kind: string, name: string | null, parentId: string | null, fields: Record<string, string> = {}) => ({
  id, kind, variant: null, modifiers: [], name, occurrence: false, parentId, order: 0, span: { start: 0, length: 0 }, nameSpan: null, schemaId: null,
  parameters: [], fields: Object.entries(fields).map(([name, text]) => ({ name, text })), children: [],
}) as unknown as LanguageOutline['nodes'][number];
const outline = (...nodes: LanguageOutline['nodes']): LanguageOutline => ({ version: 'firmament-outline/1', document: 'part.firmament', revision: '3',
  nodes: [node('m', 'Model', 'Part', null), ...nodes], edges: [], externals: [], diagnostics: [] });

function panel(picks: SelectionDescription[], tree: LanguageOutline) {
  const onApply = vi.fn(async () => null);
  render(<LabelPanel picks={picks} model={model} outline={tree} runtime={{} as CadRuntime} source="" sourceName="part.firmament" sourceRevision={3}
    documents={{}} root="part.firmament" disabled={null} onPreview={() => {}} onApply={onApply} onSelectTargets={() => {}} />);
  return onApply;
}

describe('LabelPanel', () => {
  it('writes the first datum into a new Pmi block', async () => {
    const onApply = panel([selection(1)], outline());
    expect(screen.getByRole('radio', { name: 'Datum A' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ kind: 'insertDeclaration', parent: 'm', source: 'Pmi {\n    Datum A { target: part.face("#1") }\n}' }],
      'Labeled Datum A on part.face("#1")'));
  });
  it('offers parallelism to the parallel datum and blocks Apply until a tolerance is entered', async () => {
    const tree = outline(node('p', 'Pmi', null, 'm'), node('a', 'Datum', 'A', 'p', { target: 'part.face("#1")' }));
    const onApply = panel([selection(2)], tree);
    expect(screen.getByRole('radio', { name: /Perpendicularity/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Parallelism to A' }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    expect(screen.getByLabelText('Primary datum')).toHaveValue('A');
    fireEvent.change(screen.getByLabelText('Tolerance (mm)'), { target: { value: '0.02' } });
    expect(screen.getByLabelText('Source to write')).toHaveTextContent('Parallelism Parallelism { target: part.face("#2") tolerance: 0.02mm datumRefs: [A] }');
    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ kind: 'insertDeclaration', parent: 'p',
      source: 'Parallelism Parallelism { target: part.face("#2") tolerance: 0.02mm datumRefs: [A] }' }], expect.any(String)));
  });
  it('lists records by group and selects a record’s target', () => {
    const select = vi.fn();
    render(<LabelPanel picks={[]} model={model} outline={outline(node('p', 'Pmi', null, 'm'), node('a', 'Datum', 'A', 'p', { target: 'part.face("#1")' }))}
      runtime={{} as CadRuntime} source="" sourceName="part.firmament" sourceRevision={3} documents={{}} root="part.firmament" disabled={null}
      onPreview={() => {}} onApply={async () => null} onSelectTargets={select} />);
    fireEvent.click(screen.getByRole('button', { name: /A\s*Datum/ }));
    expect(select).toHaveBeenCalledWith(['part.face("#1")']);
    expect(screen.getByRole('radio', { name: 'Note' })).toBeChecked();
  });
});

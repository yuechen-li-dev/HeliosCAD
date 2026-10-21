import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LanguageOutline, OutlineNode, PatternProjection } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { PatternEditor } from './PatternEditor';

const node = (id: string, kind: string, fields: OutlineNode['fields'] = []): OutlineNode => ({ id, kind, name: id.split('/').at(-1)!, variant: null, modifiers: [], occurrence: false, parentId: null, order: 0, span: { start: 0, length: 1 }, nameSpan: null, schemaId: null, parameters: [], fields, children: [] });
const field = (name: string, text: string): OutlineNode['fields'][number] => ({ name, text, shape: 'expression', span: { start: 0, length: 1 }, valueSpan: { start: 0, length: 1 } });
const outline: LanguageOutline = { version: 'firmament-outline/1', document: 'plate.firmament', revision: '7', edges: [], externals: [], diagnostics: [], nodes: [node('Plate', 'Model'), node('Plate/Modify:Stock', 'Modify'), node('Plate/Drills', 'Pattern'), { ...node('Plate/ExamplePad', 'Part'), occurrence: true, value: field('=', 'Pad<H:1mm>') }, node('Plate/Layout/Sites/Series#0', 'Series', [field('count', 'Count'), field('position', 'Point2(siteX(n, pitch), 0mm)')]), { ...node('siteX', 'Function'), value: field('=', '-30mm + pitch * n * n') }] };
const projection: PatternProjection = { version: 'firmament-patterns/1', document: 'plate.firmament', revision: '7', validationLevel: 'LayoutResolvedNotBuilt', diagnostics: [], patterns: [{ node: 'Plate/Drills', name: 'Drills', source: 'Layout.Sites', body: 'point => Drill(center: point)', controls: ['Plate/Layout/Sites/Series#0', 'siteX'], consumers: ['Plate/OtherDrills'], readOnlyReason: null }], layouts: [{ node: 'Plate/Layout/Sites', name: 'Layout.Sites', kind: 'Series', elementType: 'Point2', rows: [{ key: 'Site0', ordinal: 0, value: 'Point2(-30mm, 0mm)', coordinates: [-30, 0], stableId: 'concept:Layout.Sites.Site0', generatedIds: ['Drills.Site0'], span: null }] }] };
const mount = (result = projection) => {
  const onChange = vi.fn(); const runtime = { patterns: vi.fn().mockResolvedValue(result) } as unknown as CadRuntime;
  render(<PatternEditor source="source" candidate={null} sourceName="plate.firmament" revision={7} node="Plate/Drills" outline={outline} runtime={runtime} disabled={false} onChange={onChange} />);
  return { onChange, runtime };
};
describe('Pattern source editor', () => {
  it('edits the owning law and reference without baking evaluated instances', async () => {
    const { onChange, runtime } = mount();
    await screen.findByText('Site0');
    expect(runtime.patterns).toHaveBeenCalledWith('source', 'plate.firmament', '7');
    expect(screen.getByLabelText('Series#0.count')).toHaveValue('Count');
    fireEvent.change(screen.getByLabelText('siteX.='), { target: { value: '-25mm + pitch * n * n' } });
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'setValue', node: 'siteX', value: '-25mm + pitch * n * n' }]);
    expect(screen.getByText(/Other consumers/)).toHaveTextContent('Plate/OtherDrills');
    expect(screen.getByText(/Coordinates are local/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Point2(-30mm, 0mm)')).not.toBeInTheDocument();
  });
  it('edits an authored Set value rather than its evaluated row', async () => {
    const { onChange } = mount({ ...projection, layouts: [{ ...projection.layouts[0], kind: 'Keyed Set',
      rows: [{ ...projection.layouts[0].rows[0], authored: 'Point2(Pitch, 0mm)' }] }] });
    const control = await screen.findByLabelText('Set.Site0');
    expect(control).toHaveValue('Point2(Pitch, 0mm)');
    fireEvent.change(control, { target: { value: 'Point2(Pitch + 1mm, 0mm)' } });
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'setSetEntry', node: 'Plate/Layout/Sites', field: 'Site0', value: 'Point2(Pitch + 1mm, 0mm)' }]);
  });
  it('maps an existing component definition through explicit frame and coordinate laws', async () => {
    const { onChange } = mount(); await screen.findByText('Site0');
    fireEvent.change(screen.getByLabelText('Pattern application'), { target: { value: '__new' } });
    fireEvent.change(screen.getByLabelText('Component definition'), { target: { value: 'Pad<H:1mm>' } });
    fireEvent.change(screen.getByLabelText('From published frame'), { target: { value: 'Bottom.Frame' } });
    fireEvent.change(screen.getByLabelText('To assembly frame'), { target: { value: 'BoardSeat.Frame' } });
    expect(onChange.mock.lastCall![0].at(-1).source).toContain('point => <Part Item = Pad<H:1mm>>');
    expect(onChange.mock.lastCall![0].at(-1).source).toContain('from: Bottom.Frame; to: BoardSeat.Frame; translateLocal: [point.X, point.Y, 0mm]');
  });
  it('keeps Z in the default component placement for a Point3 collection', async () => {
    mount({ ...projection, layouts: [{ ...projection.layouts[0], elementType: 'Point3', rows: [{ ...projection.layouts[0].rows[0], coordinates: [-30, 0, 4] }] }] });
    await screen.findByText('Site0');
    fireEvent.change(screen.getByLabelText('Pattern application'), { target: { value: '__new' } });
    fireEvent.change(screen.getByLabelText('Component definition'), { target: { value: 'Pad<H:1mm>' } });
    expect(screen.getByLabelText('Placement law')).toHaveValue('[point.X, point.Y, point.Z]');
  });
  it('creates a Series recipe as structural edits with explicit stable keys', async () => {
    const { onChange } = mount(); await screen.findByText('Site0');
    fireEvent.change(screen.getByLabelText('Pattern application'), { target: { value: '__new' } });
    fireEvent.change(screen.getByLabelText('Layout kind'), { target: { value: 'series' } });
    fireEvent.change(screen.getByLabelText('Position law'), { target: { value: 'Point2(5mm * n * n, 0mm)' } });
    fireEvent.change(screen.getByLabelText('Keyed mapping'), { target: { value: 'point => Drill(center: point)' } });
    const operations = onChange.mock.lastCall![0];
    expect(operations).toHaveLength(2);
    expect(operations[0].source).toContain('keyPrefix: Site; position: Point2(5mm * n * n, 0mm)');
    expect(operations[1].source).toContain('over Layout.Sites { point => Drill(center: point) }');
    expect(operations[1].parent).toBe('Plate/Modify:Stock');
  });
});

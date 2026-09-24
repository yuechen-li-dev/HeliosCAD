import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import { fakeModel, hole, plate, width } from '../test/fakes';
import type { SelectionDescription, SemanticSchema } from '@aetheris/cad';

const schema: SemanticSchema = { version: 'firmament-semantic-schema/1', projectionVersion: 'firmament-field-projection/1', constructs: [
  { id: 'Box', name: 'Box', context: 'Model', entry: null, description: null, compatibilityAlias: null,
    fields: [{ id: 'Box.Size', name: 'Size', kind: 'Vector', unit: 'None', required: false, default: null, choices: [], description: null, sourceEditable: true }], outputs: [] },
  { id: 'Hole', name: 'Hole', context: 'Modify', entry: null, description: null, compatibilityAlias: null,
    fields: [{ id: 'Hole.Diameter', name: 'Diameter', kind: 'Length', unit: 'Length', required: true, default: null, choices: [], description: null, sourceEditable: true }],
    outputs: [{ id: 'Hole.Wall', name: 'Wall', kind: 'Face', sourceAddressable: true, sourceRole: 'HoleWallFace' }] }
] };

describe('semantic inspector', () => {
  it('renders generated schema fields without construct-specific field branches', () => {
    const { rerender } = render(<Inspector model={fakeModel()} schema={schema} entityId={plate.id} diagnostics={[]} onApply={async () => true} />);
    expect(screen.getByText('Size')).toBeVisible();
    rerender(<Inspector model={fakeModel()} schema={schema} entityId={hole.id} diagnostics={[]} onApply={async () => true} />);
    expect(screen.getByText('Diameter')).toBeVisible();
    expect(screen.getByText('Wall')).toBeVisible();
  });
  it('shows identity and introspected property', () => { render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={async () => true} />); expect(screen.getByText(plate.id)).toBeVisible(); fireEvent.click(screen.getByText(/SOURCE OVERRIDES/)); expect(screen.getByLabelText('Width')).toHaveValue('50'); });
  it('commits a unit-aware value only on Apply', async () => { const apply = vi.fn(async () => true); render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={apply} />); fireEvent.click(screen.getByText(/SOURCE OVERRIDES/)); fireEvent.change(screen.getByLabelText('Width'), { target: { value: '80' } }); expect(apply).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Apply')); await waitFor(() => expect(apply).toHaveBeenCalledWith(width, { value: 80, unit: 'mm' })); });
  it('keeps invalid draft visibly correctable', async () => { render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={async () => false} />); fireEvent.click(screen.getByText(/SOURCE OVERRIDES/)); fireEvent.change(screen.getByLabelText('Width'), { target: { value: '-8' } }); fireEvent.click(screen.getByText('Apply')); expect(await screen.findByText(/last valid geometry remains/i)).toBeVisible(); expect(screen.getByLabelText('Width')).toHaveValue('-8'); });
  it('offers qualified Hole selector copy without a planar Datum action', () => {
    const selection: SelectionDescription = { semanticEntityId: 'hole:center', faceId: 'face:7', occurrenceId: 'occ:plate', definitionId: 'def:plate',
      semanticTopologyId: 'material:hole:Body.H:wall', topologyKind: 'Face', outputRole: 'HoleWallFace', originFeature: 'hole:Body.H',
      selector: 'face(H.Wall)', sourceAddressability: 'DerivedStable', selectorReason: null, source: null, buildRevision: 1, sourceAddressable: true };
    const reference = vi.fn();
    render(<Inspector model={fakeModel({ entity: id => id === hole.id ? { ...hole, holeDiameterMm: 6 } : undefined })}
      entityId="hole:center" selection={selection} diagnostics={[]} onApply={async () => true} onReferenceHoleWall={reference} />);
    expect(screen.getByRole('button', { name: 'Copy Selector' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reference Face in Source' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reference Hole Wall in Source' }));
    expect(reference).toHaveBeenCalledOnce();
  });
});

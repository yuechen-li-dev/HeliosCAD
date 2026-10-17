import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => localStorage.clear());
  it('renders generated schema fields without construct-specific field branches', () => {
    const { rerender } = render(<Inspector model={fakeModel()} schema={schema} entityId={plate.id} diagnostics={[]} onApply={async () => true} />);
    // A field with no value and no default waits in the closed Not set group.
    fireEvent.click(screen.getByText('Not set'));
    expect(screen.getByText('Size')).toBeVisible();
    rerender(<Inspector model={fakeModel()} schema={schema} entityId={hole.id} diagnostics={[]} onApply={async () => true} />);
    // The same Not set group stays open across selections.
    expect(screen.getByText('Diameter')).toBeVisible();
    // Outputs start collapsed; opening the section shows them.
    fireEvent.click(screen.getByText(/Semantic outputs/i));
    expect(screen.getByText('Wall')).toBeVisible();
  });
  it('shows identity and introspected property', () => { render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={async () => true} />); expect(screen.getByText(plate.id)).toBeVisible(); fireEvent.click(screen.getByText(/Source overrides/i)); expect(screen.getByLabelText('Width')).toHaveValue('50'); });
  it('commits a unit-aware value only on Apply', async () => { const apply = vi.fn(async () => true); render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={apply} />); fireEvent.click(screen.getByText(/Source overrides/i)); fireEvent.change(screen.getByLabelText('Width'), { target: { value: '80' } }); expect(apply).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Apply')); await waitFor(() => expect(apply).toHaveBeenCalledWith(width, { value: 80, unit: 'mm' })); });
  it('keeps invalid draft visibly correctable', async () => { render(<Inspector model={fakeModel()} entityId={plate.id} diagnostics={[]} onApply={async () => false} />); fireEvent.click(screen.getByText(/Source overrides/i)); fireEvent.change(screen.getByLabelText('Width'), { target: { value: '-8' } }); fireEvent.click(screen.getByText('Apply')); expect(await screen.findByText(/last valid geometry remains/i)).toBeVisible(); expect(screen.getByLabelText('Width')).toHaveValue('-8'); });
  it('offers qualified Hole selector copy without a planar Datum action', () => {
    const selection: SelectionDescription = { semanticEntityId: 'hole:center', faceId: 'face:7', occurrenceId: 'occ:plate', definitionId: 'def:plate',
      semanticTopologyId: 'material:hole:Body.H:wall', topologyKind: 'Face', outputRole: 'HoleWallFace', originFeature: 'hole:Body.H',
      selector: 'face(H.Wall)', sourceAddressability: 'DerivedStable', selectorReason: null, source: null, buildRevision: 1, sourceAddressable: true };
    const reference = vi.fn();
    render(<Inspector model={fakeModel({ entity: id => id === hole.id ? { ...hole, holeDiameterMm: 6 } : undefined })}
      entityId="hole:center" selection={selection} diagnostics={[]} onApply={async () => true} onReferenceHoleWall={reference} />);
    expect(screen.getByRole('button', { name: 'Copy selector' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reference face in source' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reference hole wall in source' }));
    expect(reference).toHaveBeenCalledOnce();
  });
  it('lays out projected fields as rows with value, origin and the read-only reason, and remembers collapsed sections', async () => {
    const projection = { version: 'firmament-field-projection/1' as const, constructId: 'Hole', semanticId: hole.id, sourceRevision: 'r', buildRevision: 1, source: null, outputs: [],
      fields: [{ fieldId: 'Hole.Diameter', name: 'Diameter', kind: 'Length', unit: 'Length', effectiveValue: { valueKind: 'Length', text: '8 mm', number: 8, unit: 'mm' },
        authoredValue: '8mm', origin: 'Authored' as const, declaration: null, source: null, editable: false, readOnlyReason: 'Authored expression is not a direct matching literal.' }] };
    const { unmount } = render(<Inspector model={fakeModel()} schema={schema} projection={projection} entityId={hole.id} diagnostics={[]} onApply={async () => true} />);
    const row = screen.getByText('Diameter').closest('li')!;
    expect(row).toHaveTextContent('8 mm');
    expect(row).toHaveTextContent('Authored');
    expect(row).toHaveTextContent('Length · required');
    expect(row).not.toHaveTextContent('Written as');
    expect(row).toHaveTextContent('Read-only · Authored expression is not a direct matching literal.');
    expect(screen.queryByText('Not set')).toBeNull();
    fireEvent.click(screen.getByText(/Semantic fields/i));
    expect(screen.getByText('Diameter')).not.toBeVisible();
    await waitFor(() => expect(localStorage.getItem('helios-inspector-section:fields')).toBe('closed'));
    unmount();
    render(<Inspector model={fakeModel()} schema={schema} projection={projection} entityId={hole.id} diagnostics={[]} onApply={async () => true} />);
    expect(screen.getByText('Diameter')).not.toBeVisible();
  });
});

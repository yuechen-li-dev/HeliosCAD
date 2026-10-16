import { describe, expect, it } from 'vitest';
import type { LanguageOutline, PaletteItem } from '@aetheris/cad';
import chimera from './fixtures/chimera.outline.json';
import { buildPartGraph } from './outlineGraph';
import { bodyParent, featureTarget, paletteOperation, reorderOperation, uniqueName, wireChoices, wireOperation } from './graphAuthoring';

const outline = chimera as unknown as LanguageOutline;
const node = (id: string) => outline.nodes.find(n => n.id === id)!;
const hole: PaletteItem = { id: 'hole', label: 'Hole', category: 'Holes', description: '', placement: 'feature', nameStem: 'Pilot', source: 'Hole<Shaft> Pilot { Diameter: 6mm }' };
const box: PaletteItem = { id: 'box', label: 'Box', category: 'Bodies', description: '', placement: 'model', nameStem: 'Block', source: 'Box Block { Size: [1mm, 1mm, 1mm] }' };

describe('graph authoring', () => {
  it('numbers a stem past every name in the document', () => {
    expect(uniqueName('Pilot', outline)).toBe('Pilot2');
    expect(uniqueName('Rib', outline)).toBe('Rib');
  });

  it('puts features on the body a selection belongs to', () => {
    const bodyOf = (id: string | null) => { const t = featureTarget(outline, id); return 'body' in t ? t.body.id : t.reason; };
    expect(bodyOf('MotorMount/Compose:Body')).toBe('MotorMount/Compose:Body');
    // A step inside the Compose, the Modify and a feature inside it all mean the composed body.
    expect(bodyOf('MotorMount/Compose:Body/Plate')).toBe('MotorMount/Compose:Body');
    expect(bodyOf('MotorMount/Modify:Body')).toBe('MotorMount/Compose:Body');
    expect(bodyOf('MotorMount/Modify:Body/Pilot')).toBe('MotorMount/Compose:Body');
    // Sketches are not bodies; with nothing selected the only body is used.
    expect(bodyOf('MotorMount/Layout/CableSlot')).toBe('MotorMount/Compose:Body');
    expect(bodyOf(null)).toBe('MotorMount/Compose:Body');
  });

  it('turns palette items into inserts with unique names', () => {
    expect(paletteOperation(hole, outline, 'MotorMount/Modify:Body/Pilot'))
      .toEqual({ kind: 'insertFeature', node: 'MotorMount/Compose:Body', source: hole.source, name: 'Pilot2' });
    expect(paletteOperation(box, outline, 'MotorMount/Layout/CableSlot'))
      .toEqual({ kind: 'insertDeclaration', parent: 'MotorMount', source: box.source, name: 'Block' });
    expect(bodyParent(outline, null)).toBe('MotorMount');
  });

  it('offers reference fields, and retargeting for a Modify, as wire endings', () => {
    const plate = node('MotorMount/Compose:Body/Plate');
    expect(wireChoices(plate, outline).map(c => c.kind === 'field' ? c.field.name : c.kind)).toEqual(['Profile']);
    expect(wireChoices(node('MotorMount/Modify:Body'), outline)[0]).toEqual({ kind: 'retarget' });
    expect(wireOperation('SlotProfile', plate, wireChoices(plate, outline)[0]))
      .toEqual({ kind: 'setField', node: plate.id, field: 'Profile', value: 'SlotProfile' });
  });

  it('reorders among siblings and ignores drops that change nothing', () => {
    const graph = buildPartGraph(outline);
    const ids = graph.units.find(u => u.id === 'MotorMount/Modify:Body')!.rows.map(r => r.id);
    expect(ids).toEqual(['MotorMount/Modify:Body/Pilot', 'MotorMount/Modify:Body/Motor', 'MotorMount/Modify:Body/Frame', 'MotorMount/Modify:Body/TopBreak']);
    expect(reorderOperation(graph, ids[3], ids[0], 'before')).toEqual({ kind: 'moveDeclaration', node: ids[3], first: true });
    expect(reorderOperation(graph, ids[0], ids[2], 'after')).toEqual({ kind: 'moveDeclaration', node: ids[0], after: ids[2] });
    expect(reorderOperation(graph, ids[1], ids[2], 'before')).toBeNull();
    expect(reorderOperation(graph, ids[1], 'MotorMount/Stock', 'after')).toBeNull();
  });
});

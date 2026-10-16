import { describe, expect, it } from 'vitest';
import type { LanguageOutline } from '@aetheris/cad';
import chimera from './fixtures/chimera.outline.json';
import atlas from './fixtures/atlas.outline.json';
import spacer from './fixtures/spacer.outline.json';
import { buildPartGraph, layoutPartGraph, unitAtSpan, UNIT_WIDTH } from './outlineGraph';

const links = (outline: unknown) => buildPartGraph(outline as LanguageOutline).links.map(l => `${l.from} -> ${l.to} [${l.label}]`).sort();

describe('part graph from the compiler outline', () => {
  it('opens the Model and shows bodies with their feature stacks', () => {
    const graph = buildPartGraph(chimera as LanguageOutline);
    expect(graph.units.map(u => u.id)).toEqual(['OutlineVertices', 'MotorBolts', 'FrameHoles', 'M3Clearance', 'M5Clearance',
      'MotorMount/Layout', 'MotorMount/Stock', 'MotorMount/SlotProfile', 'MotorMount/Compose:Body', 'MotorMount/Modify:Body']);
    const modify = graph.units.find(u => u.id === 'MotorMount/Modify:Body')!;
    expect(modify.container).toBe('MotorMount');
    expect(modify.category).toBe('modify');
    expect(modify.rows.map(r => r.label)).toEqual(['Hole<Shaft> Pilot', 'Pattern Motor', 'Pattern Frame', 'EdgeFinish TopBreak']);
    expect(modify.rows[0].detail).toBe('Diameter 22mm · On +Z');
    expect(graph.units.find(u => u.id === 'MotorMount/Layout')!.kind).toBe('Concept Struct');
  });

  it('draws data wires from provider to consumer and folds uses inside one unit', () => {
    expect(links(chimera)).toEqual([
      'FrameHoles -> MotorMount/Modify:Body [Over]',
      'M3Clearance -> MotorMount/Modify:Body [applies]',
      'M5Clearance -> MotorMount/Modify:Body [applies]',
      'MotorBolts -> MotorMount/Modify:Body [Over]',
      'MotorMount/Compose:Body -> MotorMount/Modify:Body [modifies]',
      'MotorMount/Layout -> MotorMount/SlotProfile [Using]',
      'MotorMount/Layout -> MotorMount/Stock [Using]',
      'MotorMount/SlotProfile -> MotorMount/Compose:Body [Profile]',
      'MotorMount/Stock -> MotorMount/Compose:Body [Profile]',
      'MotorMount/Stock -> MotorMount/Modify:Body [Target]',
      'OutlineVertices -> MotorMount/Layout [Vertices]',
    ]);
  });

  it('keeps a template closed and links its specialization and record', () => {
    const graph = buildPartGraph(spacer as LanguageOutline);
    expect(graph.units.find(u => u.id === 'Spacer')!.category).toBe('feature');
    expect(links(spacer)).toEqual(expect.arrayContaining(['Short -> ShortSpacer/Part [initializer]', 'Spacer -> ShortSpacer/Part [initializer]', 'SpacerSpec -> Spacer [Spec]']));
  });

  it('shows included definitions as external units and interfaces between occurrences', () => {
    const graph = buildPartGraph(atlas as LanguageOutline);
    const external = graph.units.filter(u => u.category === 'external').map(u => `${u.document}:${u.title}`).sort();
    expect(external).toEqual(['base.firmament:AtlasBase', 'fore-arm.firmament:AtlasForeArm', 'gripper.firmament:AtlasLeftJaw',
      'gripper.firmament:AtlasRightJaw', 'gripper.firmament:GripperBody', 'materials.firmament:BlackPaint', 'materials.firmament:Steel',
      'upper-arm.firmament:AtlasUpperArm']);
    expect(links(atlas)).toEqual(expect.arrayContaining([
      'AtlasIndustrial/AtlasIndustrial/Base -> AtlasIndustrial/Shoulder [A]',
      'AtlasIndustrial/AtlasIndustrial/UpperArm -> AtlasIndustrial/Shoulder [B]',
      'external:base.firmament::AtlasBase -> AtlasIndustrial/AtlasIndustrial/Base [initializer]',
    ]));
    expect(graph.units.find(u => u.id === 'AtlasIndustrial/AtlasIndustrial/Gripper')!.category).toBe('assembly');
  });

  it('lays out left to right without overlaps', () => {
    const laid = layoutPartGraph(buildPartGraph(chimera as LanguageOutline));
    const at = (id: string) => laid.units.find(u => u.id === id)!;
    expect(at('OutlineVertices').x).toBeLessThan(at('MotorMount/Layout').x);
    expect(at('MotorMount/Compose:Body').x).toBeLessThan(at('MotorMount/Modify:Body').x);
    for (const a of laid.units) for (const b of laid.units) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
    expect(laid.units.every(u => u.width === UNIT_WIDTH)).toBe(true);
  });

  it('maps a source span to the unit that shows it', () => {
    const outline = chimera as LanguageOutline;
    const graph = buildPartGraph(outline);
    const pilot = outline.nodes.find(n => n.id === 'MotorMount/Modify:Body/Pilot')!;
    expect(unitAtSpan(graph, pilot.span.start + 3)).toBe('MotorMount/Modify:Body');
    const model = outline.nodes.find(n => n.id === 'MotorMount')!;
    expect(unitAtSpan(graph, model.span.start)).toBeNull();
  });
});

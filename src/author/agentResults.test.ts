import { describe, expect, it } from 'vitest';
import type { LanguageOutline, ModelSession, SemanticSchema } from '@aetheris/cad';
import { buildSummary, describeConstruct, modelBounds, outlineSummary, schemaIndex } from './agentResults';

const cube = (offset: number) => ({ id: 'def', ranges: [
  { startTriangle: 0, triangleCount: 2, faceId: 'face:1', semanticEntityId: 'Plate', surfaceKind: 'Plane', selector: 'face(+Z)' },
  { startTriangle: 2, triangleCount: 8, faceId: 'face:2', semanticEntityId: 'Plate', surfaceKind: 'Cylinder', diameterMm: 5.5, originFeature: 'CornerA' },
  { startTriangle: 10, triangleCount: 8, faceId: 'face:3', semanticEntityId: 'Plate', surfaceKind: 'Cylinder', diameterMm: 6, originFeature: 'profile:__Boundary2Value_Outline__Boundary.Outer.TopLeftCorner' },
], positions: new Float64Array([-25, -20, -4, 25, 20, 4].map((v, i) => v + (i % 3 === 0 ? offset : 0))) });
const model = (minimumMm?: number[]) => ({
  tree: { rootId: 'm', nodes: [
    { id: 'm', kind: 'Model', name: 'Bracket', children: ['Plate'], visible: true },
    { id: 'Plate', kind: 'Compose', name: 'Plate', children: ['Plate.CornerA'], visible: true, source: { source: 'p', line: 3, column: 1, start: 0, length: 1 } },
    { id: 'Plate.CornerA', kind: 'Hole', semanticConstruct: 'Hole<Shaft>', name: 'CornerA', children: [], visible: true, holeDiameterMm: 5.5 },
  ] },
  properties: [{ id: 'x', ownerEntityId: 'm', name: 'Thickness', type: 'Length', unit: 'mm', value: 8, writable: true, source: { source: 'p', line: 4, column: 1, start: 0, length: 1 } }],
  mesh: { definitions: [cube(0)], occurrences: [{ id: 'Plate:occurrence', definitionId: 'def', semanticEntityId: 'Plate', path: 'p', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1] }], ...(minimumMm ? { minimumMm, maximumMm: [1, 1, 1] } : {}) },
  measurementAvailable: true,
}) as unknown as ModelSession;

describe('agent tool results', () => {
  it('summarizes a build as bodies, features, faces and bounds', () => {
    const summary = buildSummary({ model: model(), diagnostics: [{ severity: 'info', code: 'parsed', message: 'ok' }, { severity: 'warning', code: 'w', message: 'Check', source: { source: 'p', line: 2, column: 5, start: 0, length: 1 } }] });
    expect(summary).toMatchObject({
      accepted: true, diagnostics: [{ code: 'w', line: 2, column: 5 }],
      bounds: { minimumMm: [-15, -20, -4], maximumMm: [35, 20, 4], sizeMm: [50, 40, 8] },
      bodies: [{ name: 'Plate', line: 3, features: [{ name: 'CornerA', kind: 'Hole<Shaft>', diameterMm: 5.5 }] }],
      occurrences: [{ id: 'Plate:occurrence', body: 'Plate' }],
      parameters: [{ name: 'Thickness', value: 8, unit: 'mm', line: 4 }],
    });
    expect(summary.faces).toEqual({ count: 3, bySurface: { Plane: 1, Cylinder: 2 }, listed: [
      { occurrenceId: 'Plate:occurrence', faceId: 1, surface: 'Plane', selector: 'face(+Z)' },
      { occurrenceId: 'Plate:occurrence', faceId: 2, surface: 'Cylinder', diameterMm: 5.5, feature: 'CornerA' },
      { occurrenceId: 'Plate:occurrence', faceId: 3, surface: 'Cylinder', diameterMm: 6, feature: 'Outline.Outer.TopLeftCorner' },
    ] });
    expect(JSON.stringify(summary)).not.toContain('startTriangle');
  });
  it('prefers reported bounds and reports a rejected build with its diagnostics only', () => {
    expect(modelBounds(model([0, 0, 0]).mesh)).toEqual({ minimumMm: [0, 0, 0], maximumMm: [1, 1, 1], sizeMm: [1, 1, 1] });
    expect(buildSummary({ model: null, diagnostics: [{ severity: 'error', code: 'e', message: 'Bad' }] })).toEqual({ accepted: false, status: 'candidate-rejected', diagnostics: [{ severity: 'error', code: 'e', message: 'Bad' }] });
  });
  it('lists outline declarations with lines and field text', () => {
    const source = 'Model M {\n  Box Plate { Size: [1mm, 2mm, 3mm] }\n}';
    const outline = { document: 'p', nodes: [{ id: 'M/Plate', kind: 'Box', variant: null, name: 'Plate', span: { start: 12, length: 30 }, fields: [{ name: 'Size', text: '[1mm, 2mm, 3mm]' }] }],
      diagnostics: [{ severity: 'error', code: 'x', message: 'Broken', span: { start: 12, length: 1 } }] } as unknown as LanguageOutline;
    expect(outlineSummary(outline, source)).toEqual({ document: 'p', declarations: [{ id: 'M/Plate', kind: 'Box', name: 'Plate', line: 2, fields: { Size: '[1mm, 2mm, 3mm]' } }],
      diagnostics: [{ severity: 'error', code: 'x', message: 'Broken', line: 2 }] });
  });
  it('indexes the schema and describes one construct by name', () => {
    const schema = { constructs: [{ id: 'RoundedRect2', name: 'RoundedRect2', context: 'Model', entry: 'RoundedRect2 O { }', description: 'Rounded', compatibilityAlias: null, outputs: [],
      fields: [{ id: 'r', name: 'Radius', kind: 'Length', unit: 'Length', required: true, default: null, choices: [], description: 'Corner radius', sourceEditable: false }] }] } as unknown as SemanticSchema;
    expect(schemaIndex(schema).constructs).toEqual([{ name: 'RoundedRect2', context: 'Model', entry: 'RoundedRect2 O { }', description: 'Rounded' }]);
    expect(describeConstruct(schema, 'roundedrect2').fields).toEqual([{ name: 'Radius', kind: 'Length', unit: 'Length', required: true, description: 'Corner radius' }]);
    expect(() => describeConstruct(schema, 'Fillet3')).toThrow('schema lists');
  });
});

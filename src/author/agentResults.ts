import type { Diagnostic, LanguageOutline, ModelSession, SemanticSchema } from '@aetheris/cad';

export type CompileResult = { model: ModelSession | null; diagnostics: readonly Diagnostic[] };

/**
 * What an agent reads back from the compiler. The raw results are made for the viewport (triangle
 * ranges, every edge polyline); an agent needs the facts it can check a request against: did it build,
 * how big is it, which features exist, which faces it can measure. Every value here is copied or counted
 * from the compiler result; nothing is inferred.
 */

type Model = ModelSession;
const round = (value: number) => Math.round(value * 1000) / 1000;
const lineOf = (source: string, offset: number) => { let line = 1; for (let i = 0; i < Math.min(offset, source.length); i++) if (source[i] === '\n') line++; return line; };

/** Bounds as reported, or from the display mesh when the compiler left them out. */
export function modelBounds(mesh: Model['mesh']): { minimumMm: number[]; maximumMm: number[]; sizeMm: number[] } | null {
  let min = mesh.minimumMm ? [...mesh.minimumMm] : null, max = mesh.maximumMm ? [...mesh.maximumMm] : null;
  if (!min || !max) {
    const definitions = new Map(mesh.definitions.map(d => [d.id, d]));
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const occurrence of mesh.occurrences) {
      const definition = occurrence.definitionId ? definitions.get(occurrence.definitionId) : undefined;
      if (!definition) continue;
      const m = occurrence.transform.length === 16 ? occurrence.transform : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const p = definition.positions;
      for (let i = 0; i + 2 < p.length; i += 3) {
        // Column-major, as the viewport applies it.
        const x = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12];
        const y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13];
        const z = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
        lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); lo[2] = Math.min(lo[2], z);
        hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); hi[2] = Math.max(hi[2], z);
      }
    }
    if (!Number.isFinite(lo[0])) return null;
    min = lo; max = hi;
  }
  return { minimumMm: min.map(round), maximumMm: max.map(round), sizeMm: max.map((v, i) => round(v - min![i])) };
}

/** Compiler-internal boundary ids (`profile:__Boundary2Value_Outline__Boundary.Outer.Top`) as the names the source uses. */
const featureName = (id: string) => id.replace(/^profile:/, '').replace(/__Boundary2Value_/g, '').replace(/__Boundary(?=\.)/g, '');

export function buildSummary(result: CompileResult) {
  const diagnostics = result.diagnostics.filter(d => d.severity !== 'info').map(d => ({
    severity: d.severity, code: d.code, message: d.message, ...(d.source ? { file: d.source.source, line: d.source.line, column: d.source.column } : {}),
  }));
  const model = result.model;
  if (!model) return { accepted: false, status: 'candidate-rejected', diagnostics };
  const nodes = new Map(model.tree.nodes.map(n => [n.id, n]));
  const featureOf = (id: string) => {
    const n = nodes.get(id)!;
    const at = n.holePlacement;
    return { name: n.name, kind: n.semanticConstruct ?? n.kind, ...(n.holeDiameterMm ? { diameterMm: n.holeDiameterMm } : {}),
      ...(at ? { on: at.face, centerMm: [round(at.u), round(at.v)], ...(at.pointMm ? { pointMm: at.pointMm.map(round) } : {}) } : {}),
      ...(n.source ? { line: n.source.line } : {}) };
  };
  const root = nodes.get(model.tree.rootId);
  const bodies = (root?.children ?? []).map(id => nodes.get(id)).filter(n => !!n).map(n => ({
    id: n.id, name: n.name, kind: n.semanticConstruct ?? n.kind, ...(n.source ? { line: n.source.line } : {}),
    features: n.children.filter(c => nodes.has(c)).map(featureOf),
  }));
  const occurrenceOf = new Map(model.mesh.occurrences.map(o => [o.definitionId, o.id]));
  const faces = model.mesh.definitions.flatMap(definition => definition.ranges.map(range => ({
    occurrenceId: occurrenceOf.get(definition.id) ?? null,
    faceId: Number(/(\d+)$/.exec(range.faceId)?.[1] ?? NaN),
    surface: range.surfaceKind ?? null,
    ...(range.diameterMm ? { diameterMm: round(range.diameterMm) } : {}),
    ...(range.selector ? { selector: range.selector } : {}),
    ...(range.originFeature && range.originFeature !== range.semanticEntityId ? { feature: featureName(range.originFeature) } : {}),
  })));
  const surfaces: Record<string, number> = {};
  for (const face of faces) surfaces[face.surface ?? 'Unknown'] = (surfaces[face.surface ?? 'Unknown'] ?? 0) + 1;
  // Non-planar faces carry the evidence (holes, rounds); planar ones are listed only when the part is small.
  const listed = faces.length <= 40 ? faces : faces.filter(f => f.surface !== 'Plane').slice(0, 60);
  const parameters = model.properties.filter(p => p.writable).map(p => ({ name: p.name, value: round(p.value), unit: p.unit, line: p.source.line }));
  return {
    accepted: true, status: 'candidate-built-not-applied', diagnostics,
    bounds: modelBounds(model.mesh),
    occurrences: model.mesh.occurrences.map(o => ({ id: o.id, body: o.semanticEntityId })),
    bodies,
    faces: { count: faces.length, bySurface: surfaces, listed, ...(listed.length < faces.length ? { omitted: 'Planar faces omitted; measure by ray to reach them.' } : {}) },
    parameters,
    measurementAvailable: model.measurementAvailable,
  };
}

/** Declarations as one row each, with field text as written. Spans become line numbers. */
export function outlineSummary(outline: LanguageOutline, source: string) {
  return {
    document: outline.document,
    declarations: outline.nodes.map(node => ({
      id: node.id, kind: node.variant ? `${node.kind}<${node.variant}>` : node.kind, ...(node.name ? { name: node.name } : {}),
      line: lineOf(source, node.span.start),
      ...(node.fields.length ? { fields: Object.fromEntries(node.fields.map(f => [f.name, f.text.length > 160 ? f.text.slice(0, 160) + '…' : f.text])) } : {}),
    })),
    diagnostics: outline.diagnostics.map(d => ({ severity: d.severity, code: d.code, message: d.message, ...(d.span ? { line: lineOf(source, d.span.start) } : {}) })),
  };
}

export function schemaIndex(schema: SemanticSchema) {
  return {
    constructs: schema.constructs.map(c => ({ name: c.name, context: c.context, entry: c.entry, description: c.description })),
    note: 'describe_construct gives the fields of one construct. Field names are case-insensitive; entries are written in a buildable form.',
  };
}

export function describeConstruct(schema: SemanticSchema, name: string) {
  const wanted = name.trim().toLowerCase();
  const construct = schema.constructs.find(c => c.name.toLowerCase() === wanted || c.id.toLowerCase() === wanted);
  if (!construct) throw new Error(`No construct named '${name}'. schema lists the available names.`);
  return {
    name: construct.name, context: construct.context, entry: construct.entry, description: construct.description,
    fields: construct.fields.map(f => ({ name: f.name, kind: f.kind, ...(f.unit !== 'None' ? { unit: f.unit } : {}), required: f.required,
      ...(f.default ? { default: f.default } : {}), ...(f.choices.length ? { choices: f.choices } : {}), ...(f.variants?.length ? { variants: f.variants } : {}),
      ...(f.description ? { description: f.description } : {}) })),
    ...(construct.outputs.length ? { outputs: construct.outputs.map(o => o.name) } : {}),
  };
}

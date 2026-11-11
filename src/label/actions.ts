import type { LanguageEditOperation, LanguageOutline, OutlineNode, SelectionDescription } from '@aetheris/cad';
import { bodyParent } from '../graph/graphAuthoring';
import { acuteAngle, type LabelFace } from './geometry';

/** The records Label writes. Each maps to one `Pmi` declaration. */
export type LabelRecord = 'Datum' | 'Flatness' | 'Parallelism' | 'Perpendicularity' | 'HoleDiameter' | 'Position' | 'Cylindricity' | 'Note';

/** Two directions within this many degrees count as parallel (or perpendicular). Imported planes that are meant to be
 * parallel agree to far better than this; planes that are not are far outside it. */
export const RELATION_DEGREES = 0.5;

export interface LabelDatum { readonly name: string; readonly selector: string; readonly face: LabelFace | null; readonly nodeId: string }
export interface LabelRecordEntry { readonly nodeId: string; readonly kind: string; readonly name: string; readonly target: string | null; readonly fields: Readonly<Record<string, string>> }

export interface LabelAction {
  readonly id: string;
  readonly record: LabelRecord;
  readonly title: string;
  /** Why it cannot be applied to this selection; null when it can. */
  readonly disabled: string | null;
  readonly target: string | null;
  /** A measured size (diameter) the nominal starts from. */
  readonly measured: number | null;
  /** `band`: a size with +/− allowances; `zone`: a geometric tolerance value; `none`. */
  readonly tolerance: 'band' | 'zone' | 'none';
  readonly zone: 'Cylindrical' | null;
  readonly datums: 'none' | 'required';
  /** Datum references preselected, in precedence order. */
  readonly defaultDatums: readonly string[];
  /** Datums the record may reference: only these are offered by the picker. */
  readonly allowedDatums: readonly string[];
  readonly modifiers: boolean;
  readonly nameStem: string;
  /** A face that must become a datum for this record (the second of two picked faces), with its proposed letter. */
  readonly newDatum: { readonly selector: string; readonly letter: string } | null;
  readonly fits: boolean;
}

export interface LabelValues {
  readonly name: string;
  readonly nominal?: number;
  readonly plus?: number;
  readonly minus?: number;
  readonly tolerance?: number;
  readonly datumRefs?: readonly string[];
  readonly maximumMaterial?: boolean;
  readonly text?: string;
  readonly newDatumName?: string;
}

const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('');
/** The next datum letter not used by any declaration (I, O and Q are never datum letters). */
export function nextDatumLetter(outline: LanguageOutline | null, also: readonly string[] = []) {
  const taken = new Set([...(outline?.nodes ?? []).map(n => n.name), ...also]);
  return LETTERS.find(l => !taken.has(l)) ?? null;
}

function field(node: OutlineNode, name: string) {
  return node.fields.find(f => f.name.toLowerCase() === name.toLowerCase())?.text ?? null;
}
/** Every record in the model's `Pmi` blocks. */
export function pmiRecords(outline: LanguageOutline | null): LabelRecordEntry[] {
  const nodes = outline?.nodes ?? [];
  const blocks = new Set(nodes.filter(n => n.kind === 'Pmi').map(n => n.id));
  return nodes.filter(n => n.parentId && blocks.has(n.parentId)).map(n => ({
    nodeId: n.id, kind: n.kind, name: n.name ?? '', target: field(n, 'target'),
    fields: Object.fromEntries(n.fields.map(f => [f.name, f.text])),
  }));
}

const usable = (pick: SelectionDescription) => pick.topologyKind !== 'Edge' && pick.sourceAddressability === 'ImportedStable' && !!pick.selector;

/** What a selection offers, ranked: the first enabled action is the one the card preselects. Records the selection
 * cannot express are left out; records it nearly can are present and disabled with the measured reason. */
export function labelActions(picks: readonly SelectionDescription[], faces: readonly (LabelFace | null)[], datums: readonly LabelDatum[],
  outline: LanguageOutline | null): { actions: LabelAction[]; notice: string | null } {
  const result = offeredActions(picks, faces, datums, outline);
  // A face takes each requirement once: a second record of the same kind on the same target is a contradiction or a
  // duplicate, never what was meant. Datums are handled above with their letter.
  const records = pmiRecords(outline);
  const actions = result.actions.map(action => {
    if (action.disabled || action.record === 'Datum' || action.record === 'Note') return action;
    const existing = records.find(r => r.kind === action.record && r.target === action.target && (action.zone === 'Cylindrical') === /\bCylindrical\b/.test(r.fields.zone ?? ''));
    return existing ? { ...action, disabled: `${existing.name} already sets this ${action.record === 'HoleDiameter' ? 'diameter' : action.record.toLowerCase()}; edit it instead.` } : action;
  });
  return { actions, notice: result.notice };
}

function offeredActions(picks: readonly SelectionDescription[], faces: readonly (LabelFace | null)[], datums: readonly LabelDatum[],
  outline: LanguageOutline | null): { actions: LabelAction[]; notice: string | null } {
  const base = { measured: null, tolerance: 'zone', zone: null, datums: 'none', defaultDatums: [], allowedDatums: [], modifiers: false, newDatum: null, fits: false } as const;
  if (picks.length === 0)
    return { actions: [{ ...base, id: 'note', record: 'Note', title: 'Note', disabled: null, target: null, tolerance: 'none', nameStem: 'Note' }], notice: null };
  if (new Set(picks.map(p => p.occurrenceId)).size > 1) return { actions: [], notice: 'The selection spans parts. Labels apply to one part: select faces of one part.' };
  if (picks.some(p => p.topologyKind === 'Edge')) return { actions: [], notice: 'Edges cannot be labeled yet: select the faces the edge separates.' };
  const notImported = picks.find(p => !usable(p));
  if (notImported) return { actions: [], notice: notImported.sourceAddressability === 'ImportedStable'
    ? `This face has no stable selector${notImported.selectorReason ? `: ${notImported.selectorReason}` : ''}.`
    : `Label annotates imported STEP faces. This face comes from ${notImported.originFeature ?? 'a construction feature'}; annotate it in Source.` };
  const kinds = faces.map(f => f?.surfaceKind ?? null);
  const datumOn = (selector: string) => datums.find(d => d.selector === selector);
  const relation = (a: LabelFace | null, b: LabelFace | null) => {
    if (!a?.direction || !b?.direction) return null;
    const angle = acuteAngle(a.direction, b.direction);
    return { angle, parallel: angle < RELATION_DEGREES, perpendicular: 90 - angle < RELATION_DEGREES };
  };
  /** Datum planes whose normal relates to a direction as asked (parallel normals for plane∥plane, or plane⊥axis). */
  const datumsWhere = (face: LabelFace | null, test: (r: NonNullable<ReturnType<typeof relation>>) => boolean) =>
    datums.filter(d => d.face?.surfaceKind === 'Plane' && d.selector !== face?.selector).filter(d => { const r = relation(face, d.face); return !!r && test(r); }).map(d => d.name);
  const all = datums.map(d => d.name);
  const actions: LabelAction[] = [];
  const letter = nextDatumLetter(outline);

  if (picks.length === 1 && kinds[0] === 'Plane') {
    const face = faces[0]!, selector = picks[0]!.selector!;
    const existing = datumOn(selector);
    actions.push({ ...base, id: 'datum', record: 'Datum', title: existing ? `Datum (this face is ${existing.name})` : `Datum ${letter ?? ''}`.trim(), target: selector, tolerance: 'none',
      disabled: existing ? `This face is already datum ${existing.name}.` : letter ? null : 'Every datum letter is in use.', nameStem: letter ?? 'Datum' });
    actions.push({ ...base, id: 'flatness', record: 'Flatness', title: 'Flatness', target: selector, disabled: null, nameStem: 'Flatness' });
    const parallel = datumsWhere(face, r => r.parallel), perpendicular = datumsWhere(face, r => r.perpendicular);
    const none = datums.filter(d => d.selector !== selector).length === 0;
    actions.push({ ...base, id: 'parallelism', record: 'Parallelism', title: parallel.length ? `Parallelism to ${parallel[0]}` : 'Parallelism to a datum', target: selector,
      datums: 'required', defaultDatums: parallel.slice(0, 1), allowedDatums: all.filter(n => n !== existing?.name),
      disabled: none ? 'Declare a datum first: select its face and choose Datum.' : parallel.length ? null : 'No datum plane is parallel to this face.', nameStem: 'Parallelism' });
    actions.push({ ...base, id: 'perpendicularity', record: 'Perpendicularity', title: perpendicular.length ? `Perpendicularity to ${perpendicular[0]}` : 'Perpendicularity to a datum', target: selector,
      datums: 'required', defaultDatums: perpendicular.slice(0, 1), allowedDatums: all.filter(n => n !== existing?.name),
      disabled: none ? 'Declare a datum first: select its face and choose Datum.' : perpendicular.length ? null : 'No datum plane is perpendicular to this face.', nameStem: 'Perpendicularity' });
    // The relation that holds goes first.
    if (perpendicular.length && !parallel.length) actions.splice(2, 2, actions[3]!, actions[2]!);
  } else if (picks.length === 1 && kinds[0] === 'Cylinder') {
    const face = faces[0]!, selector = picks[0]!.selector!;
    const measured = picks[0]!.diameterMm ?? face?.diameterMm ?? null;
    actions.push({ ...base, id: 'diameter', record: 'HoleDiameter', title: measured ? `Diameter Ø${measured.toFixed(3)}` : 'Diameter', target: selector, measured,
      tolerance: 'band', fits: true, disabled: measured ? null : 'The cylinder diameter is not available from the build.', nameStem: 'Diameter' });
    const square = datumsWhere(face, r => r.parallel);
    actions.push({ ...base, id: 'position', record: 'Position', title: 'Position', target: selector, zone: 'Cylindrical', datums: 'required', modifiers: true,
      defaultDatums: [...square.slice(0, 1), ...all.filter(n => !square.includes(n))].slice(0, 3), allowedDatums: all,
      disabled: all.length ? null : 'Position needs datums: select the faces that locate this hole and make them datums.', nameStem: 'Position' });
    actions.push({ ...base, id: 'axis-perpendicularity', record: 'Perpendicularity', title: square.length ? `Axis perpendicularity to ${square[0]}` : 'Axis perpendicularity', target: selector,
      zone: 'Cylindrical', datums: 'required', defaultDatums: square.slice(0, 1), allowedDatums: all,
      disabled: square.length ? null : all.length ? 'No datum plane is perpendicular to this axis.' : 'Declare a datum plane perpendicular to this axis first.', nameStem: 'AxisPerpendicularity' });
    actions.push({ ...base, id: 'cylindricity', record: 'Cylindricity', title: 'Cylindricity', target: selector, disabled: null, nameStem: 'Cylindricity' });
  } else if (picks.length === 2 && kinds.every(k => k === 'Plane')) {
    const [a, b] = faces, r = relation(a!, b!);
    const [sa, sb] = [picks[0]!.selector!, picks[1]!.selector!];
    const datumB = datumOn(sb);
    const newDatum = datumB ? null : letter ? { selector: sb, letter } : null;
    const refs = datumB ? [datumB.name] : newDatum ? [newDatum.letter] : [];
    const noLetter = !datumB && !letter ? 'Every datum letter is in use.' : null;
    const angle = r ? `${r.angle.toFixed(3)}°` : 'unknown';
    actions.push({ ...base, id: 'parallelism', record: 'Parallelism', title: `Parallelism to ${refs[0] ?? 'the second face'}`, target: sa, datums: 'required',
      defaultDatums: refs, allowedDatums: [...new Set([...refs, ...all])], newDatum, nameStem: 'Parallelism',
      disabled: noLetter ?? (r?.parallel ? null : `The faces are ${angle} apart, not parallel.`) });
    actions.push({ ...base, id: 'perpendicularity', record: 'Perpendicularity', title: `Perpendicularity to ${refs[0] ?? 'the second face'}`, target: sa, datums: 'required',
      defaultDatums: refs, allowedDatums: [...new Set([...refs, ...all])], newDatum, nameStem: 'Perpendicularity',
      disabled: noLetter ?? (r?.perpendicular ? null : `The faces are ${angle} apart, not perpendicular.`) });
    if (r?.perpendicular) actions.reverse();
  } else if (picks.length === 2 && kinds.includes('Plane') && kinds.includes('Cylinder')) {
    const hole = kinds.indexOf('Cylinder'), plane = 1 - hole;
    const r = relation(faces[hole]!, faces[plane]!);
    const sp = picks[plane]!.selector!, sh = picks[hole]!.selector!;
    const datum = datumOn(sp);
    const newDatum = datum ? null : letter ? { selector: sp, letter } : null;
    const refs = datum ? [datum.name] : newDatum ? [newDatum.letter] : [];
    const square = !!r?.parallel; // the plane's normal runs along the axis
    actions.push({ ...base, id: 'axis-perpendicularity', record: 'Perpendicularity', title: `Axis perpendicularity to ${refs[0] ?? 'the face'}`, target: sh, zone: 'Cylindrical',
      datums: 'required', defaultDatums: refs, allowedDatums: [...new Set([...refs, ...all])], newDatum, nameStem: 'AxisPerpendicularity',
      disabled: !refs.length ? 'Every datum letter is in use.' : square ? null : `The face is not perpendicular to the axis (${r ? (90 - r.angle).toFixed(3) : '?'}° off).` });
    actions.push({ ...base, id: 'position', record: 'Position', title: `Position to ${refs[0] ?? 'the face'}`, target: sh, zone: 'Cylindrical', datums: 'required', modifiers: true,
      defaultDatums: refs, allowedDatums: [...new Set([...refs, ...all])], newDatum, nameStem: 'Position', disabled: refs.length ? null : 'Every datum letter is in use.' });
  } else {
    return { actions: [], notice: picks.length > 2 ? 'Select one or two faces to label.' : 'No label applies to this combination yet.' };
  }
  return { actions, notice: null };
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const mm = (value: number) => `${Number(value.toFixed(6))}mm`;

/** What is wrong with the values (blocks Apply) and what is suspicious (needs confirmation). */
export function checkValues(action: LabelAction, values: LabelValues, outline: LanguageOutline | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const taken = new Set((outline?.nodes ?? []).map(n => n.name).filter(Boolean));
  const names = [values.name, ...(action.newDatum ? [values.newDatumName ?? action.newDatum.letter] : [])];
  for (const name of names) {
    if (!NAME.test(name)) errors.push(`"${name}" is not a name: start with a letter or underscore, then letters, digits or underscores.`);
    else if (taken.has(name)) errors.push(`The name ${name} is already used.`);
  }
  if (names.length === 2 && names[0] === names[1]) errors.push('The record and the new datum need different names.');
  if (action.tolerance === 'band') {
    const { nominal, plus, minus } = values;
    if (!(nominal! > 0)) errors.push('Enter a positive nominal.');
    if (!(plus! >= 0) || !(minus! >= 0)) errors.push('Enter both allowances as nonnegative numbers: tolerances are never inferred.');
    else if (plus === 0 && minus === 0) errors.push('A zero band cannot be made or inspected.');
    if (errors.length === 0 && action.measured != null && (action.measured > nominal! + plus! + 1e-9 || action.measured < nominal! - minus! - 1e-9))
      warnings.push(`The model measures ${action.measured.toFixed(4)} mm, outside ${nominal} +${plus}/−${minus}: the part does not meet its own requirement.`);
  }
  if (action.tolerance === 'zone' && !(values.tolerance! > 0)) errors.push('Enter a positive tolerance zone.');
  if (action.datums === 'required') {
    const refs = values.datumRefs ?? [];
    if (refs.length === 0) errors.push('Choose at least one datum reference.');
    if (new Set(refs).size !== refs.length) errors.push('A datum can be referenced once.');
    if (refs.length > 3) errors.push('At most three datum references.');
    for (const ref of refs) if (!action.allowedDatums.includes(ref) && ref !== (values.newDatumName ?? action.newDatum?.letter)) errors.push(`${ref} is not a declared datum.`);
    if (action.newDatum && !refs.includes(values.newDatumName ?? action.newDatum.letter)) errors.push('The second face becomes a datum only to be referenced: keep it in the datum references.');
  }
  if (action.record === 'Note' && !values.text?.trim()) errors.push('Enter the note text.');
  return { errors, warnings };
}

/** The declarations Apply writes, in order. */
export function emitDeclarations(action: LabelAction, values: LabelValues): string[] {
  const out: string[] = [];
  const newDatum = action.newDatum ? values.newDatumName ?? action.newDatum.letter : null;
  if (action.newDatum) out.push(`Datum ${newDatum} { target: ${action.newDatum.selector} }`);
  const refs = values.datumRefs?.length ? ` datumRefs: [${values.datumRefs.join(', ')}]` : '';
  const zone = action.zone ? ` zone: ${action.zone}` : '';
  const modifiers = action.modifiers && values.maximumMaterial ? ' modifiers: [MaximumMaterial]' : '';
  switch (action.record) {
    case 'Datum': out.push(`Datum ${values.name} { target: ${action.target} }`); break;
    case 'Note': out.push(`Note ${values.name} { text: ${JSON.stringify(values.text!.trim())} }`); break;
    case 'HoleDiameter': out.push(`HoleDiameter ${values.name} { target: ${action.target} value: ${mm(values.nominal!)} tolerance: PlusMinus(${mm(values.plus!)}, ${mm(values.minus!)}) }`); break;
    default: out.push(`${action.record} ${values.name} { target: ${action.target} tolerance: ${mm(values.tolerance!)}${zone}${refs}${modifiers} }`);
  }
  return out;
}

/** The edit that writes the declarations into the model's `Pmi` block, creating the block when there is none. */
export function labelOperations(outline: LanguageOutline | null, declarations: readonly string[]): LanguageEditOperation[] {
  const pmi = outline?.nodes.find(n => n.kind === 'Pmi');
  if (pmi) return declarations.map(source => ({ kind: 'insertDeclaration', parent: pmi.id, source }));
  return [{ kind: 'insertDeclaration', parent: bodyParent(outline, null), source: `Pmi {\n${declarations.map(d => `    ${d}`).join('\n')}\n}` }];
}

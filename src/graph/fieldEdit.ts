import type { LanguageOutline, OutlineField, OutlineNode } from '@aetheris/cad';

// Graph edits change one field's value text and nothing else. The outline gives the
// exact span of every value, so an edit is a splice of that span; the build decides
// whether the result is a model. Anything that would change structure (braces,
// new lines, new fields) is G3's AST writer, not a value edit.

export interface Quantity { readonly number: number; readonly unit: string }

const quantityPattern = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([A-Za-z°]+)?\s*$/;

export function parseQuantity(text: string): Quantity | null {
  const match = quantityPattern.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? { number, unit: match[2] ?? '' } : null;
}

/** Six decimals is finer than any machining tolerance and keeps float noise out of the source. */
export function formatNumber(value: number) {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function formatQuantity(quantity: Quantity) { return formatNumber(quantity.number) + quantity.unit; }

/** The elements of a bracketed list, split at top-level commas; null when the text is not one list. */
export function splitSequence(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '[' || c === '(' || c === '{') depth++;
    else if (c === ']' || c === ')' || c === '}') { if (--depth < 0) return null; }
    else if (c === ',' && depth === 0) { parts.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) return null;
  const last = inner.slice(start).trim();
  if (last || parts.length) parts.push(last);
  return parts;
}

/** One component of a list: a number with a unit, or the name of a parameter that supplies it. */
export type VectorPart = { readonly kind: 'quantity'; readonly value: Quantity } | { readonly kind: 'name'; readonly name: string };

export type FieldEditor =
  | { readonly kind: 'quantity'; readonly value: Quantity; readonly wrapper?: 'Blind' }
  | { readonly kind: 'vector'; readonly parts: readonly VectorPart[]; readonly pointType?: 'Point2' | 'Point3' }
  | { readonly kind: 'text' };

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function editorFor(field: OutlineField): FieldEditor {
  // A blind termination is one source-owned depth, not an unconstrained text box.
  const blind = field.name.toLowerCase() === 'end' ? /^\s*Blind\s*(?:\(([^()]*)\)|\s+(.+))\s*$/.exec(field.text) : null;
  const depth = blind ? parseQuantity(blind[1] ?? blind[2]) : null;
  if (depth) return { kind: 'quantity', value: depth, wrapper: 'Blind' };
  if (field.shape === 'quantity' || field.shape === 'number') {
    const value = parseQuantity(field.text);
    if (value) return { kind: 'quantity', value };
  }
  // Project only simple point constructors already recognized by the compiler's
  // outline. Expressions remain source-owned; this is not an expression evaluator.
  const point = field.shape === 'call' ? /^\s*(Point[23])\s*\(([^()]*)\)\s*$/.exec(field.text) : null;
  if (field.shape === 'sequence' || point) {
    const parts = splitSequence(point ? `[${point[2]}]` : field.text)?.map((text): VectorPart | null => {
      const value = parseQuantity(text);
      return value ? { kind: 'quantity', value } : identifier.test(text) ? { kind: 'name', name: text } : null;
    });
    if (parts && parts.length >= 2 && parts.length <= 4 && (!point || parts.length === Number(point[1].slice(-1)))
      && parts.every((p): p is VectorPart => !!p) && parts.some(p => p.kind === 'quantity'))
      return point ? { kind: 'vector', parts, pointType: point[1] as 'Point2' | 'Point3' } : { kind: 'vector', parts };
  }
  return { kind: 'text' };
}

export function vectorText(parts: readonly VectorPart[], constructor?: 'Point2' | 'Point3') {
  const values = parts.map(p => p.kind === 'quantity' ? formatQuantity(p.value) : p.name).join(', ');
  return constructor ? `${constructor}(${values})` : `[${values}]`;
}

/** A parameter declaration for a value: `Static Thickness: Length = 8mm`; null when its type cannot be told. */
export function parameterSource(name: string, value: string): string | null {
  const quantity = parseQuantity(value);
  if (!quantity) return null;
  const type = /^(mm|cm|m|um|in)$/.test(quantity.unit) ? 'Length' : /^(deg|rad)$/.test(quantity.unit) ? 'Angle'
    : quantity.unit === '' ? (Number.isInteger(quantity.number) && !value.includes('.') ? 'Int' : 'Float') : null;
  return type ? `Static ${name}: ${type} = ${value.trim()}` : null;
}

/** The fields Make reusable can turn into parameters, mirroring the kernel: lengths, angles, numbers, Point2. */
export function parameterizable(field: OutlineField) {
  if (/^Point2\(/.test(field.text.trim())) return true;
  const quantity = parseQuantity(field.text.replace(/^[-+]\s*/, ''));
  return !!quantity && (quantity.unit === '' || /^(mm|cm|m|um|in|deg|rad)$/.test(quantity.unit));
}

/** Arrow keys step a quantity: 1 by default, 10 with Shift, 0.1 with Alt. */
export function nudge(text: string, direction: 1 | -1, modifiers: { shift?: boolean; alt?: boolean } = {}): string | null {
  const value = parseQuantity(text);
  if (!value) return null;
  const step = modifiers.shift ? 10 : modifiers.alt ? 0.1 : 1;
  return formatQuantity({ number: value.number + direction * step, unit: value.unit });
}

/** Why a value text cannot be written as a value edit, or null when it can. */
export function refuseValue(field: OutlineField, text: string): string | null {
  if (!text.trim()) return `${field.name} needs a value.`;
  if (/[\r\n]/.test(text)) return 'A value stays on one line. Use Source for multi-line edits.';
  if (/[{}]/.test(text)) return 'Braces change the model structure. Use Source for that edit.';
  let depth = 0;
  for (const c of text) { if (c === '[' || c === '(') depth++; if (c === ']' || c === ')') depth--; if (depth < 0) break; }
  if (depth !== 0) return 'Brackets are unbalanced.';
  if (field.shape === 'quantity' && !parseQuantity(text)) return `${field.name} is a number with a unit, such as ${field.text}.`;
  return null;
}

export interface FieldSplice { readonly source: string; readonly start: number; readonly length: number; readonly before: string; readonly after: string }

/** Replace one field value. Refuses when the source no longer holds the text the outline saw. */
export function spliceField(source: string, field: OutlineField, text: string): FieldSplice | { readonly error: string } {
  const { start, length } = field.valueSpan;
  if (start < 0 || start + length > source.length || source.slice(start, start + length) !== field.text)
    return { error: 'The source changed since the graph was read. Try the edit again.' };
  const refused = refuseValue(field, text);
  if (refused) return { error: refused };
  const after = text.trim();
  return { source: source.slice(0, start) + after + source.slice(start + length), start, length, before: field.text, after };
}

export function outlineNode(outline: LanguageOutline | null, id: string | null | undefined): OutlineNode | null {
  return outline && id ? outline.nodes.find(node => node.id === id) ?? null : null;
}

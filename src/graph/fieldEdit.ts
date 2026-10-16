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

export type FieldEditor =
  | { readonly kind: 'quantity'; readonly value: Quantity }
  | { readonly kind: 'vector'; readonly values: readonly Quantity[] }
  | { readonly kind: 'text' };

export function editorFor(field: OutlineField): FieldEditor {
  if (field.shape === 'quantity' || field.shape === 'number') {
    const value = parseQuantity(field.text);
    if (value) return { kind: 'quantity', value };
  }
  if (field.shape === 'sequence') {
    const parts = splitSequence(field.text);
    const values = parts?.map(parseQuantity);
    if (values && values.length >= 2 && values.length <= 4 && values.every((v): v is Quantity => !!v)) return { kind: 'vector', values };
  }
  return { kind: 'text' };
}

export function vectorText(values: readonly Quantity[]) { return `[${values.map(formatQuantity).join(', ')}]`; }

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

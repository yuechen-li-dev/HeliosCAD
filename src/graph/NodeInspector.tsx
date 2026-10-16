import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Diagnostic, OutlineField, OutlineNode, OutlineSpan, SemanticConstructSchema } from '@aetheris/cad';
import { editorFor, formatQuantity, nudge, parseQuantity, refuseValue, vectorText, type Quantity } from './fieldEdit';
import { categoryOf } from './outlineGraph';

export interface GraphEditState {
  readonly nodeId: string;
  readonly field: string;
  readonly from: string;
  readonly to: string;
  readonly status: 'building' | 'built' | 'failed';
}

interface Props {
  node: OutlineNode | null;
  nodes: ReadonlyMap<string, OutlineNode>;
  external: { title: string; document: string } | null;
  schema: SemanticConstructSchema | null;
  focusField: string | null;
  edit: GraphEditState | null;
  problems: readonly Diagnostic[];
  readOnly: string | null;
  onCommit(node: OutlineNode, field: OutlineField, text: string): string | null;
  onRevert(): void;
  onSelectNode(id: string): void;
  onOpenSource(span: OutlineSpan): void;
}

const axes = ['X', 'Y', 'Z', 'W'];

function kindLine(node: OutlineNode) {
  const kind = node.variant ? `${node.kind}<${node.variant}>` : node.kind;
  return [...node.modifiers, kind].join(' ');
}

export function NodeInspector({ node, nodes, external, schema, focusField, edit, problems, readOnly, onCommit, onRevert, onSelectNode, onOpenSource }: Props) {
  if (external) return <aside className="node-inspector" aria-label="Node inspector">
    <header className="node-head category-external"><strong>{external.title}</strong><small>Defined in {external.document}</small></header>
    <p className="node-note">This part comes from another file. Double-click it in the graph to open that file and edit it there.</p>
  </aside>;
  if (!node) return <aside className="node-inspector" aria-label="Node inspector">
    <div className="node-empty"><strong>Nothing selected</strong><p>Select a part in the graph to see and change its values. Changes build right away; the model only updates when the build succeeds.</p></div>
  </aside>;

  const authored = new Set(node.fields.map(field => field.name.toLowerCase()));
  const unset = schema?.fields.filter(field => !authored.has(field.name.toLowerCase())) ?? [];
  const children = node.children.map(id => nodes.get(id)).filter((child): child is OutlineNode => !!child);
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  const failed = edit?.nodeId === node.id && edit.status === 'failed' ? edit : null;
  const schemaField = (name: string) => schema?.fields.find(field => field.name.toLowerCase() === name.toLowerCase());

  return <aside className="node-inspector" aria-label="Node inspector">
    <header className={`node-head category-${categoryOf(node)}`}>
      <strong>{node.name ?? node.kind}</strong>
      <small>{kindLine(node)}</small>
      <button className="node-source" title="Open this declaration in Source" onClick={() => onOpenSource(node.span)}>Source</button>
    </header>
    {parent && parent.kind !== 'Model' && parent.kind !== 'model' && <button className="node-parent" onClick={() => onSelectNode(parent.id)}>↑ {parent.name ?? parent.kind}</button>}
    {readOnly && <p className="node-note">{readOnly}</p>}
    {failed && <div className="node-draft" role="alert">
      <strong>Draft doesn't build</strong>
      <p>{failed.field}: {failed.from} → {failed.to}. The viewport still shows the last good model.</p>
      {problems.some(item => item.severity === 'error')
        ? problems.filter(item => item.severity === 'error').slice(0, 2).map((item, index) => <p key={index} className="node-draft-message">{item.message}</p>)
        : <p>The compiler's diagnostic is in Problems.</p>}
      <button onClick={onRevert}>Revert to last good</button>
    </div>}
    {!failed && problems.length > 0 && <div className="node-problems">{problems.slice(0, 3).map((item, index) =>
      <p key={index} className={item.severity}>{item.message}</p>)}</div>}
    {node.fields.length > 0 && <div className="node-fields" role="group" aria-label="Values">
      {node.fields.map(field => <FieldRow key={`${node.id}:${field.name}`} field={field} description={schemaField(field.name)?.description ?? null}
        focus={focusField?.toLowerCase() === field.name.toLowerCase()} disabled={!!readOnly}
        status={edit?.nodeId === node.id && edit.field === field.name ? edit.status : null}
        onCommit={text => onCommit(node, field, text)} />)}
    </div>}
    {unset.length > 0 && <div className="node-unset">
      <span>Not set here</span>
      {unset.map(field => <p key={field.id} title={field.description ?? undefined}><b>{field.name}</b><small>{field.default != null ? `default ${field.default}` : field.required ? 'required' : 'optional'}</small></p>)}
    </div>}
    {children.length > 0 && <div className="node-children">
      <span>Contains</span>
      {children.map(child => <button key={child.id} onClick={() => onSelectNode(child.id)}><b>{child.name ?? child.kind}</b><small>{kindLine(child)}</small></button>)}
    </div>}
    {node.fields.length === 0 && children.length === 0 && unset.length === 0 && <p className="node-note">This declaration has no values to edit here.</p>}
  </aside>;
}

function FieldRow({ field, description, focus, disabled, status, onCommit }: {
  field: OutlineField; description: string | null; focus: boolean; disabled: boolean;
  status: GraphEditState['status'] | null; onCommit(text: string): string | null;
}) {
  const editor = editorFor(field);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  // Enter commits and the blur that follows must not commit the same text again
  // before the outline catches up with the new source.
  const pending = useRef<string | null>(null);
  useEffect(() => { setError(null); pending.current = null; }, [field.text]);
  useEffect(() => { if (focus) first.current?.focus(); }, [focus]);
  const commit = (text: string) => {
    if (text.trim() === field.text || text.trim() === pending.current) { if (text.trim() === field.text) setError(null); return; }
    pending.current = text.trim();
    const refused = refuseValue(field, text) ?? onCommit(text);
    if (refused) pending.current = null;
    setError(refused);
  };
  const label = <label className="node-field-name" title={description ?? undefined} htmlFor={`field-${field.span.start}`}>{field.name}</label>;
  const state = error ? <small className="node-field-state error" role="alert">{error}</small>
    : status === 'building' ? <small className="node-field-state">Building…</small>
    : status === 'built' ? <small className="node-field-state ok">Built</small>
    : status === 'failed' ? <small className="node-field-state error">Didn't build</small> : null;
  const rowClass = `node-field${status === 'failed' || error ? ' failed' : ''}${status === 'building' ? ' building' : ''}`;

  if (editor.kind === 'quantity') return <div className={rowClass}>{label}
    <QuantityInput id={`field-${field.span.start}`} inputRef={first} value={editor.value} disabled={disabled} onCommit={text => commit(text)} />{state}</div>;
  if (editor.kind === 'vector') return <div className={rowClass}>{label}
    <div className="node-vector">{editor.values.map((value, index) => <QuantityInput key={index} id={index === 0 ? `field-${field.span.start}` : undefined}
      inputRef={index === 0 ? first : undefined} axis={axes[index]} value={value} disabled={disabled} hideUnit={sharedUnit(editor.values) !== null}
      onCommit={text => { const next = parseQuantity(text); if (!next) { setError(`${axes[index]} is a number with a unit.`); return; }
        commit(vectorText(editor.values.map((item, i) => i === index ? next : item))); }} />)}
      {sharedUnit(editor.values) && <span className="node-unit node-vector-unit">{sharedUnit(editor.values)}</span>}</div>{state}</div>;
  return <div className={rowClass}>{label}
    <TextInput id={`field-${field.span.start}`} inputRef={first} value={field.text} disabled={disabled} onCommit={commit} />{state}</div>;
}

const sharedUnit = (values: readonly Quantity[]) => values.every(v => v.unit === values[0].unit) && values[0].unit ? values[0].unit : null;

function QuantityInput({ id, value, axis, disabled, hideUnit, inputRef, onCommit }: {
  id?: string; value: Quantity; axis?: string; disabled: boolean; hideUnit?: boolean; inputRef?: React.Ref<HTMLInputElement>; onCommit(text: string): void;
}) {
  const shown = formatQuantity({ number: value.number, unit: '' });
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  // A bare number keeps the authored unit; a typed unit replaces it.
  const finish = () => { const parsed = parseQuantity(draft); if (!parsed) { onCommit(draft); return; } const text = formatQuantity({ number: parsed.number, unit: parsed.unit || value.unit }); if (text !== formatQuantity(value)) onCommit(text); };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(); }
    else if (event.key === 'Escape') { setDraft(shown); event.currentTarget.blur(); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = nudge(draft, event.key === 'ArrowUp' ? 1 : -1, { shift: event.shiftKey, alt: event.altKey });
      if (next !== null) setDraft(next);
    }
  };
  return <span className="node-quantity">
    {axis && <i>{axis}</i>}
    <input id={id} ref={inputRef} inputMode="decimal" spellCheck={false} disabled={disabled} value={draft} aria-label={axis}
      onChange={event => setDraft(event.target.value)} onKeyDown={onKey} onBlur={finish} />
    {value.unit && !hideUnit && <span className="node-unit">{value.unit}</span>}
  </span>;
}

function TextInput({ id, value, disabled, inputRef, onCommit }: { id: string; value: string; disabled: boolean; inputRef?: React.Ref<HTMLInputElement>; onCommit(text: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input id={id} ref={inputRef} className="node-text" spellCheck={false} disabled={disabled} value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={() => onCommit(draft)}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onCommit(draft); } else if (event.key === 'Escape') { setDraft(value); event.currentTarget.blur(); } }} />;
}

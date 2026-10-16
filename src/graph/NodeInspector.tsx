import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Diagnostic, LanguageField, OutlineField, OutlineNode, OutlineParameter, OutlineSpan, SemanticConstructSchema } from '@aetheris/cad';
import { editorFor, formatQuantity, nudge, parameterizable, parseQuantity, refuseValue, vectorText, type Quantity, type VectorPart } from './fieldEdit';
import { categoryOf } from './outlineGraph';

export interface GraphEditState {
  readonly nodeId: string;
  /** The field a value edit changed; null for structural edits. */
  readonly field: string | null;
  /** What changed, in words: `Size: [50mm, 40mm, 8mm] → [60mm, 40mm, 8mm]`, `Renamed Plate to Base`. */
  readonly label: string;
  readonly warnings: readonly string[];
  readonly status: 'building' | 'built' | 'failed';
}

/** A field a declaration could take that it does not write yet. */
export interface FieldSuggestion { readonly name: string; readonly hint: string; readonly value: string; readonly description: string | null }

/** Structural actions resolve to an error message, or null when the edit was applied. */
type Structural = Promise<string | null>;

interface Props {
  node: OutlineNode | null;
  nodes: ReadonlyMap<string, OutlineNode>;
  external: { title: string; document: string } | null;
  schema: SemanticConstructSchema | null;
  completion: readonly LanguageField[];
  focusField: string | null;
  edit: GraphEditState | null;
  problems: readonly Diagnostic[];
  readOnly: string | null;
  onCommit(node: OutlineNode, field: OutlineField, text: string): string | null;
  onAddField(node: OutlineNode, name: string, value: string): Structural;
  onRemoveField(node: OutlineNode, field: OutlineField): Structural;
  onRename(node: OutlineNode, name: string): Structural;
  onMove(node: OutlineNode, direction: -1 | 1): Structural;
  onDelete(node: OutlineNode): Structural;
  /** Make a dimension a parameter: the whole field, or one component (`axis`) of a list. */
  onPromote(node: OutlineNode, field: OutlineField, axis: number | null, name: string): Structural;
  /** Make a feature reusable: a Feature named `name` whose `parameters` fields vary per placement. */
  onExtract(node: OutlineNode, name: string, parameters: readonly string[]): Structural;
  onRevert(): void;
  onSelectNode(id: string): void;
  onOpenSource(span: OutlineSpan): void;
}

const axes = ['X', 'Y', 'Z', 'W'];

/** `Modify X`, `Recognize X` and `Assert ... X` name what they act on: changing the name retargets them. */
const retargets = (node: OutlineNode) => node.kind === 'Modify' || node.kind === 'modify' || node.kind === 'Recognize' || node.modifiers.includes('Assert');

function kindLine(node: OutlineNode) {
  if (node.call) return 'Placed Feature';
  const kind = node.variant ? `${node.kind}<${node.variant}>` : node.kind;
  return [...node.modifiers, kind].join(' ');
}

/** A starting value for a field the engineer adds: its default, its first choice, or a typed placeholder. */
export function startingValue(type: string, defaultValue?: string | null, choices?: readonly string[] | null) {
  if (defaultValue) return defaultValue;
  if (choices?.length) return choices[0];
  const t = type.toLowerCase();
  if (t === 'point2') return 'Point2(0mm, 0mm)';
  if (t.includes('angle')) return '0deg';
  if (t.includes('length') || t.includes('distance') || t.includes('radius') || t.includes('diameter')) return '1mm';
  if (t.includes('bool')) return 'true';
  if (t.includes('count') || t.includes('int') || t.includes('scalar') || t.includes('number')) return '1';
  if (t.includes('string') || t.includes('text')) return '""';
  return '';
}

/** Completion and schema both know fields; one list, completion first, without the authored ones. */
export function fieldSuggestions(node: OutlineNode, completion: readonly LanguageField[], schema: SemanticConstructSchema | null): FieldSuggestion[] {
  const authored = new Set(node.fields.map(field => field.name.toLowerCase()));
  const out = new Map<string, FieldSuggestion>();
  for (const field of completion) if (!authored.has(field.name.toLowerCase()) && !out.has(field.name.toLowerCase()))
    out.set(field.name.toLowerCase(), { name: field.name, hint: field.default ? `default ${field.default}` : field.required ? 'required' : field.type,
      value: startingValue(field.type, field.default, field.choices), description: field.meaning || null });
  // A schema field may apply to some variants only (Counterbore fields on Hole<Counterbore>).
  const applies = (variants?: readonly string[]) => !variants?.length || (!!node.variant && variants.includes(node.variant));
  for (const field of schema?.fields ?? []) if (applies(field.variants) && !authored.has(field.name.toLowerCase()) && !out.has(field.name.toLowerCase()))
    out.set(field.name.toLowerCase(), { name: field.name, hint: field.default != null ? `default ${field.default}` : field.required ? 'required' : 'optional',
      value: startingValue(field.unit === 'None' ? field.kind : field.unit, field.default, field.choices), description: field.description });
  return [...out.values()].sort((a, b) => Number(b.hint === 'required') - Number(a.hint === 'required'));
}

const isModify = (node: OutlineNode | undefined) => node?.kind === 'Modify' || node?.kind === 'modify';

/** The Feature a placed call names, found by name among the document's declarations. */
function calleeOf(node: OutlineNode, nodes: ReadonlyMap<string, OutlineNode>) {
  return node.call ? [...nodes.values()].find(n => n.kind === 'Feature' && n.name === node.kind) : undefined;
}

/** A call's unpassed parameters, with their defaults, as field suggestions. */
export function argumentSuggestions(node: OutlineNode, signature: readonly OutlineParameter[]): FieldSuggestion[] {
  const passed = new Set(node.fields.map(f => f.name));
  return signature.filter(p => !passed.has(p.name)).map(p => ({ name: p.name, hint: p.default ? `default ${p.default}` : `required ${p.type}`,
    value: p.default ?? startingValue(p.type), description: `${p.name}: ${p.type}` }));
}

export function NodeInspector(props: Props) {
  const { node, nodes, external, schema, completion, focusField, edit, problems, readOnly, onCommit, onAddField, onRemoveField, onRevert, onSelectNode, onOpenSource, onPromote, onExtract } = props;
  if (external) return <aside className="node-inspector" aria-label="Node inspector">
    <header className="node-head category-external"><strong>{external.title}</strong><small>Defined in {external.document}</small></header>
    <p className="node-note">This part comes from another file. Double-click it in the graph to open that file and edit it there.</p>
  </aside>;
  if (!node) return <aside className="node-inspector" aria-label="Node inspector">
    <div className="node-empty"><strong>Nothing selected</strong><p>Select a part in the graph to see and change its values. Changes build right away; the model only updates when the build succeeds.</p></div>
  </aside>;

  const children = node.children.map(id => nodes.get(id)).filter((child): child is OutlineNode => !!child);
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  const mine = edit?.nodeId === node.id ? edit : null;
  const schemaField = (name: string) => schema?.fields.find(field => field.name.toLowerCase() === name.toLowerCase());
  const callee = calleeOf(node, nodes);
  const suggestions = node.call ? argumentSuggestions(node, callee?.signature ?? []) : fieldSuggestions(node, completion, schema);
  const parameterId = (name: string) => [...nodes.values()].find(n => n.name === name && n.kind === 'Static')?.id;
  // A feature written as fields inside a Modify can become a reusable Feature.
  const reusable = !readOnly && !node.call && isModify(parent) && node.children.length === 0 && node.fields.some(parameterizable);

  return <aside className="node-inspector" aria-label="Node inspector">
    <NodeHead {...props} node={node} />
    {parent && parent.kind !== 'Model' && parent.kind !== 'model' && <button className="node-parent" onClick={() => onSelectNode(parent.id)}>↑ {parent.name ?? parent.kind}</button>}
    {readOnly && <p className="node-note">{readOnly}</p>}
    {mine?.status === 'failed' && <div className="node-draft" role="alert">
      <strong>Draft doesn't build</strong>
      <p>{mine.label}. The viewport still shows the last good model.</p>
      {problems.some(item => item.severity === 'error')
        ? problems.filter(item => item.severity === 'error').slice(0, 2).map((item, index) => <p key={index} className="node-draft-message">{item.message}</p>)
        : <p>The compiler's diagnostic is in Problems.</p>}
      <button onClick={onRevert}>Revert to last good</button>
    </div>}
    {mine && mine.warnings.length > 0 && <div className="node-warnings" role="status">{mine.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}
    {mine?.status !== 'failed' && problems.length > 0 && <div className="node-problems">{problems.slice(0, 3).map((item, index) =>
      <p key={index} className={item.severity}>{item.message}</p>)}</div>}
    {node.value && <div className="node-fields" role="group" aria-label="Value">
      <FieldRow field={node.value} label={node.annotation ? `Value · ${node.annotation}` : 'Value'} description={null} focus={false} disabled={!!readOnly}
        status={mine?.field === node.value.name ? mine.status : null} onCommit={text => onCommit(node, node.value!, text)} />
    </div>}
    {(node.fields.length > 0 || (!readOnly && !node.value)) && <div className="node-fields" role="group" aria-label="Values">
      {node.fields.map(field => <FieldRow key={`${node.id}:${field.name}`} field={field} description={schemaField(field.name)?.description ?? null}
        focus={focusField?.toLowerCase() === field.name.toLowerCase()} disabled={!!readOnly}
        status={mine?.field === field.name ? mine.status : null}
        onCommit={text => onCommit(node, field, text)} onRemove={() => onRemoveField(node, field)}
        onPromote={(axis, name) => onPromote(node, field, axis, name)} defaultParameter={`${node.name ?? node.kind}${field.name[0].toUpperCase()}${field.name.slice(1)}`}
        onParameter={name => { const id = parameterId(name); if (id) onSelectNode(id); }} />)}
      {!readOnly && <AddField key={node.id} suggestions={suggestions} onAdd={(name, value) => onAddField(node, name, value)} />}
    </div>}
    {node.call && callee && <div className="node-children">
      <span>Placed Feature</span>
      <button onClick={() => onSelectNode(callee.id)}><b>{callee.name}</b><small>{(callee.signature ?? []).map(p => p.name).join(', ') || 'no parameters'}</small></button>
    </div>}
    {reusable && <MakeReusable node={node} onExtract={(name, parameters) => onExtract(node, name, parameters)} />}
    {children.length > 0 && <div className="node-children">
      <span>Contains</span>
      {children.map(child => <button key={child.id} onClick={() => onSelectNode(child.id)}><b>{child.name ?? child.kind}</b><small>{kindLine(child)}</small></button>)}
    </div>}
  </aside>;
}

function NodeHead({ node, nodes, readOnly, onRename, onMove, onDelete, onOpenSource }: Props & { node: OutlineNode }) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(node.name ?? '');
  useEffect(() => { setRenaming(false); setConfirming(false); setError(null); setName(node.name ?? ''); }, [node.id, node.name]);
  const siblings = [...nodes.values()].filter(n => n.parentId === node.parentId).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex(n => n.id === node.id);
  const run = async (action: Structural) => { const refused = await action; setError(refused); return refused; };
  const rename = async () => {
    const next = name.trim();
    if (!next || next === node.name) { setRenaming(false); setName(node.name ?? ''); return; }
    if (!await run(onRename(node, next))) setRenaming(false);
  };
  return <>
    <header className={`node-head category-${categoryOf(node)}`}>
      {renaming
        ? <input className="node-rename" aria-label="Name" autoFocus spellCheck={false} value={name} onChange={event => setName(event.target.value)}
            onBlur={() => void rename()} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void rename(); } if (event.key === 'Escape') { setName(node.name ?? ''); setRenaming(false); } }} />
        : <strong>{node.call ? node.kind : node.name && !readOnly
            ? <button className="node-title" title={retargets(node) ? 'Change which body this acts on' : 'Rename; every use in this file follows'} onClick={() => setRenaming(true)}>{node.name}</button>
            : node.name ?? node.kind}</strong>}
      <small>{kindLine(node)}</small>
      <div className="node-actions">
        {!readOnly && siblings.length > 1 && <>
          <button aria-label="Move up" title="Move up among its siblings" disabled={index <= 0} onClick={() => void run(onMove(node, -1))}>↑</button>
          <button aria-label="Move down" title="Move down among its siblings" disabled={index >= siblings.length - 1} onClick={() => void run(onMove(node, 1))}>↓</button>
        </>}
        <button title="Open this declaration in Source" onClick={() => onOpenSource(node.span)}>Source</button>
        {!readOnly && <button aria-label="Delete" title="Delete this declaration" className="node-delete" onClick={() => setConfirming(true)}>Delete</button>}
      </div>
    </header>
    {confirming && <div className="node-confirm" role="alertdialog" aria-label="Delete declaration">
      <p>Delete {node.name ?? node.kind}{node.children.length === 1 ? ' and the declaration inside it' : node.children.length ? ` and the ${node.children.length} declarations inside it` : ''}?</p>
      <button className="danger" onClick={() => { setConfirming(false); void run(onDelete(node)); }}>Delete</button>
      <button onClick={() => setConfirming(false)}>Cancel</button>
    </div>}
    {error && <p className="node-error" role="alert">{error}</p>}
  </>;
}

function AddField({ suggestions, onAdd }: { suggestions: readonly FieldSuggestion[]; onAdd(name: string, value: string): Structural }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const pick = (suggestion: FieldSuggestion) => { setOpen(true); setName(suggestion.name); setValue(suggestion.value); setError(null); requestAnimationFrame(() => valueInput.current?.select()); };
  const add = async () => {
    if (!name.trim() || !value.trim()) { setError('A field needs a name and a value.'); return; }
    const refused = await onAdd(name.trim(), value.trim());
    setError(refused);
    if (!refused) { setOpen(false); setName(''); setValue(''); }
  };
  const listId = useRef(`field-names-${Math.random().toString(36).slice(2)}`).current;
  if (!open) return <div className="node-add">
    {suggestions.slice(0, 6).map(s => <button key={s.name} className="node-suggestion" title={s.description ?? s.hint} onClick={() => pick(s)}>
      + {s.name}<small>{s.hint}</small></button>)}
    <button className="node-suggestion other" onClick={() => { setOpen(true); setError(null); }}>+ Field…</button>
  </div>;
  return <div className="node-add-form">
    <input aria-label="New field name" placeholder="Name" list={listId} spellCheck={false} value={name} autoFocus={!name}
      onChange={event => { setName(event.target.value); const s = suggestions.find(x => x.name === event.target.value); if (s && !value) setValue(s.value); }} />
    <datalist id={listId}>{suggestions.map(s => <option key={s.name} value={s.name}>{s.hint}</option>)}</datalist>
    <input ref={valueInput} aria-label="New field value" placeholder="Value" spellCheck={false} value={value} onChange={event => setValue(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add(); } if (event.key === 'Escape') setOpen(false); }} />
    <div><button className="primary" onClick={() => void add()}>Add</button><button onClick={() => { setOpen(false); setError(null); }}>Cancel</button></div>
    {error && <p className="node-error" role="alert">{error}</p>}
  </div>;
}

export function FieldRow({ field, label: shown, description, focus, disabled, status, onCommit, onRemove, onPromote, defaultParameter = '', onParameter = () => {} }: {
  field: OutlineField; label?: string; description: string | null; focus: boolean; disabled: boolean;
  status: GraphEditState['status'] | null; onCommit(text: string): string | null; onRemove?(): Structural;
  onPromote?(axis: number | null, name: string): Structural; defaultParameter?: string; onParameter?(name: string): void;
}) {
  const editor = editorFor(field);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  // Only a literal dimension can become a parameter: a whole quantity, or a numeric component of a list.
  const promotable = !!onPromote && (editor.kind === 'quantity' || (editor.kind === 'vector' && editor.parts.some(p => p.kind === 'quantity')));
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
  const label = <span className="node-field-label">
    <label className="node-field-name" title={description ?? undefined} htmlFor={`field-${field.span.start}`}>{shown ?? field.name}</label>
    {!disabled && promotable && <button className="node-field-promote" aria-label={`Make ${field.name} a parameter`} title="Make this a named parameter"
      onClick={() => setPromoting(value => !value)}>⇡</button>}
    {!disabled && onRemove && <button className="node-field-remove" aria-label={`Remove ${field.name}`} title={`Remove ${field.name}`}
      onClick={() => void onRemove().then(setError)}>×</button>}
  </span>;
  const promote = promoting && editor.kind !== 'text' ? <PromoteForm editor={editor} defaultName={defaultParameter}
    onCancel={() => setPromoting(false)} onPromote={async (axis, name) => { const refused = await onPromote!(axis, name); if (!refused) setPromoting(false); return refused; }} /> : null;
  const state = error ? <small className="node-field-state error" role="alert">{error}</small>
    : status === 'building' ? <small className="node-field-state">Building…</small>
    : status === 'built' ? <small className="node-field-state ok">Built</small>
    : status === 'failed' ? <small className="node-field-state error">Didn't build</small> : null;
  const rowClass = `node-field${status === 'failed' || error ? ' failed' : ''}${status === 'building' ? ' building' : ''}`;

  if (editor.kind === 'quantity') return <div className={rowClass}>{label}
    <QuantityInput id={`field-${field.span.start}`} inputRef={first} value={editor.value} disabled={disabled} onCommit={text => commit(text)} />{state}{promote}</div>;
  if (editor.kind === 'vector') {
    const unit = sharedUnit(editor.parts);
    const firstQuantity = editor.parts.findIndex(p => p.kind === 'quantity');
    return <div className={rowClass}>{label}
      <div className="node-vector">{editor.parts.map((part, index) => part.kind === 'name'
        ? <button key={index} className="node-parameter-chip" title={`${axes[index]} comes from the parameter ${part.name}`} onClick={() => onParameter(part.name)}>
            <i>{axes[index]}</i>{part.name}</button>
        : <QuantityInput key={index} id={index === firstQuantity ? `field-${field.span.start}` : undefined}
            inputRef={index === firstQuantity ? first : undefined} axis={axes[index]} value={part.value} disabled={disabled} hideUnit={unit !== null}
            onCommit={text => { const next = parseQuantity(text); if (!next) { setError(`${axes[index]} is a number with a unit.`); return; }
              commit(vectorText(editor.parts.map((item, i) => i === index ? { kind: 'quantity', value: next } : item))); }} />)}
        {unit && <span className="node-unit node-vector-unit">{unit}</span>}</div>{state}{promote}</div>;
  }
  return <div className={rowClass}>{label}
    <TextInput id={`field-${field.span.start}`} inputRef={first} value={field.text} disabled={disabled} onCommit={commit} />{state}</div>;
}

const sharedUnit = (parts: readonly VectorPart[]) => {
  const values = parts.flatMap(p => p.kind === 'quantity' ? [p.value] : []);
  return values.length && values.every(v => v.unit === values[0].unit) && values[0].unit ? values[0].unit : null;
};

function PromoteForm({ editor, defaultName, onPromote, onCancel }: {
  editor: Exclude<ReturnType<typeof editorFor>, { kind: 'text' }>; defaultName: string;
  onPromote(axis: number | null, name: string): Structural; onCancel(): void;
}) {
  const axesOffered = editor.kind === 'vector' ? editor.parts.flatMap((p, i) => p.kind === 'quantity' ? [i] : []) : [];
  const [axis, setAxis] = useState<number | null>(editor.kind === 'vector' ? axesOffered.at(-1) ?? null : null);
  const suffix = axis === null ? '' : axes[axis];
  const [name, setName] = useState(defaultName + suffix);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => setError(await onPromote(axis, name.trim()));
  return <div className="node-promote" role="group" aria-label="Make a parameter">
    {editor.kind === 'vector' && <div className="node-promote-axes">{axesOffered.map(i => <button key={i} aria-pressed={axis === i}
      onClick={() => { setAxis(i); setName(n => n.replace(/[XYZW]$/, '') + axes[i]); }}>{axes[i]}</button>)}</div>}
    <input aria-label="Parameter name" autoFocus spellCheck={false} value={name} onChange={event => setName(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } if (event.key === 'Escape') onCancel(); }} />
    <button className="primary" onClick={() => void submit()}>Make parameter</button>
    {error && <p className="node-error" role="alert">{error}</p>}
  </div>;
}

function MakeReusable({ node, onExtract }: { node: OutlineNode; onExtract(name: string, parameters: readonly string[]): Structural }) {
  const [open, setOpen] = useState(false);
  const options = node.fields.filter(parameterizable).map(f => f.name);
  const [name, setName] = useState(node.name ?? node.kind);
  const [chosen, setChosen] = useState<readonly string[]>(() => options.filter(o => o.toLowerCase() === 'center'));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOpen(false); setError(null); setName(node.name ?? node.kind); setChosen(options.filter(o => o.toLowerCase() === 'center')); }, [node.id]);
  if (!open) return <div className="node-reuse"><button onClick={() => setOpen(true)}>Make reusable…</button>
    <small>Turn this into a Feature you can place again with different values.</small></div>;
  return <div className="node-reuse open" role="group" aria-label="Make reusable">
    <label>Feature name<input aria-label="Feature name" spellCheck={false} value={name} onChange={event => setName(event.target.value)} /></label>
    <span>Varies per placement</span>
    {options.map(option => <label key={option} className="node-reuse-option"><input type="checkbox" checked={chosen.includes(option)}
      onChange={event => setChosen(list => event.target.checked ? [...list, option] : list.filter(o => o !== option))} />{option}</label>)}
    <small>Everything else stays the same in every placement. Values you vary start at today's values, so the model does not change.</small>
    <div><button className="primary" onClick={() => void onExtract(name.trim(), chosen).then(setError)}>Make reusable</button>
      <button onClick={() => setOpen(false)}>Cancel</button></div>
    {error && <p className="node-error" role="alert">{error}</p>}
  </div>;
}

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

import { useState } from 'react';
import type { LanguageOutline, OutlineField, OutlineNode } from '@aetheris/cad';
import { FieldRow, type GraphEditState } from './NodeInspector';

type Structural = Promise<string | null>;

interface Props {
  outline: LanguageOutline | null;
  edit: GraphEditState | null;
  readOnly: string | null;
  onCommit(node: OutlineNode, field: OutlineField, text: string): string | null;
  onRename(node: OutlineNode, name: string): Structural;
  onDelete(node: OutlineNode): Structural;
  onAdd(name: string, value: string): Structural;
  onSelect(id: string): void;
}

/** The parameters of a document: its named value declarations (`Static Thickness: Length = 8mm`). */
export function parameterNodes(outline: LanguageOutline | null) {
  return (outline?.nodes ?? []).filter(node => node.kind === 'Static' && !!node.value && !!node.name);
}

/** Named dimensions that drive the model: change one and everything that uses it follows. */
export function ParametersSheet({ outline, edit, readOnly, onCommit, onRename, onDelete, onAdd, onSelect }: Props) {
  const parameters = parameterNodes(outline);
  const nodes = new Map((outline?.nodes ?? []).map(n => [n.id, n]));
  const usersOf = (id: string) => [...new Set((outline?.edges ?? []).filter(e => e.to === id).map(e => e.from))]
    .map(from => nodes.get(from)).filter((n): n is OutlineNode => !!n);
  return <aside className="node-inspector parameters-sheet" aria-label="Parameters">
    <div className="parameters-intro"><strong>Parameters</strong>
      <p>Named dimensions. Change one and every part that uses it follows. Make one from any dimension with ⇡ in the inspector.</p></div>
    {parameters.length === 0 && <p className="node-note">No parameters yet.</p>}
    {parameters.map(node => <ParameterRow key={node.id} node={node} users={usersOf(node.id)} edit={edit?.nodeId === node.id ? edit : null}
      readOnly={readOnly} onCommit={onCommit} onRename={onRename} onDelete={onDelete} onSelect={onSelect} />)}
    {!readOnly && <AddParameter onAdd={onAdd} />}
  </aside>;
}

function ParameterRow({ node, users, edit, readOnly, onCommit, onRename, onDelete, onSelect }: {
  node: OutlineNode; users: readonly OutlineNode[]; edit: GraphEditState | null; readOnly: string | null;
  onCommit: Props['onCommit']; onRename: Props['onRename']; onDelete: Props['onDelete']; onSelect: Props['onSelect'];
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const rename = async () => {
    const next = name.trim();
    if (!next || next === node.name) { setRenaming(false); setName(node.name ?? ''); return; }
    const refused = await onRename(node, next);
    setError(refused);
    if (!refused) setRenaming(false);
  };
  return <section className="parameter" aria-label={`Parameter ${node.name}`}>
    <header>
      {renaming
        ? <input className="node-rename" aria-label="Parameter name" autoFocus spellCheck={false} value={name} onChange={e => setName(e.target.value)}
            onBlur={() => void rename()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void rename(); } if (e.key === 'Escape') { setRenaming(false); setName(node.name ?? ''); } }} />
        : <button className="node-title" disabled={!!readOnly} title="Rename; every use follows" onClick={() => setRenaming(true)}>{node.name}</button>}
      <small>{node.annotation ?? 'value'}</small>
      {!readOnly && <button className="parameter-delete" aria-label={`Delete ${node.name}`}
        title={users.length ? 'Still used: deleting it leaves those parts unresolved' : 'Delete'} onClick={() => void onDelete(node).then(setError)}>×</button>}
    </header>
    <FieldRow field={node.value!} label="Value" description={null} focus={false} disabled={!!readOnly}
      status={edit?.field === node.value!.name ? edit.status : null} onCommit={text => onCommit(node, node.value!, text)} />
    <div className="parameter-users">{users.length
      ? <>Used by {users.map(user => <button key={user.id} onClick={() => onSelect(user.id)}>{user.name ?? `${user.kind}(…)`}</button>)}</>
      : <span>Not used yet</span>}</div>
    {error && <p className="node-error" role="alert">{error}</p>}
  </section>;
}

function AddParameter({ onAdd }: { onAdd(name: string, value: string): Structural }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (!name.trim() || !value.trim()) { setError('A parameter needs a name and a value, such as Thickness and 8mm.'); return; }
    const refused = await onAdd(name.trim(), value.trim());
    setError(refused);
    if (!refused) { setName(''); setValue(''); }
  };
  return <div className="node-add-form parameter-add">
    <input aria-label="New parameter name" placeholder="Name" spellCheck={false} value={name} onChange={e => setName(e.target.value)} />
    <input aria-label="New parameter value" placeholder="8mm" spellCheck={false} value={value} onChange={e => setValue(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
    <div><button className="primary" onClick={() => void add()}>Add parameter</button></div>
    {error && <p className="node-error" role="alert">{error}</p>}
  </div>;
}

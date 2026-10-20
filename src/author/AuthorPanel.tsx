import { useEffect, useRef, useState } from 'react';
import { request } from '../cloud/api';
import { AgentWorkspace, runAgent, type AgentGateway, type AgentTurn } from './agentWorkspace';
import { cloneProject, type EditableWorkspace, type ProjectSnapshot } from '../app/projectSnapshot';
const gateway: AgentGateway = { async respond(model, snapshot, requirements, input, signal) {
  const documentHashes = Object.fromEntries(await Promise.all(Object.entries(snapshot.documents).map(async ([path, source]) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return [path, Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')];
  })));
  const result = await request<{ turn: AgentTurn }>('/api/helios/author/respond', { method: 'POST', signal,
    body: JSON.stringify({ model, root: snapshot.root, documents: Object.keys(snapshot.documents), documentHashes, requirements, input }) });
  return result.turn;
} };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
interface AuthorProvider { id: string; label: string; configured: boolean; credentialVariable: string; models: { id: string; label: string }[] }

export function AuthorPanel({ workspace, requirements, onRequirementsChange, onCheckpoint, restoredRevision, onBusyChange }: {
  workspace: EditableWorkspace;
  requirements: string;
  onRequirementsChange(value: string): void;
  onCheckpoint(title: string, project: ProjectSnapshot): Promise<void>;
  restoredRevision: number;
  onBusyChange(busy: boolean): void;
}) {
  const current = useRef(workspace); current.current = workspace;
  const [providers, setProviders] = useState<AuthorProvider[]>([]);
  const [providerId, setProviderId] = useState('openai');
  const [connection, setConnection] = useState('Connecting to Leviathan…');
  const [model, setModel] = useState('gpt-6.1-sol');
  const [prompt, setPrompt] = useState('');
  const [autoApply, setAutoApply] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [activity, updateActivity] = useState('');
  function setActivity(value: string) { updateActivity(value); onBusyChange(!!value); }
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<{ project: ProjectSnapshot; base: ProjectSnapshot; revision: number; built: boolean } | null>(null);
  const [transcript, setTranscript] = useState<unknown[]>([]);
  const cancellation = useRef<AbortController | null>(null);
  const provider = providers.find(p => p.id === providerId);
  const configured = !!provider?.configured;
  useEffect(() => {
    const abort = new AbortController();
    void request<{ providers: AuthorProvider[] }>('/api/helios/author/status', { signal: abort.signal }).then(status => {
      if (!status.providers?.length) throw new Error('Provider catalog unavailable.');
      setProviders(status.providers); setConnection('');
    }).catch(() => { if (!abort.signal.aborted) setConnection('Connect to an updated Leviathan server for AI providers. Sign in for agent requests.'); });
    return () => { abort.abort(); cancellation.current?.abort(); };
  }, []);
  useEffect(() => { setTranscript([]); setCandidate(null); setAnswer(''); setError(''); }, [workspace.id, restoredRevision]);
  function changeModel(providerId: string, model: string) {
    setProviderId(providerId); setModel(model);
    setTranscript([]); setCandidate(null); setAnswer(''); setError('');
  }
  async function apply(next: NonNullable<typeof candidate>) {
    if (!next.built) throw new Error('The candidate must build successfully before application.');
    setActivity('Applying built candidate…');
    try {
      const built = await current.current.apply(next.project, next.revision, 'AI source changes');
      setCandidate(null);
      try { await onCheckpoint('AI changes applied', next.project); }
      catch { setError('Source applied, but its new checkpoint could not be stored. The pre-task recovery checkpoint is retained.'); }
      if (!built) setError('Source applied, but the workspace build failed. Last valid geometry remains visible; restore a checkpoint to recover.');
    } finally { setActivity(''); }
  }
  async function run() {
    if (!prompt.trim() || cancellation.current || current.current.busy) return;
    const task = prompt.trim(), base = current.current.snapshot();
    const abort = new AbortController(); cancellation.current = abort;
    const deadline = setTimeout(() => abort.abort(new Error('Agent time budget reached. Candidate changes were not applied.')), minutes * 60_000);
    let sandbox: AgentWorkspace | undefined;
    setError(''); setAnswer(''); setCandidate(null); setActivity('Saving recovery checkpoint…');
    try {
      await onCheckpoint('Before AI task', base.project);
      sandbox = await AgentWorkspace.create(base.project, abort.signal);
      const result = await runAgent(gateway, sandbox, model, requirements, [...transcript, { role: 'user', content: task }], abort.signal, text => {
        if (current.current.snapshot().revision !== base.revision) abort.abort(new Error('The working source changed. Start a new task against the current revision.'));
        setActivity(text);
      });
      abort.signal.throwIfAborted(); setTranscript(result.transcript); setAnswer(result.text + `\n\nReported token usage: ${result.tokens}.`); setPrompt('');
      const changed = JSON.stringify(base.project) !== JSON.stringify(sandbox.project);
      if (changed) {
        if (!sandbox.built) { setActivity('Checking candidate build…'); await sandbox.execute('build', {}); }
        abort.signal.throwIfAborted();
        const next = { project: cloneProject(sandbox.project), base: base.project, revision: base.revision, built: sandbox.built };
        setCandidate(next);
        if (!next.built) setError('The candidate failed its final build. Working source and geometry were retained.');
        else if (autoApply) await apply(next);
      }
    } catch (error) { setError(errorText(abort.signal.aborted ? abort.signal.reason : error)); }
    finally { clearTimeout(deadline); sandbox?.dispose(); cancellation.current = null; setActivity(''); }
  }
  return <section className="author-panel" aria-label="AI Author">
    <div className="panel-heading">AI author</div>
    <div className="author-body">
      <p role="status">{activity || connection || (configured ? `${provider?.label} · server credentials` : `Configure ${provider?.credentialVariable} on Leviathan. Keys stay out of source and chat.`)}</p>
      <label>Provider<select aria-label="AI provider" value={providerId} disabled={!!activity || !providers.length} onChange={e => {
        const next = providers.find(p => p.id === e.target.value)!; changeModel(next.id, next.models[0].id);
      }}>{providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Model<select aria-label="AI model" value={model} disabled={!!activity || !provider} onChange={e => changeModel(providerId, e.target.value)}>
        {provider?.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select></label>
      <p>Changing provider or model starts a fresh conversation. Your project, requirements and checkpoints stay in place.</p>
      <label>Engineering requirements<textarea aria-label="Engineering requirements" value={requirements} disabled={!!activity || workspace.busy} placeholder="Interfaces, envelope, material, tolerances…" onChange={e => { onRequirementsChange(e.target.value); setCandidate(null); }} /></label>
      <label><input type="checkbox" checked={autoApply} disabled={!!activity} onChange={e => setAutoApply(e.target.checked)} />Apply changes after a successful build</label>
      <label>Task budget (minutes)<input aria-label="Agent time budget" type="number" min="1" max="60" value={minutes} disabled={!!activity} onChange={e => setMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 5)))} /></label>
      {error && <p role="alert">{error}</p>}
      {answer && <div className="agent-answer">{answer}</div>}
      {candidate && <div><strong>{candidate.built ? 'Built candidate' : 'Rejected candidate'} · source changes</strong>
        {Object.keys(candidate.project.documents).filter(p => candidate!.project.documents[p] !== candidate!.base.documents[p]).map(path => <details key={path}><summary>{path}</summary><p>Before</p><pre>{candidate!.base.documents[path] ?? '(new file)'}</pre><p>After</p><pre>{candidate!.project.documents[path]}</pre></details>)}
        <button disabled={!candidate.built || !!activity || workspace.busy} onClick={() => void apply(candidate).catch(error => setError(errorText(error)))}>Apply candidate</button>
        <button disabled={!!activity} onClick={() => setCandidate(null)}>Discard candidate</button>
      </div>}
    </div>
    <div className="author-composer"><textarea aria-label="Engineering intent" value={prompt} disabled={!!activity} placeholder="Describe the part or change…" onChange={e => setPrompt(e.target.value)} />
      {activity ? <button disabled={activity === 'Applying built candidate…' || !cancellation.current} onClick={() => cancellation.current?.abort(new Error('Cancelled. Candidate changes were not applied.'))}>{activity === 'Applying built candidate…' || !cancellation.current ? 'Finishing transaction…' : 'Stop agent'}</button>
        : <button disabled={!configured || !prompt.trim() || workspace.busy} onClick={() => void run()}>Run agent</button>}
      <button disabled={!!activity} onClick={() => { setTranscript([]); setCandidate(null); setAnswer(''); }}>New conversation</button>
    </div>
  </section>;
}

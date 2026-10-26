import { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../cloud/api';
import { AgentWorkspace, runAgent, type AgentGateway, type AgentTurn } from './agentWorkspace';
import { cloneProject, type EditableWorkspace, type ProjectSnapshot } from '../app/projectSnapshot';
import { projectHashes } from './engineeringEvidence';
import { runLocalAgent } from './localAgent';
const gateway: AgentGateway = { async respond(model, snapshot, requirements, input, signal) {
  const documentHashes = await projectHashes(snapshot);
  const result = await request<{ turn: AgentTurn }>('/api/helios/author/respond', { method: 'POST', signal,
    body: JSON.stringify({ model, root: snapshot.root, documents: Object.keys(snapshot.documents), documentHashes, requirements, input, referenceIds: snapshot.referenceIds ?? [] }) });
  return result.turn;
}, async invoke(name, args, snapshot, requirements, signal) {
  return request('/api/helios/author/tools/invoke', { method: 'POST', signal, body: JSON.stringify({ name, arguments: args,
    root: snapshot.root, documentHashes: await projectHashes(snapshot), requirements, referenceIds: snapshot.referenceIds ?? [] }) });
} };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
/** Why AI cannot be used right now: no session (sign in) or no reachable Helios host. */
type AccessProblem = 'sign-in' | 'local-session' | 'host' | null;
/** A 401 on the standalone launcher means its local session expired (it has no password sign-in); elsewhere, sign in. */
async function accessProblem(error: unknown): Promise<AccessProblem> {
  if (!(error instanceof ApiError && error.status === 401)) return 'host';
  const status = await request<{ mode: string }>('/__helios/status').catch(() => null);
  return status?.mode === 'desktop' ? 'local-session' : 'sign-in';
}
interface AuthorProvider { id: string; label: string; configured: boolean; credentialVariable: string; models: { id: string; label: string }[] }
interface LocalSettings { configPath: string; defaultProvider: string; error: string | null }
interface ConnectionProbe { connected: boolean; message: string; models: { id: string; label: string }[] }
interface DesktopPairing { token: string; expiresAt: string; configuration: object; message: string }
const desktopLabel = (mode: string) => mode === 'claude-code' ? 'Claude Code' : mode === 'claude-desktop' ? 'Claude Desktop' : 'Antigravity';

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
  const [connection, setConnection] = useState('Checking AI connections…');
  const [local, setLocal] = useState<LocalSettings | null>(null);
  const [mode, setMode] = useState('api');
  const [pairings, setPairings] = useState<Record<string, DesktopPairing>>({});
  const desktop = mode === 'claude-code' || mode === 'claude-desktop' || mode === 'antigravity';
  const pairing = pairings[mode];
  const pairingReady = !!pairing && Date.parse(pairing.expiresAt) > Date.now();
  const [probe, setProbe] = useState<ConnectionProbe | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [model, setModel] = useState('gpt-6.1-sol');
  const [prompt, setPrompt] = useState('');
  const [autoApply, setAutoApply] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [activity, updateActivity] = useState('');
  function setActivity(value: string) { updateActivity(value); onBusyChange(!!value); }
  const [answer, setAnswer] = useState('');
  const [outcome, setOutcome] = useState('');
  const [reviewPackage, setReviewPackage] = useState<AgentWorkspace['reviewPackage']>(null);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<{ project: ProjectSnapshot; base: ProjectSnapshot; revision: number; built: boolean } | null>(null);
  const [transcript, setTranscript] = useState<unknown[]>([]);
  const cancellation = useRef<AbortController | null>(null);
  const provider = mode === 'codex' ? { id: 'codex', label: 'Codex', configured: !!probe?.connected, credentialVariable: '', models: probe?.models ?? [] } : providers.find(p => p.id === providerId);
  const configured = desktop ? pairingReady : !!provider?.configured;
  const [access, setAccess] = useState<AccessProblem>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void request<{ providers: AuthorProvider[]; local?: LocalSettings }>('/api/helios/author/status', { signal: abort.signal }).then(status => {
      if (!status.providers?.length) throw new Error('Provider catalog unavailable.');
      setProviders(status.providers); setConnection(''); setAccess(null);
      setLocal(status.local ?? null);
      if (['codex', 'claude-code', 'claude-desktop', 'antigravity'].includes(status.local?.defaultProvider ?? '')) setMode(status.local!.defaultProvider);
      else if (status.local?.defaultProvider) { const p = status.providers.find(p => p.id === status.local!.defaultProvider); if (p) { setProviderId(p.id); setModel(p.models[0].id); } }
    }).catch(async error => { const problem = await accessProblem(error); if (!abort.signal.aborted) { setAccess(problem); setConnection(''); } });
    return () => { abort.abort(); cancellation.current?.abort(); };
  }, [statusAttempt]);
  useEffect(() => { setTranscript([]); setCandidate(null); setAnswer(''); setOutcome(''); setError(''); setReviewPackage(null); }, [workspace.id, restoredRevision]);
  function changeModel(providerId: string, model: string) {
    setProviderId(providerId); setModel(model);
    setSettingsMessage('');
    setTranscript([]); setCandidate(null); setAnswer(''); setOutcome(''); setError(''); setReviewPackage(null);
  }
  async function settingsAction(action: 'reload' | 'open' | 'test') {
    setSettingsBusy(true); setSettingsMessage('');
    try {
      if (action === 'open') {
        const result = await request<{ message: string }>('/api/helios/author/local/open-config', { method: 'POST', body: '{}' });
        setSettingsMessage(result.message);
      } else if (action === 'reload') {
        const status = await request<{ providers: AuthorProvider[]; local: LocalSettings }>('/api/helios/author/status');
        setProviders(status.providers); setLocal(status.local); setProbe(null); setTranscript([]); setCandidate(null);
        setSettingsMessage(status.local?.error ?? 'Connections reloaded. Test your selected connection before running a task.');
      } else {
        if (desktop) {
          const next = await request<DesktopPairing>('/api/helios/author/local/pair', { method: 'POST', body: JSON.stringify({ provider: mode, pairingToken: pairing?.token }) });
          setPairings(previous => ({ ...previous, [mode]: next })); setSettingsMessage(next.message); return;
        }
        const result = await request<ConnectionProbe>('/api/helios/author/local/test', { method: 'POST', body: JSON.stringify({ provider: mode === 'codex' ? 'codex' : providerId }) });
        if (mode === 'codex') {
          setProbe(result);
          const selected = result.models.some(m => m.id === model) ? model : result.models[0]?.id ?? '';
          if (selected !== model) changeModel(providerId, selected);
        }
        setSettingsMessage(result.message);
      }
    } catch (error) { if (mode === 'codex') setProbe(null); setSettingsMessage(errorText(error)); if (error instanceof ApiError && error.status === 401) setAccess(await accessProblem(error)); }
    finally { setSettingsBusy(false); }
  }
  async function apply(next: NonNullable<typeof candidate>) {
    if (!next.built) throw new Error('The candidate must build successfully before application.');
    setActivity('Applying built candidate…');
    try {
      const built = await current.current.apply(next.project, next.revision, 'AI source changes');
      setCandidate(null);
      setOutcome(built ? 'Working project updated and built.' : 'Source updated; workspace build failed. Last valid geometry retained.');
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
    setError(''); setAnswer(''); setOutcome(''); setCandidate(null); setReviewPackage(null); setActivity('Saving recovery checkpoint…');
    try {
      await onCheckpoint('Before AI task', base.project);
      sandbox = await AgentWorkspace.create(base.project, abort.signal);
      const activity = (text: string) => {
        if (current.current.snapshot().revision !== base.revision) abort.abort(new Error('The working source changed. Start a new task against the current revision.'));
        setActivity(text);
      };
      const input = [...transcript, { role: 'user', content: task }];
      const result = mode !== 'api'
        ? await runLocalAgent(gateway, sandbox, desktop ? '' : model, requirements, input, abort.signal, activity, setAnswer, { agent: mode, pairingToken: pairing?.token })
        : await runAgent(gateway, sandbox, model, requirements, input, abort.signal, activity);
      abort.signal.throwIfAborted(); setTranscript(result.transcript); setAnswer(result.text + (result.tokens === null ? '' : `\n\nReported token usage: ${result.tokens}.`)); setPrompt('');
      setReviewPackage(sandbox.reviewPackage ?? null);
      const changed = JSON.stringify(base.project) !== JSON.stringify(sandbox.project);
      if (changed) {
        if (!sandbox.built) { setActivity('Checking candidate build…'); await sandbox.execute('build', {}); }
        abort.signal.throwIfAborted();
        const next = { project: cloneProject(sandbox.project), base: base.project, revision: base.revision, built: sandbox.built };
        setCandidate(next);
        setOutcome(next.built ? 'Candidate built; awaiting application.' : 'Candidate rejected. Working project retained.');
        if (!next.built) setError('The candidate failed its final build. Working source and geometry were retained.');
        else if (autoApply) await apply(next);
      } else setOutcome('Task completed without source changes.');
    } catch (error) { setError(errorText(abort.signal.aborted ? abort.signal.reason : error)); }
    finally { clearTimeout(deadline); sandbox?.dispose(); cancellation.current = null; setActivity(''); }
  }
  return <section className="author-panel" aria-label="AI Author">
    <div className="panel-heading">AI author</div>
    <div className="author-body">
      {access && <div className="author-access" role="status">
        {access === 'local-session'
          ? <p>Your local Helios session has expired. Restart Helios from its launcher, then select Retry.</p>
          : access === 'sign-in'
            ? <p>Sign in to use AI. <a href="/projects?signin=1" target="_blank" rel="noopener">Sign in</a> opens a new tab, so this document stays open here; then select Retry.</p>
          : <p>AI needs the Helios host. Run the standalone Helios app, or start Leviathan for source-workspace development. <a href="https://github.com/yuechen-li-dev/HeliosCAD/blob/main/docs/public/ai-connections.md" target="_blank" rel="noopener">Setup</a></p>}
        <button onClick={() => setStatusAttempt(value => value + 1)}>Retry</button>
      </div>}
      <p role="status">{activity || connection || (desktop ? `${desktopLabel(mode)} · native chat and subscription. ${pairingReady ? 'Pairing ready; start a task to grant candidate access.' : 'Prepare or renew your desktop connection below.'}` : mode === 'codex' ? (probe?.connected ? 'Codex · ChatGPT subscription' : 'Test the Codex connection. Sign in with ChatGPT in Codex first.') : configured ? `${provider?.label} · ${local ? 'API usage · local credentials' : 'server credentials'}` : local ? 'Configure this provider in helios.toml, then reload connections.' : `Configure ${provider?.credentialVariable} on the host. Keys stay out of source and chat.`)}</p>
      {local && <>
        <label>Connection<select aria-label="AI connection" value={mode} disabled={!!activity || settingsBusy} onChange={e => {
          setMode(e.target.value); changeModel(providerId, e.target.value === 'codex' ? probe?.models[0]?.id ?? '' : providers.find(p => p.id === providerId)!.models[0].id);
        }}><option value="api">Provider API key</option><option value="codex">Installed Codex · ChatGPT subscription</option>
          <option value="claude-code">Claude Code · project workspace</option><option value="claude-desktop">Claude Desktop · local MCP</option><option value="antigravity">Antigravity · native desktop chat</option></select></label>
        <details><summary>AI connection settings</summary>
          <p>Local configuration: <code>{local.configPath}</code></p>
          <p>Keys stay on this computer and out of projects, chat and checkpoints. API usage is billed separately from subscriptions.</p>
          {local.error && <p role="alert">{local.error}</p>}
          <button disabled={!!activity || settingsBusy} onClick={() => void settingsAction('open')}>Open configuration folder</button>
          <button disabled={!!activity || settingsBusy} onClick={() => void settingsAction('reload')}>Reload connections</button>
          <button disabled={!!activity || settingsBusy} onClick={() => void settingsAction('test')}>{desktop ? 'Prepare desktop connection' : 'Test connection'}</button>
          {settingsMessage && <p role="status">{settingsMessage}</p>}
        </details>
      </>}
      {desktop && <div className="desktop-agent-connection">
        <p>Chat, sign-in and model selection stay in {desktopLabel(mode)}. Helios grants tools access to the active candidate and owns build, review and checkpoints.</p>
        <p>{mode === 'claude-desktop' ? 'Use Claude Desktop local MCP settings (Developer / Extensions). A project .mcp.json is not loaded by ordinary chat. The generated bridge runs on this computer; no VM localhost access is needed.'
          : mode === 'claude-code' ? 'Open the configured project in the Code workspace and enable its .mcp.json server. Ordinary Claude chat does not load a project MCP configuration.'
          : 'Add the configuration in Antigravity MCP Servers and refresh the server. Its native chat keeps your existing account.'}</p>
        {pairing && <>
          <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(pairing.configuration, null, 2)).then(() => setSettingsMessage('MCP configuration copied. Add it to your native client.')).catch(() => setError('Clipboard unavailable. Use the configuration shown below.'))}>Copy MCP configuration</button>
          <button disabled={!!activity || settingsBusy} onClick={() => {
            setSettingsBusy(true);
            void request('/api/helios/author/local/unpair', { method: 'POST', body: JSON.stringify({ token: pairing.token }) })
              .then(() => { setPairings(previous => { const next = { ...previous }; delete next[mode]; return next; }); setSettingsMessage('Desktop connection revoked.'); })
              .catch(error => setError(errorText(error))).finally(() => setSettingsBusy(false));
          }}>Disconnect desktop</button>
          <details><summary>Desktop MCP configuration</summary><pre>{JSON.stringify(pairing.configuration, null, 2)}</pre></details>
          <button onClick={() => void navigator.clipboard.writeText('Use the Helios MCP server. Call task_context to read the current task, carry it out using only the Helios candidate tools, build the result, then call finish_task with a summary. Do not edit host files or claim the candidate was applied.').then(() => setSettingsMessage('Task prompt copied. Start the task in Helios, then paste this in your native chat.')).catch(() => setError('Clipboard unavailable. Ask your native client to call Helios task_context, build, then finish_task.'))}>Copy desktop task prompt</button>
          <p>Pairing is limited to eight hours on this local host. Start a task here, then send the copied prompt in {desktopLabel(mode)}. Stop agent revokes the current candidate; your desktop app stays open.</p>
        </>}
      </div>}
      {mode === 'api' && <label>Provider<select aria-label="AI provider" value={providerId} disabled={!!activity || settingsBusy || !providers.length} onChange={e => {
        const next = providers.find(p => p.id === e.target.value)!; changeModel(next.id, next.models[0].id);
      }}>{providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
      {!desktop && <label>Model<select aria-label="AI model" value={model} disabled={!!activity || settingsBusy || !provider} onChange={e => changeModel(providerId, e.target.value)}>
        {provider?.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select></label>}
      <p>Changing provider or model starts a fresh conversation. Your project, requirements and checkpoints stay in place.</p>
      <label>Engineering requirements<textarea aria-label="Engineering requirements" value={requirements} disabled={!!activity || workspace.busy} placeholder="Interfaces, envelope, material, tolerances…" onChange={e => { onRequirementsChange(e.target.value); setCandidate(null); }} /></label>
      <label><input type="checkbox" checked={autoApply} disabled={!!activity} onChange={e => setAutoApply(e.target.checked)} />Apply changes after a successful build</label>
      <label>Task budget (minutes)<input aria-label="Agent time budget" type="number" min="1" max="60" value={minutes} disabled={!!activity} onChange={e => setMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 5)))} /></label>
      {error && <p role="alert">{error}</p>}
      {outcome && <p role="status">{outcome}</p>}
      {answer && <div className="agent-answer">{answer}</div>}
      {reviewPackage && <button onClick={() => {
        const url = URL.createObjectURL(new Blob([reviewPackage.bytes.slice().buffer], { type: 'application/zip' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = reviewPackage.fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download draft review package</button>}
      {candidate && <div><strong>{candidate.built ? 'Built candidate' : 'Rejected candidate'} · source changes</strong>
        {Object.keys(candidate.project.documents).filter(p => candidate!.project.documents[p] !== candidate!.base.documents[p]).map(path => <details key={path}><summary>{path}</summary><p>Before</p><pre>{candidate!.base.documents[path] ?? '(new file)'}</pre><p>After</p><pre>{candidate!.project.documents[path]}</pre></details>)}
        <button disabled={!candidate.built || !!activity || workspace.busy} onClick={() => void apply(candidate).catch(error => setError(errorText(error)))}>Apply candidate</button>
        <button disabled={!!activity} onClick={() => setCandidate(null)}>Discard candidate</button>
      </div>}
    </div>
    <div className="author-composer"><textarea aria-label="Engineering intent" value={prompt} disabled={!!activity} placeholder="Describe the part or change…" onChange={e => setPrompt(e.target.value)} />
      {activity ? <button disabled={activity === 'Applying built candidate…' || !cancellation.current} onClick={() => cancellation.current?.abort(new Error('Cancelled. Candidate changes were not applied.'))}>{activity === 'Applying built candidate…' || !cancellation.current ? 'Finishing transaction…' : 'Stop agent'}</button>
        : <button disabled={!configured || (!desktop && !model) || settingsBusy || !!local?.error || !prompt.trim() || workspace.busy} onClick={() => void run()}>{desktop ? 'Start desktop task' : 'Run agent'}</button>}
      <button disabled={!!activity} onClick={() => { setTranscript([]); setCandidate(null); setAnswer(''); setOutcome(''); setError(''); setReviewPackage(null); }}>New conversation</button>
    </div>
  </section>;
}

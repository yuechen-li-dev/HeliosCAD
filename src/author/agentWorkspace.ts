import { Aetheris, type ModelSession, type MeasurementRequest } from '@aetheris/cad';

import { cloneProject, type ProjectSnapshot } from '../app/projectSnapshot';
export interface AgentTurn { output: unknown[]; text: string; calls: { callId: string; name: string; arguments: string }[]; inputTokens: number; outputTokens: number }
export interface AgentGateway { respond(model: string, snapshot: ProjectSnapshot, requirements: string, input: unknown[], signal: AbortSignal): Promise<AgentTurn> }

/** Compiler sandbox. No tool has filesystem, shell, provider credential or live-model authority. */
export class AgentWorkspace {
  readonly project: ProjectSnapshot;
  private version = 0;
  private builtVersion = -1;
  private model: ModelSession | null = null;
  private disposed = false;
  private readonly abort = () => this.dispose();
  constructor(project: ProjectSnapshot, private cad: Aetheris, private signal?: AbortSignal) {
    this.project = cloneProject(project);
    signal?.addEventListener('abort', this.abort, { once: true });
    if (signal?.aborted) this.dispose();
  }
  static async create(project: ProjectSnapshot, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return new AgentWorkspace(project, await Aetheris.create({ worker: true }), signal);
  }
  get built() { return !!this.model && this.version === this.builtVersion; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.signal?.removeEventListener('abort', this.abort);
    this.cad.terminate(); this.model = null;
  }
  async execute(name: string, args: Record<string, unknown>) {
    if (this.disposed) throw new Error('The candidate workspace is closed.');
    const path = () => {
      const value = args.path;
      if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.includes(':') || value.split('/').some(p => p === '..' || p === '.' || !p))
        throw new Error('Use a project-relative document name.');
      return value;
    };
    if (name === 'schema') return { authoring: await this.cad.language.schema(), measurement: {
      modes: ['points', 'planes', 'axes'],
      request: '{ mode, first: { occurrenceId: string|null, faceId: number|null, rayOrigin: number[3], rayDirection: number[3] }, second?: same pick, allowApproximate: boolean }',
      note: 'Picks are world-space rays against the actual built model. Use build bounds and occurrence identities; do not invent measurement results.'
    } };
    if (name === 'read_file') { const key = path(); if (!Object.hasOwn(this.project.documents, key)) throw new Error('Document not found.'); return { path: key, source: this.project.documents[key] }; }
    if (name === 'edit_file') {
      const key = path(), before = args.before, after = args.after;
      if (typeof before !== 'string' || typeof after !== 'string') throw new Error('before and after must be source strings.');
      const current = this.project.documents[key];
      if (before === '') { if (current !== undefined) throw new Error('Empty before is only for a new document.'); }
      else if (current === undefined || !current.includes(before) || current.indexOf(before) !== current.lastIndexOf(before)) throw new Error('before must match exactly one source occurrence. Read the file again.');
      const next = before === '' ? after : current.replace(before, () => after);
      if (Object.values({ ...this.project.documents, [key]: next }).reduce((n, s) => n + s.length, 0) > 2_000_000) throw new Error('Candidate project exceeds the source budget.');
      this.project.documents[key] = next; ++this.version;
      return { path: key, status: 'candidate-edited', appliedToWorkingProject: false, buildRequired: true };
    }
    if (name === 'outline') {
      const key = path(); if (!Object.hasOwn(this.project.documents, key)) throw new Error('Document not found.');
      return this.cad.language.outline(this.project.documents[key], { sourceName: key, sourceRevision: String(this.version), projectRoot: this.project.root, projectDocuments: this.project.documents });
    }
    if (name === 'build') {
      this.builtVersion = -1;
      const result = await this.cad.compile(this.project.documents[this.project.root], { sourceName: this.project.root, sourceRevision: String(this.version), projectDocuments: this.project.documents });
      if (this.disposed) throw new Error('The candidate build was cancelled.');
      const previous = this.model; this.model = result.model;
      if (previous) await previous.dispose();
      if (result.model) this.builtVersion = this.version;
      return { accepted: !!result.model, diagnostics: result.diagnostics, tree: result.model?.tree,
        properties: result.model?.properties, measurementAvailable: result.model?.measurementAvailable,
        bounds: result.model ? { minimumMm: result.model.mesh.minimumMm, maximumMm: result.model.mesh.maximumMm } : null,
        occurrences: result.model?.mesh.occurrences,
        selections: result.model?.mesh.definitions.map(d => ({ id: d.id, faces: d.ranges, edges: d.edges?.map(e => ({ edgeId: e.edgeId })) })),
        status: result.model ? 'candidate-built-not-applied' : 'candidate-rejected' };
    }
    if (name === 'measure') {
      if (!this.built) throw new Error('Build the current candidate successfully before measuring it.');
      if (typeof args.request !== 'string') throw new Error('request must contain MeasurementRequest JSON.');
      return this.model!.measure(JSON.parse(args.request) as MeasurementRequest);
    }
    throw new Error(`Unknown engineering tool '${name}'.`);
  }
}

/** Explicit conversation loop. The model chooses tools; this host owns effects and evidence. */
export async function runAgent(gateway: AgentGateway, workspace: AgentWorkspace, model: string,
  requirements: string, input: unknown[], signal: AbortSignal, activity: (text: string) => void) {
  const transcript = [...input]; let tokens = 0;
  while (true) {
    signal.throwIfAborted(); activity('Waiting for the model…');
    const turn = await gateway.respond(model, workspace.project, requirements, transcript, signal);
    signal.throwIfAborted(); tokens += turn.inputTokens + turn.outputTokens;
    transcript.push(...turn.output);
    if (turn.calls.length === 0) return { text: turn.text, transcript, tokens };
    for (const call of turn.calls) {
      signal.throwIfAborted(); activity(call.name);
      let output: unknown;
      try { output = { ok: true, result: await workspace.execute(call.name, JSON.parse(call.arguments)) }; }
      catch (error) { output = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      signal.throwIfAborted();
      transcript.push({ type: 'function_call_output', call_id: call.callId, output: JSON.stringify(output) });
    }
  }
}

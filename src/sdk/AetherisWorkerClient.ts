import type { Diagnostic, ModelSession } from '@aetheris/cad';
import type { CadRuntime } from './CadRuntime';

export const BUILD_PROTOCOL_VERSION = 1;
export interface BuildRequest {
  readonly version: typeof BUILD_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly sourceRevision: number;
  readonly source: string;
  readonly sourceName: string;
}
export type BuildResult =
  | { readonly status: 'completed' | 'failed'; readonly request: BuildRequest; readonly model: ModelSession | null; readonly diagnostics: readonly Diagnostic[]; readonly milliseconds: number }
  | { readonly status: 'superseded'; readonly request: BuildRequest };

type Pending = { request: BuildRequest; resolve(result: BuildResult): void };

/** One running geometry build, with only the latest pending source retained. */
export class AetherisWorkerClient {
  private nextId = 0;
  private running = false;
  private pending: Pending | null = null;
  private generation = 0;

  constructor(private readonly runtime: CadRuntime) {}

  submit(source: string, sourceName: string, sourceRevision: number): Promise<BuildResult> {
    const request: BuildRequest = { version: BUILD_PROTOCOL_VERSION, requestId: ++this.nextId, sourceRevision, source, sourceName };
    return new Promise(resolve => {
      if (this.pending) this.pending.resolve({ status: 'superseded', request: this.pending.request });
      this.pending = { request, resolve };
      void this.pump();
    });
  }

  async restart() {
    this.generation++;
    if (this.pending) this.pending.resolve({ status: 'superseded', request: this.pending.request });
    this.pending = null;
    this.running = false;
    return this.runtime.restart();
  }

  private async pump() {
    if (this.running || !this.pending) return;
    this.running = true;
    const job = this.pending;
    this.pending = null;
    const generation = this.generation;
    const started = performance.now();
    try {
      const { request } = job;
      let model: ModelSession | null;
      let diagnostics: readonly Diagnostic[];
      if (this.runtime.session() && this.runtime.session()!.sourceName === request.sourceName) {
        const result = await this.runtime.setSource(request.source, request.sourceName, request.sourceRevision);
        model = result.success ? this.runtime.session() : null;
        diagnostics = result.diagnostics;
      } else {
        const result = await this.runtime.open(request.source, request.sourceName, request.sourceRevision);
        model = result.model;
        diagnostics = result.diagnostics;
      }
      performance.clearMeasures('aetheris-worker-build');
      performance.measure('aetheris-worker-build', { start: started, end: performance.now() });
      if (generation === this.generation) job.resolve({ status: model ? 'completed' : 'failed', request, model, diagnostics, milliseconds: performance.now() - started });
      else job.resolve({ status: 'superseded', request });
    } catch (error) {
      if (generation === this.generation) console.error('Aetheris Worker build failed', error);
      const diagnostic: Diagnostic = { severity: 'error', code: 'HELIOS-WORKER', message: error instanceof Error ? error.message : String(error) };
      if (generation === this.generation) job.resolve({ status: 'failed', request: job.request, model: null, diagnostics: [diagnostic], milliseconds: performance.now() - started });
      else job.resolve({ status: 'superseded', request: job.request });
    } finally {
      if (generation === this.generation) { this.running = false; void this.pump(); }
    }
  }
}

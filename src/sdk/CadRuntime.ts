import { Aetheris, type ConstructProjection, type Diagnostic, type LanguageCompletion, type ModelSession, type ProjectedValue, type RuntimeInfo, type SemanticSchema, type UnitValue } from '@aetheris/cad';

export interface OpenResult { model: ModelSession | null; diagnostics: readonly Diagnostic[] }

export interface CadRuntime {
  readonly info: RuntimeInfo | null;
  initialize(): Promise<RuntimeInfo>;
  open(source: string, sourceName: string, sourceRevision?: number): Promise<OpenResult>;
  setSource(source: string, sourceName: string, sourceRevision?: number): ReturnType<ModelSession['setSource']>;
  setProperty(id: string, value: UnitValue): ReturnType<ModelSession['setProperty']>;
  rebuild(): ReturnType<ModelSession['rebuild']>;
  exportSTEP(): Promise<Uint8Array>;
  dispose(): Promise<void>;
  restart(): Promise<RuntimeInfo>;
  session(): ModelSession | null;
  complete(source: string, offset: number, sourceName: string, revision: string): Promise<LanguageCompletion>;
  schema(): Promise<SemanticSchema>;
  describeConstruct(semanticId: string): Promise<ConstructProjection>;
  rewriteField(source: string, projection: ConstructProjection, fieldId: string, value: ProjectedValue): ReturnType<ModelSession['rewriteField']>;
}

export class WebSdkCadRuntime implements CadRuntime {
  private cad: Aetheris | null = null;
  private initializing: Promise<Aetheris> | null = null;
  private languageCad: Aetheris | null = null;
  private languageInitializing: Promise<Aetheris> | null = null;
  private model: ModelSession | null = null;
  info: RuntimeInfo | null = null;

  async initialize() {
    this.cad ??= await (this.initializing ??= Aetheris.create({ worker: true }));
    this.info = await this.cad.info();
    return this.info;
  }

  async open(source: string, sourceName: string, sourceRevision?: number) {
    await this.initialize();
    const result = await this.cad!.compile(source, { sourceName, sourceRevision: sourceRevision?.toString() });
    if (result.model) {
      const previous = this.model;
      this.model = result.model;
      if (previous) await previous.dispose();
    }
    return result;
  }

  setSource(source: string, sourceName: string, sourceRevision?: number) { return this.requireModel().setSource(source, { sourceName, sourceRevision: sourceRevision?.toString() }); }
  setProperty(id: string, value: UnitValue) { return this.requireModel().setProperty(id, value); }
  rebuild() { return this.requireModel().rebuild(); }
  exportSTEP() { return this.requireModel().exportSTEP(); }
  session() { return this.model; }
  async complete(source: string, offset: number, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.complete(source, offset, { sourceName, sourceRevision: revision });
  }

  async schema() {
    const cad = await this.initializeLanguage();
    return cad.language.schema();
  }
  describeConstruct(semanticId: string) { return this.requireModel().describeConstruct(semanticId); }
  rewriteField(source: string, projection: ConstructProjection, fieldId: string, value: ProjectedValue) {
    return this.requireModel().rewriteField(source, projection, fieldId, value);
  }

  async dispose() {
    // The SDK runtimes are page-lifetime resources and are reused between projects.
  }

  async restart() {
    this.cad?.terminate();
    this.cad = null;
    this.initializing = null;
    this.model = null;
    this.info = null;
    return this.initialize();
  }

  private async initializeLanguage() {
    this.languageCad ??= await (this.languageInitializing ??= Aetheris.create());
    return this.languageCad;
  }

  private requireModel() {
    if (!this.model) throw new Error('No Firmament model is open.');
    return this.model;
  }
}

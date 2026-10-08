import { Aetheris, type ConstructProjection, type Diagnostic, type LanguageAnalysis, type LanguageCompletion, type LanguageFormat, type LanguageHover, type ModelSession, type ProjectedValue, type RuntimeInfo, type SemanticSchema, type SourceReference, type UnitValue } from '@aetheris/cad';

export interface OpenResult { model: ModelSession | null; diagnostics: readonly Diagnostic[] }

export interface CadRuntime {
  setProjectContext?(root: string | null, documents: Readonly<Record<string,string>>): void;
  readonly info: RuntimeInfo | null;
  initialize(): Promise<RuntimeInfo>;
  open(source: string, sourceName: string, sourceRevision?: number, projectDocuments?: Readonly<Record<string,string>>): Promise<OpenResult>;
  setSource(source: string, sourceName: string, sourceRevision?: number, projectDocuments?: Readonly<Record<string,string>>): ReturnType<ModelSession['setSource']>;
  setProperty(id: string, value: UnitValue): ReturnType<ModelSession['setProperty']>;
  rebuild(): ReturnType<ModelSession['rebuild']>;
  exportSTEP(): Promise<Uint8Array>;
  dispose(): Promise<void>;
  restart(): Promise<RuntimeInfo>;
  session(): ModelSession | null;
  complete(source: string, offset: number, sourceName: string, revision: string): Promise<LanguageCompletion>;
  analyze(source: string, sourceName: string, revision: string): Promise<LanguageAnalysis>;
  hover(source: string, offset: number, sourceName: string, revision: string): Promise<LanguageHover | null>;
  definition(source: string, offset: number, sourceName: string, revision: string): Promise<SourceReference | null>;
  format(source: string, sourceName: string, revision: string): Promise<LanguageFormat>;
  schema(): Promise<SemanticSchema>;
  describeConstruct(semanticId: string): Promise<ConstructProjection>;
  rewriteField(source: string, projection: ConstructProjection, fieldId: string, value: ProjectedValue): ReturnType<ModelSession['rewriteField']>;
}

export class WebSdkCadRuntime implements CadRuntime {
  private disposed = false;
  private projectRoot: string | undefined;
  private projectDocuments: Readonly<Record<string,string>> | undefined;
  setProjectContext(root: string | null, documents: Readonly<Record<string,string>>) {
    this.projectRoot = root ?? undefined; this.projectDocuments = root ? documents : undefined;
  }
  private cad: Aetheris | null = null;
  private initializing: Promise<Aetheris> | null = null;
  private languageCad: Aetheris | null = null;
  private languageInitializing: Promise<Aetheris> | null = null;
  private model: ModelSession | null = null;
  info: RuntimeInfo | null = null;

  async initialize() {
    const cad = this.cad ?? await (this.initializing ??= Aetheris.create({ worker: true }));
    if (this.disposed) { cad.terminate(); throw new Error('This workspace has closed.'); }
    this.cad = cad;
    this.info = await this.cad.info();
    return this.info;
  }

  async open(source: string, sourceName: string, sourceRevision?: number, projectDocuments?: Readonly<Record<string,string>>) {
    await this.initialize();
    const result = await this.cad!.compile(source, { sourceName, sourceRevision: sourceRevision?.toString(), projectDocuments });
    if (result.model) {
      const previous = this.model;
      this.model = result.model;
      if (previous) await previous.dispose();
    }
    return result;
  }

  setSource(source: string, sourceName: string, sourceRevision?: number, projectDocuments?: Readonly<Record<string,string>>) { return this.requireModel().setSource(source, { sourceName, sourceRevision: sourceRevision?.toString(), projectDocuments }); }
  setProperty(id: string, value: UnitValue) { return this.requireModel().setProperty(id, value); }
  rebuild() { return this.requireModel().rebuild(); }
  exportSTEP() { return this.requireModel().exportSTEP(); }
  session() { return this.model; }
  async complete(source: string, offset: number, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.complete(source, offset, { sourceName, sourceRevision: revision });
  }

  async analyze(source: string, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.analyze(source, { sourceName, sourceRevision: revision, projectRoot: this.projectRoot, projectDocuments: this.projectDocuments });
  }

  async hover(source: string, offset: number, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.hover(source, offset, { sourceName, sourceRevision: revision });
  }

  async definition(source: string, offset: number, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.definition(source, offset, { sourceName, sourceRevision: revision });
  }

  async format(source: string, sourceName: string, revision: string) {
    const cad = await this.initializeLanguage();
    return cad.language.format(source, { sourceName, sourceRevision: revision });
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
    this.disposed = true;
    void this.initializing?.then(cad => cad.terminate()).catch(() => undefined);
    this.cad?.terminate(); this.languageCad?.terminate();
    this.cad = null; this.languageCad = null; this.model = null;
    this.initializing = null; this.languageInitializing = null; this.info = null;
  }

  async restart() {
    this.disposed = false;
    this.cad?.terminate();
    this.cad = null;
    this.initializing = null;
    this.model = null;
    this.info = null;
    return this.initialize();
  }

  private async initializeLanguage() {
    const cad = this.languageCad ?? await (this.languageInitializing ??= Aetheris.create());
    if (this.disposed) { cad.terminate(); throw new Error('This workspace has closed.'); }
    this.languageCad = cad;
    return this.languageCad;
  }

  private requireModel() {
    if (!this.model) throw new Error('No Firmament model is open.');
    return this.model;
  }
}

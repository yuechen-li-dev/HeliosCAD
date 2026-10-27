import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, LanguageOutline, ModelSession, LanguageEditOperation, LanguageField, MotionPose, OutlineField, OutlineNode, PaletteItem, SelectionDescription, SemanticSchema, UnitValue } from '@aetheris/cad';
import { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { AetherisWorkerClient, type BuildResult } from '../sdk/AetherisWorkerClient';
import { assemblySource, bracketSource, emptyModelSource } from '../sdk/samples';
import { LocalHostControl } from '../desktop/LocalHostControl';
import { appendCenteredHole, appendFaceDatum, appendHoleWallDiameter, insertBox } from '../commands/sourceAuthoring';
import { CommandPalette, type PaletteCommand } from '../commands/CommandPalette';
import { ProjectExplorer } from '../explorer/ProjectExplorer';
import { Inspector } from '../inspector/Inspector';
import { BottomDock } from './BottomDock';
import { useShellLayout } from './shellLayout';
import { matchKind } from 'machinalayout/match';
import { SourcePanel, type SourcePanelHandle } from '../source/SourcePanel';
import { Viewport } from '../viewport/Viewport';
import type { BusyState, DisplayMode, ThemeName, ViewMode } from './types';
import type { Project } from '../cloud/api';
import { ModelTree } from '../model-tree/ModelTree';
import { ExampleGallery } from '../showcase/ExampleGallery';
import { ExampleDialog } from '../showcase/ExampleDialog';
import { loadShowcase, type WorkspaceProject } from '../showcase/catalog';
import { WorkspacePanels } from './WorkspacePanels';
import { ResizeHandle } from './ResizeHandle';
import { WorkspaceStatus } from './WorkspaceStatus';
import { useTheme } from '../themes/useTheme';
import { GraphPanel, type GraphSelection } from '../graph/GraphPanel';
import { IntelliDraftPanel } from '../graph/IntelliDraftPanel';
import { NodeInspector, type GraphEditState } from '../graph/NodeInspector';
import { outlineNode, spliceField } from '../graph/fieldEdit';
import { bodyParent, featureTarget, paletteOperation, paletteUnavailable, wireOperation } from '../graph/graphAuthoring';
import { editorFor, formatQuantity, parameterSource, vectorText, type Quantity } from '../graph/fieldEdit';
import { startingValue } from '../graph/NodeInspector';
import { parameterNodes, ParametersSheet } from '../graph/ParametersSheet';
import { buildPartGraph, nodeAtSpan, unitAtSpan, type GraphRow, type PartGraph } from '../graph/outlineGraph';
import { assembliesOf, buildAssemblyGraph, type AssemblyEnd } from '../graph/assemblyGraph';
import type { AssemblyView } from '../graph/GraphPanel';
import { MotionStrip } from '../viewport/MotionStrip';
import { poseCoverage } from '../viewport/pose';
import type { ExportFormat } from '@aetheris/cad';
import { ExportPicker } from './ExportPicker';
import { importedProject, isStep, packProject, sourceFiles, unpackProject } from './localProject';
import { registerRecoverableSource } from './crashRecovery';
import { PmiAuthor } from '../inspector/PmiAuthor';
import { AuthoringPanel, type AuthoringAction, type PendingAuthoring } from '../graph/AuthoringPanel';

type UtilityTab = { kind: 'files' } | { kind: 'inspector' } | { kind: 'examples' } | { kind: 'llm' } | { kind: 'version-control' };

export function HeliosApp({ project, initialWorkspace, chooseBase = false, onShowcase, onSave, onPublish, onBack, onSignOut }: { project?: Project; initialWorkspace?: WorkspaceProject; chooseBase?: boolean; onShowcase?: () => void; onSave?: (source: string) => Promise<void>; onPublish?: (payload: { expectedRevisionId: string; title: string; description: string; category: string; tags: string[]; previewPngBase64: string }) => Promise<void>; onBack?: () => void; onSignOut?: () => void } = {}) {
  const [runtime] = useState(() => new WebSdkCadRuntime());
  const [buildClient] = useState(() => new AetherisWorkerClient(runtime));
  const [editorMode, setEditorMode] = useState<'graph' | 'source'>(() => chooseBase ? 'graph' : readEditorMode());
  const [intelliDraft, setIntelliDraft] = useState<{ revision: number; source?: string; node?: string | null } | null>(null);
  const openIntelliDraftRef = useRef<(node?: string | null) => void>(() => {});
  const shellLayout = useShellLayout(editorMode);
  const [model, setModel] = useState<ModelSession | null>(null);
  const [showConcepts, setShowConcepts] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [semanticSchema, setSemanticSchema] = useState<SemanticSchema | null>(null);
  const [fieldProjection, setFieldProjection] = useState<ConstructProjection | null>(null);
  const initialName = initialWorkspace?.root ?? (project ? `${project.name}.firmament` : 'editable-bracket.firmament');
  const initialSource = initialWorkspace?.documents[initialName] ?? project?.source ?? bracketSource;
  const [source, setSource] = useState(initialSource);
  const [sourceName, setSourceName] = useState(initialName);
  const [workspaceTitle, setWorkspaceTitle] = useState(initialWorkspace?.title ?? project?.name ?? 'Mounting plate');
  // One name for the part everywhere: the Model (or Assembly) it declares; the file keeps its own name.
  const partName = /\b(?:Model|Assembly)\s+([A-Za-z_]\w*)\s*\{/.exec(source)?.[1] ?? workspaceTitle;
  const [openingExample, setOpeningExample] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [welcomeHint, setWelcomeHint] = useState(() => !localStorage.getItem('helios-workflow-understood'));
  const [saveState, setSaveState] = useState('Saved');
  const [dirtyFiles, setDirtyFiles] = useState<ReadonlySet<string>>(new Set());
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [liveDiagnostics, setLiveDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [outputEvents, setOutputEvents] = useState<string[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [selectedSelection, setSelectedSelection] = useState<SelectionDescription | null>(null);
  const [busy, setBusy] = useState<BusyState>('Initializing Aetheris Worker');
  const [workerFailed, setWorkerFailed] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const sourceRevisionRef = useRef(0);
  const [displayRevision, setDisplayRevision] = useState<number | null>(null);
  const [buildStarted, setBuildStarted] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const latestSubmission = useRef(0);
  const [theme, setTheme] = useTheme();
  const [displayMode, setDisplayMode] = useState<DisplayMode>('shaded');
  const [selectionMode, setSelectionMode] = useState<'face' | 'edge'>('face');
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');
  const [viewCommand, setViewCommand] = useState('iso-0'); // Parts open in an isometric view; fit follows each new model.
  const [runtimeName, setRuntimeName] = useState('WASM');
  const [lastTiming, setLastTiming] = useState<{ label: string; milliseconds: number } | null>(null);
  const [phaseTiming, setPhaseTiming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectDocuments = useRef<Record<string,string>>(initialWorkspace?.documents ?? {});
  const projectRoot = useRef<string | null>(initialWorkspace?.root ?? null);
  const savedSources = useRef<Record<string,string>>({ ...initialWorkspace?.documents, [initialName]: initialSource });
  const [projectFileNames, setProjectFileNames] = useState<string[]>(Object.keys(initialWorkspace?.documents ?? {}));
  runtime.setProjectContext?.(projectRoot.current, projectDocuments.current);
  // The crash screen reads the latest source through this registry, after the editor has unmounted.
  const recoveryState = useRef({ source, sourceName }); recoveryState.current = { source, sourceName };
  useEffect(() => registerRecoverableSource(() => ({
    root: projectRoot.current ?? recoveryState.current.sourceName,
    documents: { ...projectDocuments.current, [recoveryState.current.sourceName]: recoveryState.current.source },
  })), []);
  const sourcePanel = useRef<SourcePanelHandle>(null);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const [pendingAuthoring, setPendingAuthoring] = useState<PendingAuthoring | null>(chooseBase ? { action: { kind: 'base' }, node: null, revision: 0 } : null);
  const [previewModel, setPreviewModel] = useState<ModelSession | null>(null);
  const wireframePreview = previewModel && pendingAuthoring?.action.kind === 'feature'
    && ['fillet', 'chamfer'].includes(pendingAuthoring.action.item.id) ? previewModel : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishState, setPublishState] = useState('');
  const [utilityTab, setUtilityTab] = useState<UtilityTab>({ kind: 'inspector' });
  const [outline, setOutline] = useState<LanguageOutline | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [graphSelection, setGraphSelection] = useState<GraphSelection | null>(null);
  // A graph edit is a transaction: it is committed when its build succeeds, and while it
  // fails it stays a draft over the last good model that can be reverted in one step.
  const [graphEdit, setGraphEdit] = useState<(GraphEditState & { revision: number; base: string }) | null>(null);
  const partGraph = useMemo(() => outline ? buildPartGraph(outline) : null, [outline]);
  const capturePreview = useRef<(() => string) | null>(null);
  const shownDiagnostics = [...liveDiagnostics, ...diagnostics.filter(item => !liveDiagnostics.some(live =>
    live.code === item.code && live.source?.start === item.source?.start))];
  // The displayed model is older than a source that failed to build: show it as a ghost.
  const ghosted = !!model && displayRevision !== sourceRevision && buildStarted === null && diagnostics.some(item => item.severity === 'error');
  const pushOutput = (message: string) => {
    setOutputEvents(events => [...events.slice(-79), message]);
    // A refusal is something the person must read: show the Output dock rather than log it unseen.
    if (/\brefused\b/i.test(message)) shellLayout.setBottomOpen(true);
  };
  const namedView = (view: 'front' | 'top' | 'right' | 'iso') => {
    setViewMode(view === 'iso' ? 'perspective' : 'orthographic');
    setViewCommand(`${view}-${Date.now()}`);
  };

  const editSource = (value: string, name = sourceName) => {
    sourceRevisionRef.current++;
    setSourceRevision(sourceRevisionRef.current);
    setSource(value);
    setSourceName(name);
    if (projectRoot.current) projectDocuments.current = { ...projectDocuments.current, [name]: value };
    setSaveState('Unsaved');
    setDirtyFiles(files => { const next = new Set(files); if (value === savedSources.current[name]) next.delete(name); else next.add(name); return next; });
    setDiagnostics([]);
    setLiveDiagnostics([]);
  };
  useEffect(() => { if (pendingAuthoring && pendingAuthoring.revision !== sourceRevision) setPendingAuthoring(null); }, [sourceRevision, pendingAuthoring]);
  function beginAuthoring(action: AuthoringAction, mate?: PendingAuthoring['mate']) {
    if (busy || buildStarted !== null) { pushOutput('Wait for the current operation to finish.'); return; }
    if (outline?.document !== sourceName || outline.revision !== String(sourceRevisionRef.current)) { pushOutput('Updating graph controls; try again when they are ready.'); return; }
    setEditorMode('graph'); setSideTab('selection');
    setPendingAuthoring({ action, node: inspectedId, revision: sourceRevisionRef.current, mate });
  }
  const runHistory = async (direction: 'undo' | 'redo') => {
    if (busy || buildStarted !== null || pendingAuthoring) return;
    try { await sourcePanel.current?.history(direction); }
    catch (error) { pushOutput(`History refused · ${error instanceof Error ? error.message : String(error)}`); }
  };

  const acceptBuild = (result: BuildResult) => {
    if (result.status === 'superseded' || result.request.sourceRevision !== sourceRevisionRef.current) return;
    setDiagnostics(result.diagnostics);
    setWorkerFailed(result.diagnostics.some(item => item.code === 'HELIOS-WORKER'));
    pushOutput(result.status === 'completed' ? `Build finished in ${result.milliseconds.toFixed(0)} ms · ${result.diagnostics.length} diagnostics` :
      `Build failed · ${result.diagnostics.length} diagnostics`);
    if (result.status === 'completed' && result.model) {
      const snapshot = snapshotSession(result.model);
      setModel(snapshot);
      setDisplayRevision(result.request.sourceRevision);
      setSelectedEntityId(null);
      setSelectedFaceId(null); setSelectedSelection(null);
      setViewCommand(`${snapshot?.mesh.cameras?.length ? 'authored' : 'fit'}-${Date.now()}`);
      setLastTiming({ label: 'Built in', milliseconds: result.milliseconds });
      if (snapshot?.timings) setPhaseTiming(`COMPILE ${snapshot.timings.compileMilliseconds.toFixed(0)}MS · MESH ${(snapshot.timings.meshMilliseconds ?? 0).toFixed(0)}MS · TRANSFER ${(snapshot.workerTiming?.transportMilliseconds ?? 0).toFixed(0)}MS · ${(snapshot.workerTiming?.payloadBytes ?? 0)}B`);
      setBusy(null);
    } else {
      setBusy(null);
    }
    setBuildStarted(null);
  };

  const submitBuild = async (value: string, name: string, revision = sourceRevisionRef.current) => {
    const submission = ++latestSubmission.current;
    setBusy(runtime.info ? 'Building' : 'Initializing Aetheris Worker');
    setElapsedSeconds(0);
    setBuildStarted(performance.now());
    pushOutput(`Build started · ${name} · revision ${revision}`);
    const root = projectRoot.current ?? name;
    const rootSource = root === name ? value : projectDocuments.current[root];
    try {
      await runtime.initialize();
      if (submission === latestSubmission.current) setBusy('Building');
    } catch (error) {
      setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER')]);
      setWorkerFailed(true); setBusy(null); setBuildStarted(null);
      pushOutput(`Runtime initialization failed · ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const result = await buildClient.submit(rootSource, root, revision, projectDocuments.current);
    if (runtime.info) setRuntimeName(`WASM Worker · ${runtime.info.packageVersion}`);
    if (submission === latestSubmission.current) acceptBuild(result);
    if (submission === latestSubmission.current && result.request.sourceRevision !== sourceRevisionRef.current) {
      setBusy(null);
      setBuildStarted(null);
    }
    return result.status === 'completed' && result.request.sourceRevision === sourceRevisionRef.current;
  };

  const open = useCallback(async (nextSource: string, nextName: string) => {
    if (nextSource !== source || nextName !== sourceName) editSource(nextSource, nextName);
    setSaveState(project ? 'Unsaved' : 'Saved');
    setDirtyFiles(project ? new Set([nextName]) : new Set());
    if (!project) savedSources.current = { ...projectDocuments.current, [nextName]: nextSource };
    await submitBuild(nextSource, nextName, sourceRevisionRef.current);
  }, [source, sourceName]);

  useEffect(() => {
    let current = true;
    void runtime.restart().then(async () => {
      if (!current) return;
      await submitBuild(source, sourceName, sourceRevisionRef.current);
      const schema = await runtime.schema(); if (current) setSemanticSchema(schema);
    }).catch(error => { if (current) { setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER')]); setBusy(null); } });
    return () => { current = false; void runtime.dispose(); };
  }, []);
  useEffect(() => { if (buildStarted === null) return; const timer = setInterval(() => setElapsedSeconds((performance.now() - buildStarted) / 1000), 250); return () => clearInterval(timer); }, [buildStarted]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (onSave) void save(); else downloadSource(); }
      if (((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') || event.key === 'F1') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) setViewCommand(`fit-${Date.now()}`);
      if ((event.ctrlKey || event.metaKey) && !isTyping(event.target) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); void runHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [source, sourceName, onSave, busy, buildStarted, pendingAuthoring]);

  const save = async () => {
    if (!onSave) return;
    if (Object.keys(projectDocuments.current).length > 1 || projectRoot.current && projectRoot.current !== sourceName) {
      setSaveState('Cloud save requires a single root document. Use local project checkpoints for this workspace.');
      pushOutput('Cloud save refused: the current server save contract cannot persist all module files. Local checkpoints preserve the project.');
      return;
    }
    const revision = sourceRevisionRef.current;
    setSaveState('Saving…');
    try {
      await onSave(source); savedSources.current[sourceName] = source;
      if (revision === sourceRevisionRef.current) { setSaveState('Saved'); setDirtyFiles(new Set()); }
      else setSaveState('Unsaved');
    }
    catch (error) { setSaveState(error instanceof Error ? error.message : 'Save failed'); }
  };

  const downloadSource = () => {
    if (Object.keys(projectDocuments.current).length > 1) {
      const documents = { ...projectDocuments.current, [sourceName]: source };
      downloadBlob(new Blob([Uint8Array.from(packProject({ root: projectRoot.current ?? sourceName, documents })).buffer], { type: 'application/zip' }), `${stripExtension(projectRoot.current ?? sourceName)}.helios.zip`);
      savedSources.current = { ...documents }; setDirtyFiles(new Set()); setSaveState('Saved');
      pushOutput('Workspace download started · includes immutable STEP assets and annotation source'); return;
    }
    downloadText(source, sourceName);
    savedSources.current[sourceName] = source;
    setDirtyFiles(files => { const next = new Set(files); next.delete(sourceName); return next; });
    pushOutput(`Source download started · ${sourceName}`);
  };

  const select = (entityId: string | null, faceId: string | null = null, selection: SelectionDescription | null = null) => { setSelectedEntityId(entityId); setSelectedFaceId(faceId); setSelectedSelection(selection); };
  useEffect(() => {
    let current = true;
    setFieldProjection(null);
    if (model && selectedEntityId) void runtime.describeConstruct(selectedEntityId)
      .then(result => { if (current) setFieldProjection(result); })
      .catch(() => { if (current) setFieldProjection(null); });
    return () => { current = false; };
  }, [model, selectedEntityId]);
  // The graph view reads the compiler's declaration outline of the open document.
  useEffect(() => {
    if (editorMode !== 'graph') return;
    let current = true;
    const timer = setTimeout(() => {
      void runtime.outline(source, sourceName, String(sourceRevision))
        .then(result => { if (current) { setOutline(result); setOutlineError(null); } })
        .catch(error => { if (current) setOutlineError(error instanceof Error ? error.message : String(error)); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [editorMode, source, sourceName, sourceRevision]);
  // Reopen the draft over an existing Profile. Asked fresh: the graph outline is only kept in graph mode.
  // Opens over the document's Profiles (any part, not only drafts made here), or a new draft without one.
  const openIntelliDraft = async (node: string | null = null) => {
    if (busy || buildStarted !== null) return;
    setPendingAuthoring(null);
    const revision = sourceRevision, text = source;
    const nodes = await runtime.outline(text, sourceName, String(revision)).then(o => o.nodes).catch(() => outline?.nodes ?? []);
    setIntelliDraft({ revision, source: nodes.some(n => n.kind === 'Profile') ? text : undefined, node });
  };
  openIntelliDraftRef.current = node => void openIntelliDraft(node ?? null);
  const newIntelliDraft = () => { if (!busy && buildStarted === null) { setPendingAuthoring(null); setIntelliDraft({ revision: sourceRevision }); } };
  // A part made or reshaped in IntelliDraft is framed once its new geometry arrives.
  const fitOnNextModel = useRef(false);
  useEffect(() => { if (fitOnNextModel.current && model) { fitOnNextModel.current = false; setViewCommand(`fit-${Date.now()}`); } }, [model?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  // The bottom dock stays a status strip until a build reports an error; then it opens on its own once.
  const errorCount = shownDiagnostics.filter(item => item.severity === 'error').length;
  const openedForErrors = useRef(0);
  useEffect(() => {
    if (errorCount > openedForErrors.current && !shellLayout.bottomOpen) shellLayout.setBottomOpen(true);
    openedForErrors.current = errorCount;
  }, [errorCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('helios-editor-mode', editorMode); } catch { /* per-viewer convenience only */ } }, [editorMode]);
  // Geometry or tree selection highlights the unit, and row, that declares it. A selection the
  // graph itself made is not echoed back: the entity found for a container is often a child.
  const graphPickedEntity = useRef<string | null>(null);
  useEffect(() => {
    if (selectedEntityId && graphPickedEntity.current === selectedEntityId) return;
    graphPickedEntity.current = null;
    const graph = partGraph;
    const entity = selectedEntityId ? model?.entity(selectedEntityId) : undefined;
    if (!graph || !entity?.source || entity.source.source !== sourceName) return;
    const unitId = unitAtSpan(graph, entity.source.start, entity.source.length);
    if (!unitId) return;
    const node = nodeAtSpan(graph, entity.source.start, entity.source.length);
    const rowId = node && node.id !== unitId && node.parentId === unitId ? node.id : null;
    setGraphSelection(value => value?.unitId === unitId && value.rowId === rowId ? value : { unitId, rowId });
  }, [selectedEntityId, model, partGraph, sourceName]);
  const entityForSpan = (start: number, length: number) => {
    const end = start + length;
    const inside = (model?.tree.nodes ?? []).filter(node => node.source?.source === sourceName && node.source.start >= start && node.source.start + node.source.length <= end);
    if (inside.length) return inside.sort((a, b) => (b.source?.length ?? 0) - (a.source?.length ?? 0))[0];
    return (model?.tree.nodes ?? []).filter(node => node.source?.source === sourceName && node.source.start <= start && end <= node.source.start + node.source.length)
      .sort((a, b) => (a.source?.length ?? Infinity) - (b.source?.length ?? Infinity))[0];
  };
  const selectFromGraph = useCallback((unitId: string, row: GraphRow | null, graph: PartGraph) => {
    setGraphSelection({ unitId, rowId: row?.id ?? null });
    const unit = graph.units.find(item => item.id === unitId);
    if (unit?.category === 'external') return;
    const span = row?.span ?? unit?.span;
    const entity = span ? entityForSpan(span.start, span.length) : undefined;
    graphPickedEntity.current = entity?.id ?? null;
    if (entity) select(entity.id);
  }, [model, sourceName]);
  const openFromGraph = useCallback((unitId: string, row: GraphRow | null, graph: PartGraph) => {
    const unit = graph.units.find(item => item.id === unitId);
    if (unit?.category === 'external') { if (unit.document in projectDocuments.current) switchFile(unit.document); return; }
    const node = graph.nodes.get(row?.id ?? unitId);
    if (node && ['Profile', 'Rect2', 'Circle2', 'Slot2', 'RoundedRect2'].includes(node.kind)) {
      openIntelliDraftRef.current(node.id); return;
    }
    const span = row?.span ?? unit?.span;
    if (!span) return;
    setEditorMode('source');
    navigateSource({ source: sourceName, start: span.start, length: span.length, line: 1, column: 1 });
  }, [sourceName]);
  const selectGraphNode = (id: string) => {
    const unitId = partGraph?.unitOf.get(id);
    if (!unitId || !partGraph) return;
    setGraphSelection({ unitId, rowId: id === unitId ? null : id });
    const node = partGraph.nodes.get(id);
    const part = assemblyGraph?.parts.find(p => p.id === id);
    const occurrence = part && model?.mesh.occurrences.find(o => o.path === (part.kind === 'ground' ? assemblyGraph!.root.name : `${assemblyGraph!.root.name}.${part.name}`));
    const entity = occurrence ? model?.entity(occurrence.semanticEntityId) : node ? entityForSpan(node.span.start, node.span.length) : undefined;
    graphPickedEntity.current = entity?.id ?? null;
    if (entity) select(entity.id);
  };
  // Every graph edit, value or structural, is one transaction: apply the replacement (Monaco keeps
  // it in undo history), build at once, commit when it builds, otherwise keep a revertible draft.
  const applyGraphChange = (change: { start: number; length: number; before: string; replacement: string; next: string },
    meta: { nodeId: string; field: string | null; label: string; warnings?: readonly string[] }) => {
    const chained = graphEdit && graphEdit.status === 'failed' && graphEdit.revision === sourceRevisionRef.current;
    const base = chained ? graphEdit.base : source;
    const before = sourceRevisionRef.current;
    // A read-only editor (mid-build) refuses the replacement; then the source is set directly.
    if (!sourcePanel.current?.replace({ source: sourceName, start: change.start, length: change.length, line: 1, column: 1 }, change.before, change.replacement)
        || sourceRevisionRef.current === before) editSource(change.next);
    const revision = sourceRevisionRef.current;
    setGraphEdit({ ...meta, warnings: meta.warnings ?? [], status: 'building', revision, base });
    pushOutput(meta.label);
    for (const warning of meta.warnings ?? []) pushOutput(`Warning · ${warning}`);
    void submitBuild(change.next, sourceName, revision).then(ok => {
      if (sourceRevisionRef.current !== revision) return;
      setGraphEdit(value => value && value.revision === revision ? { ...value, status: ok ? 'built' : 'failed' } : value);
      pushOutput(ok ? 'Committed · the model is updated' : 'Draft · the build failed, the last good model stays');
    });
  };
  const commitGraphField = (node: OutlineNode, field: OutlineField, text: string): string | null => {
    if (busy === 'Exporting' || busy === 'Worker failed') return 'Wait for the current operation to finish.';
    const splice = spliceField(source, field, text);
    if ('error' in splice) return splice.error;
    applyGraphChange({ start: splice.start, length: splice.length, before: splice.before, replacement: splice.after, next: splice.source },
      { nodeId: node.id, field: field.name, label: `${node.name ? `${node.name}.` : ''}${field.name}: ${splice.before} → ${splice.after}` });
    return null;
  };
  // Selection that waits for the outline of the edited source (a renamed or new declaration).
  const pendingGraphSelection = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingGraphSelection.current;
    if (!id || !partGraph || outline?.revision !== String(sourceRevision)) return;
    const unitId = partGraph.unitOf.get(id);
    if (!unitId) return;
    pendingGraphSelection.current = null;
    setGraphSelection({ unitId, rowId: id === unitId ? null : id });
  }, [partGraph, sourceRevision, outline]);
  const structuralEdit = async (operations: readonly LanguageEditOperation[], meta: { nodeId: string; label: string; select?: string | null }): Promise<string | null> => {
    if (busy === 'Exporting' || busy === 'Worker failed') return 'Wait for the current operation to finish.';
    const original = source, revision = sourceRevisionRef.current;
    let result;
    try { result = await runtime.edit(original, operations, sourceName, String(revision)); }
    catch (error) { return error instanceof Error ? error.message : String(error); }
    if (sourceRevisionRef.current !== revision) return 'The source changed while the edit was prepared. Try again.';
    if (!result.changed) return null;
    const { start, length, replacement } = result.edit;
    const target = meta.select === undefined ? result.nodes.at(-1) ?? meta.nodeId : meta.select;
    if (target) pendingGraphSelection.current = target;
    applyGraphChange({ start, length, before: original.slice(start, start + length), replacement, next: result.text },
      { nodeId: result.nodes.at(-1) ?? meta.nodeId, field: null, label: meta.label, warnings: result.warnings });
    return null;
  };
  const siblingsOf = (node: OutlineNode) => (outline?.nodes ?? []).filter(item => item.parentId === node.parentId).sort((a, b) => a.order - b.order);
  const graphActions = {
    onApplyFields: (node: OutlineNode, values: readonly { field: string; value: string }[]) =>
      structuralEdit(values.map(value => ({ kind: 'setField' as const, node: node.id, ...value })),
        { nodeId: node.id, label: `Updated ${node.name ?? node.kind}: ${values.map(v => v.field).join(', ')}`, select: node.id }),
    onAddField: (node: OutlineNode, field: string, value: string) =>
      structuralEdit([{ kind: 'setField', node: node.id, field, value }], { nodeId: node.id, label: `Added ${field}: ${value} to ${node.name ?? node.kind}` }),
    onRemoveField: (node: OutlineNode, field: OutlineField) =>
      structuralEdit([{ kind: 'removeField', node: node.id, field: field.name }], { nodeId: node.id, label: `Removed ${field.name} from ${node.name ?? node.kind}` }),
    onRename: (node: OutlineNode, name: string) =>
      structuralEdit([{ kind: 'renameDeclaration', node: node.id, name }], { nodeId: node.id, label: `Renamed ${node.name} to ${name}` }),
    onDelete: (node: OutlineNode) =>
      structuralEdit([{ kind: 'removeDeclaration', node: node.id }], { nodeId: node.parentId ?? node.id, label: `Deleted ${node.name ?? node.kind}`, select: node.parentId }),
    onMove: (node: OutlineNode, direction: -1 | 1) => {
      const siblings = siblingsOf(node);
      const index = siblings.findIndex(item => item.id === node.id);
      const operation: LanguageEditOperation = direction < 0
        ? (index <= 1 ? { kind: 'moveDeclaration', node: node.id, first: true } : { kind: 'moveDeclaration', node: node.id, after: siblings[index - 2].id })
        : { kind: 'moveDeclaration', node: node.id, after: siblings[index + 1].id };
      return structuralEdit([operation], { nodeId: node.id, label: `Moved ${node.name ?? node.kind} ${direction < 0 ? 'up' : 'down'}` });
    },
    // A dimension becomes a named parameter declared at the top of its part; the field then uses the name.
    onPromote: async (node: OutlineNode, field: OutlineField, axis: number | null, name: string) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `${name || 'That'} is not a name: use letters, digits and _, starting with a letter.`;
      if (outline?.nodes.some(item => item.name === name)) return `${name} is already used in this file.`;
      const editor = editorFor(field);
      const value = axis === null ? field.text : editor.kind === 'vector' && editor.parts[axis]?.kind === 'quantity' ? formatQuantity((editor.parts[axis] as { value: Quantity }).value) : null;
      const declaration = value ? parameterSource(name, value) : null;
      if (!value || !declaration) return 'Only a number with a unit can become a parameter.';
      const next = axis === null || editor.kind !== 'vector' ? name : vectorText(editor.parts.map((part, i) => i === axis ? { kind: 'name' as const, name } : part), editor.pointType);
      const parent = bodyParent(outline, node.id);
      if (!parent) return 'There is no Model to hold the parameter.';
      return structuralEdit([{ kind: 'insertDeclaration', parent, first: true, source: declaration }, { kind: 'setField', node: node.id, field: field.name, value: next }],
        { nodeId: node.id, label: `${node.name ?? node.kind}.${field.name}${axis === null ? '' : ` ${'XYZW'[axis]}`} is now the parameter ${name} = ${value}`, select: node.id });
    },
    onExtract: (node: OutlineNode, name: string, parameters: readonly string[]) =>
      structuralEdit([{ kind: 'extractFeature', node: node.id, name, parameters }], { nodeId: node.id, label: `${node.name ?? node.kind} is now the reusable Feature ${name}` }),
  };
  const parameterActions = {
    onAdd: (name: string, value: string) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return Promise.resolve(`${name} is not a name: use letters, digits and _, starting with a letter.`);
      if (outline?.nodes.some(item => item.name === name)) return Promise.resolve(`${name} is already used in this file.`);
      const parent = bodyParent(outline, inspectedId);
      if (!parent) return Promise.resolve('There is no Model to hold the parameter.');
      // A plain number with a unit gets its type; an expression (`Thickness * 2`) is declared untyped.
      const declaration = parameterSource(name, value) ?? `Static ${name} = ${value}`;
      return structuralEdit([{ kind: 'insertDeclaration', parent, first: true, source: declaration }], { nodeId: parent, label: `Added the parameter ${name} = ${value}`, select: null });
    },
  };
  // The document's own Features, placed like any palette feature with their defaults written out.
  const documentFeatures = (): PaletteItem[] => (outline?.nodes ?? []).filter(node => node.kind === 'Feature' && node.name && node.parentId === null).map(node => ({
    id: `feature:${node.id}`, label: node.name!, category: 'Your features', placement: 'feature' as const, nameStem: node.name!,
    description: (node.signature ?? []).map(p => `${p.name}: ${p.type}${p.default ? ` = ${p.default}` : ''}`).join(', ') || 'No parameters',
    source: `${node.name}(${(node.signature ?? []).map(p => `${p.name}: ${p.default ?? startingValue(p.type)}`).join(', ')})`,
  }));
  const [sideTab, setSideTab] = useState<'selection' | 'parameters'>('selection');
  useEffect(() => { if (graphSelection) setSideTab('selection'); }, [graphSelection]);
  // Field names the language service knows for the inspected declaration (completion inside its body).
  const [completion, setCompletion] = useState<{ nodeId: string; fields: readonly LanguageField[] } | null>(null);
  const inspectedId = graphSelection ? (graphSelection.rowId && partGraph?.nodes.has(graphSelection.rowId) ? graphSelection.rowId : graphSelection.unitId) : null;
  useEffect(() => {
    const node = outlineNode(outline, inspectedId);
    if (!node || editorMode !== 'graph') return;
    const from = node.nameSpan ? node.nameSpan.start + node.nameSpan.length : node.span.start;
    const open = source.indexOf('{', from);
    if (open < 0 || open >= node.span.start + node.span.length) { setCompletion({ nodeId: node.id, fields: [] }); return; }
    let current = true;
    void runtime.complete(source, open + 1, sourceName, String(sourceRevision))
      .then(result => { if (current) setCompletion({ nodeId: node.id, fields: result.fields }); })
      .catch(() => { if (current) setCompletion({ nodeId: node.id, fields: [] }); });
    return () => { current = false; };
  }, [inspectedId, outline, editorMode]);
  // The kernel's catalog of things to add; every item is proven to build.
  const [palette, setPalette] = useState<readonly PaletteItem[]>([]);
  useEffect(() => {
    if (editorMode !== 'graph' || palette.length) return;
    void runtime.palette().then(result => setPalette(result.items)).catch(() => { /* the canvas works without a palette */ });
  }, [editorMode]);
  // The Assembly view of the canvas: the chosen assembly's parts and joints.
  const [pickedAssembly, setPickedAssembly] = useState<string | null>(null);
  // A sampled Motion pose shown in the viewport; null shows the model as built.
  const [pose, setPose] = useState<MotionPose | null>(null);
  const assemblies = useMemo(() => assembliesOf(outline), [outline]);
  const assemblyGraph = useMemo(() => outline && assemblies.length ? buildAssemblyGraph(outline, pickedAssembly) : null, [outline, assemblies, pickedAssembly]);
  const jointKinds = useMemo(() => {
    // Mechanical joints only: the schema's Interface kinds whose context is an Assembly (Stitch belongs to Garments).
    const kinds = (semanticSchema?.constructs ?? []).filter(c => c.context?.includes('Assembly')).map(c => /^Interface<(\w+)>$/.exec(c.name)?.[1]).filter((k): k is string => !!k);
    return kinds.length ? [...new Set(kinds)] : ['Fixed', 'Revolute', 'Prismatic'];
  }, [semanticSchema]);
  const assemblyView = (): AssemblyView | null => !assemblyGraph ? null : {
    assemblies, graph: assemblyGraph, selectedAssembly: assemblyGraph.assembly.id, selectedId: inspectedId,
    authoring: busy || buildStarted !== null || pendingAuthoring ? null : {
      kinds: jointKinds,
      onCreateMate: () => beginAuthoring({ kind: 'mate' }),
      onJoin: (kind: string, a: AssemblyEnd, b: AssemblyEnd) => {
        beginAuthoring({ kind: 'mate' }, { kind, a, b });
      },
    },
    onPickAssembly: setPickedAssembly,
    onSelect: id => selectGraphNode(id),
    onOpenSource: id => { const node = outline?.nodes.find(n => n.id === id); if (node) { setEditorMode('source'); navigateSource({ source: sourceName, start: node.span.start, length: node.span.length, line: 1, column: 1 }); } },
  };
  const graphAuthoring = () => {
    if (busy || buildStarted !== null || pendingAuthoring || !outline || outline.document !== sourceName || outline.revision !== String(sourceRevision)) return null;
    const target = featureTarget(outline, inspectedId);
    return {
      actions: constructionActions(),
      palette: [...documentFeatures(), ...palette],
      featureTarget: 'body' in target ? { body: target.body.name ?? target.body.id } : target,
      unavailable: (item: PaletteItem) => item.requiresEmptyModel ? null : paletteUnavailable(item, outline, inspectedId),
      onInsert: (item: PaletteItem) => {
        if (item.placement === 'feature') { beginAuthoring({ kind: 'feature', item }); return; }
        if (item.requiresEmptyModel) { beginAuthoring({ kind: 'base', baseId: item.id }); return; }
        const operation = paletteOperation(item, outline, inspectedId);
        if ('reason' in operation) { pushOutput(operation.reason); return; }
        const where = operation.kind === 'insertFeature' && 'body' in target ? ` on ${target.body.name}` : '';
        void structuralEdit([operation], { nodeId: inspectedId ?? '', label: `Added ${item.label} ${'name' in operation ? operation.name ?? '' : ''}${where}` })
          .then(refused => { if (refused) pushOutput(`Add refused · ${refused}`); });
      },
      onWire: (provider: string, consumer: OutlineNode, choice: import('../graph/graphAuthoring').WireChoice) => {
        const operation = wireOperation(provider, consumer, choice);
        if ('reason' in operation) { pushOutput(operation.reason); return; }
        const label = choice.kind === 'retarget' ? `${consumer.name ?? consumer.kind} now modifies ${provider}` : `${consumer.name ?? consumer.kind}.${choice.field.name}: ${choice.field.text} → ${provider}`;
        void structuralEdit([operation], { nodeId: consumer.id, label, select: choice.kind === 'retarget' ? undefined : consumer.id })
          .then(refused => { if (refused) pushOutput(`Connection refused · ${refused}`); });
      },
      onReorder: (operation: LanguageEditOperation, label: string) => {
        void structuralEdit([operation], { nodeId: 'node' in operation ? operation.node ?? '' : '', label })
          .then(refused => { if (refused) pushOutput(`Move refused · ${refused}`); });
      },
    };
  };
  function constructionActions(): import('../graph/GraphPanel').GraphAction[] {
    return [
      { id: 'base', label: 'Replace base…', description: 'Choose a different base and preview existing features.', run: () => beginAuthoring({ kind: 'base' }) },
      { id: 'pocket', label: 'Pocket…', description: 'Cut a finite recess from a circle, rectangle or authored Profile.', run: () => beginAuthoring({ kind: 'pocket' }) },
      { id: 'pattern-editor', label: 'Patterns…', description: 'Edit keyed layouts, equation laws and mapped recipes.', run: () => beginAuthoring({ kind: 'patternEditor' }) },
      { id: 'pattern', label: 'Grid seed hole…', description: 'Repeat a seed hole in a keyed rectangular grid.', run: () => beginAuthoring({ kind: 'pattern' }),
        reason: outline?.nodes.some(n => n.kind === 'Hole') ? undefined : 'Add a hole first.' },
      { id: 'extrude', label: 'Extrude…', description: 'Turn a Profile into a body, or edit its extrusion.', run: () => beginAuthoring({ kind: 'extrude' }),
        reason: outline?.nodes.some(n => n.kind === 'Profile') ? undefined : 'Start a sketch-based part first.' },
      { id: 'sketch', label: 'New IntelliDraft part…', description: 'Draw a 2D profile, trace it and extrude it.', run: newIntelliDraft },
      { id: 'placement', label: 'Place component…', description: 'Edit translation and rotation relative to the parent.', run: () => beginAuthoring({ kind: 'placement' }), reason: assemblyGraph ? undefined : 'Open an assembly first.' },
      { id: 'mate', label: 'Edit mate…', description: 'Edit frame endpoints while retaining the mate name, contract and options.', run: () => {
        const joint = assemblyGraph?.joints.find(j => j.id === inspectedId);
        if (joint?.a && joint.b) beginAuthoring({ kind: 'mate' }, { kind: joint.kind, a: joint.a, b: joint.b, existing: joint.id });
      }, reason: assemblyGraph?.joints.some(j => j.id === inspectedId) ? undefined : 'Select a mate first.' },
    ];
  }
  const contextActions = () => {
    const node = outlineNode(outline, inspectedId);
    const target = featureTarget(outline, inspectedId);
    const ids = node?.occurrence && ['Part', 'Assembly', 'Subassembly'].includes(node.kind) ? ['placement']
      : node?.kind === 'Mate' || node?.kind === 'Interface' && node.parentId ? ['mate']
      : node && ['Pattern', 'Points', 'Series', 'Linear', 'Stations', 'Function'].includes(node.kind) ? ['pattern-editor']
      : node?.kind === 'Profile' ? ['extrude', 'pocket'] : node?.kind === 'Hole' ? ['pattern']
      : node && ['Box', 'Cylinder', 'Extrude', 'Compose'].includes(node.kind) ? ['base', 'pocket'] : [];
    const updating = outline?.document !== sourceName || outline.revision !== String(sourceRevision);
    return <div className="node-construction-actions">{updating && <small role="status">Updating graph controls…</small>}{'body' in target && <div className="node-feature-actions" aria-label={`Features on ${target.body.name}`}>
      <small>On {target.body.name}</small>
      {palette.filter(item => ['hole', 'hole-blind', 'counterbore', 'countersink', 'chamfer', 'fillet'].includes(item.id)).map(item =>
        <button key={item.id} disabled={!!busy || buildStarted !== null || updating} title={item.description} onClick={() => beginAuthoring({ kind: 'feature', item })}>
          {item.id === 'hole' ? 'Add hole…' : item.id === 'chamfer' ? 'Chamfer…' : item.id === 'fillet' ? 'Fillet…' : `${item.label}…`}</button>)}
    </div>}{constructionActions().filter(a => ids.includes(a.id)).map(a =>
      <button key={a.id} disabled={!!a.reason || !!busy || buildStarted !== null || updating} title={a.reason ?? a.description} onClick={a.run}>{a.label}</button>)}</div>;
  };
  const revertGraphEdit = () => {
    if (!graphEdit) return;
    const base = graphEdit.base;
    setGraphEdit(null);
    const before = sourceRevisionRef.current;
    if (!sourcePanel.current?.replace({ source: sourceName, start: 0, length: source.length, line: 1, column: 1 }, source, base)
        || before === sourceRevisionRef.current) editSource(base);
    pushOutput('Reverted the draft');
    // A failed setSource also changed the live SDK session. Restore that authority,
    // not just the displayed snapshot, before permitting exports or the next edit.
    void submitBuild(base, sourceName, sourceRevisionRef.current);
  };
  const inspectorProps = () => {
    const unit = graphSelection && partGraph?.units.find(item => item.id === graphSelection.unitId);
    const rowId = graphSelection?.rowId ?? null;
    const nodeId = rowId && partGraph?.nodes.has(rowId) ? rowId : graphSelection?.unitId;
    const node = unit && unit.category !== 'external' ? outlineNode(outline, nodeId) : null;
    const focusField = rowId && unit && !partGraph?.nodes.has(rowId) && rowId.startsWith(`${unit.id}#`) ? rowId.slice(unit.id.length + 1) : null;
    const problems = node ? shownDiagnostics.filter(item => item.source?.source === sourceName
      && item.source.start >= node.span.start && item.source.start <= node.span.start + node.span.length) : [];
    const edit = graphEdit && graphEdit.revision === sourceRevision ? graphEdit : null;
    return {
      node, revision: sourceRevision, nodes: partGraph?.nodes ?? new Map<string, OutlineNode>(), focusField, problems, buildProblems: shownDiagnostics, edit,
      completion: completion && node && completion.nodeId === node.id ? completion.fields : [],
      external: unit?.category === 'external' ? { title: unit.title, document: unit.document } : null,
      schema: semanticSchema?.constructs.find(item => item.id === node?.schemaId) ?? null,
      readOnly: busy === 'Worker failed' ? 'The build worker stopped. Restart it from the status bar to edit.'
        : busy || buildStarted !== null ? 'Building…'
        : outline?.document !== sourceName || outline.revision !== String(sourceRevision) ? 'Updating graph controls…' : null,
    };
  };
  const rebuildSource = async () => {
    if (buildStarted !== null || busy === 'Exporting' || busy === 'Rewriting source') return;
    await submitBuild(source, sourceName);
  };
  const applyProperty = async (property: EditableProperty, value: UnitValue) => {
    if (busy || source !== model?.source) { setDiagnostics([toDiagnostic(new Error('Rebuild the current source before applying an override.'), 'stale_revision')]); return false; }
    const started = performance.now();
    setBusy('Building');
    try {
      const result = await runtime.setProperty(property.id, value);
      setDiagnostics(result.diagnostics); setModel(snapshotSession(runtime.session()));
      if (result.success) select(runtime.session()?.tree.rootId ?? null);
      return result.success;
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-PROPERTY')]); if (isWorkerFailure(error)) setBusy('Worker failed'); return false; }
    finally { setLastTiming({ label: 'Rebuilt in', milliseconds: performance.now() - started }); setBusy(value => value === 'Building' ? null : value); }
  };
  const rewriteField = async (field: FieldProjection, number: number) => {
    if (!model || !fieldProjection || source !== model.source || fieldProjection.semanticId !== selectedEntityId) {
      setDiagnostics([toDiagnostic(new Error('Rebuild the current source before editing a projected field.'), 'stale_revision')]);
      return false;
    }
    const started = performance.now();
    setBusy('Rewriting source');
    try {
      const rewrite = await runtime.rewriteField(source, fieldProjection, field.fieldId,
        { valueKind: field.kind, text: '', number, unit: 'mm' });
      if (!sourcePanel.current?.replace(rewrite.replaced, field.authoredValue ?? '', rewrite.replacement))
        throw new Error('The Monaco document no longer matches the projected source. Rebuild before editing.');
      editSource(rewrite.source);
      const success = await submitBuild(rewrite.source, sourceName, sourceRevisionRef.current);
      if (success) select(selectedEntityId);
      setLastTiming({ label: 'Rebuilt in', milliseconds: performance.now() - started });
      return success;
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-FIELD-REWRITE')]); if (isWorkerFailure(error)) setBusy('Worker failed'); return false; }
    finally { setBusy(value => value === 'Rewriting source' ? null : value); }
  };
  const exportSelected = async (formats: readonly ExportFormat[]) => {
    if (busy || buildStarted !== null) return;
    const started = performance.now();
    const revision = sourceRevisionRef.current;
    if (displayRevision !== revision || buildStarted !== null) {
      if (!await submitBuild(source, sourceName, revision)) return;
    }
    if (revision !== sourceRevisionRef.current) return;
    setBusy('Exporting');
    pushOutput(`Export started · ${formats.join(', ')} · ${projectRoot.current ?? sourceName}`);
    try {
      const files = await runtime.exportArtifacts(formats);
      if (revision !== sourceRevisionRef.current) { pushOutput('Export discarded · source changed while preparing files.'); return; }
      for (const file of files) {
        downloadBlob(new Blob([Uint8Array.from(file.bytes).buffer], { type: file.mediaType }), file.fileName);
        pushOutput(`Download started · ${file.fileName} · ${file.bytes.length} bytes`);
      }
      setExportOpen(false);
      setLastTiming({ label: 'Export prepared in', milliseconds: performance.now() - started });
    }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-EXPORT')]); pushOutput(`Export failed · ${error instanceof Error ? error.message : String(error)}`); if (isWorkerFailure(error)) setBusy('Worker failed'); }
    finally { setBusy(value => value === 'Exporting' ? null : value); }
  };
  const newDocument = (value: string, name: string) => {
    projectRoot.current = null; projectDocuments.current = {}; setProjectFileNames([]);
    setWorkspaceTitle(stripExtension(name));
    void open(value, name);
  };
  const loadSample = (kind: 'part' | 'assembly' | 'new') => {
    const value = kind === 'assembly' ? assemblySource : kind === 'new' ? emptyModelSource : bracketSource;
    const name = kind === 'assembly' ? 'shared-block-assembly.firmament' : kind === 'new' ? 'untitled.firmament' : 'editable-bracket.firmament';
    newDocument(value, name);
  };
  const switchFile = (name: string) => {
    if (name === sourceName) { sourcePanel.current?.focusAt(); return; }
    setSource(projectDocuments.current[name]); setSourceName(name);
    setLiveDiagnostics([]);
  };
  const navigateSource = (reference: import('@aetheris/cad').SourceReference) => {
    if (reference.source !== sourceName && reference.source in projectDocuments.current) switchFile(reference.source);
    requestAnimationFrame(() => sourcePanel.current?.focusAt(reference));
  };
  const openExample = async (id: string) => {
    if (project) { location.assign(`/?example=${encodeURIComponent(id)}`); return; }
    if (openingExample || buildStarted !== null) return;
    setOpeningExample(id);
    try {
      const next = await loadShowcase(id);
      projectDocuments.current = next.documents; projectRoot.current = next.root;
      setProjectFileNames(Object.keys(next.documents)); setWorkspaceTitle(next.title);
      setExamplesOpen(false);
      setUtilityTab({ kind: 'files' });
      await open(next.documents[next.root], next.root);
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-EXAMPLE')]); }
    finally { setOpeningExample(null); }
  };
  const addHole = () => {
    try { const target = model?.tree.nodes.find(node => ['Box', 'Part'].includes(node.kind))?.name ?? 'Body'; editSource(appendCenteredHole(source, target)); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const addBox = () => {
    try { const cursor = sourcePanel.current?.cursor() ?? -1; const result = insertBox(source, cursor < 0 ? source.lastIndexOf('}') : cursor); editSource(result.source); requestAnimationFrame(() => sourcePanel.current?.focusAt({ source: sourceName, start: result.selection, length: 4, line: 1, column: 1 })); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const referenceFace = () => {
    try {
      if (!selectedSelection?.selector) return;
      const result = appendFaceDatum(source, selectedSelection.selector);
      editSource(result.source);
      requestAnimationFrame(() => sourcePanel.current?.focusAt({ source: sourceName, start: result.selection, length: selectedSelection.selector!.length, line: 1, column: 1 }));
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const referenceHoleWall = () => {
    try {
      if (selectedSelection?.outputRole !== 'HoleWallFace' || !selectedSelection.selector) return;
      const diameterMm = selectedEntityId ? model?.entity(selectedEntityId)?.holeDiameterMm : null;
      if (diameterMm == null) throw new Error('The selected Hole has no compiled shaft diameter.');
      const result = appendHoleWallDiameter(source, selectedSelection.selector, diameterMm);
      editSource(result.source);
      requestAnimationFrame(() => sourcePanel.current?.focusAt({ source: sourceName, start: result.selection, length: selectedSelection.selector!.length, line: 1, column: 1 }));
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const goToSource = () => { const entity = selectedEntityId ? model?.entity(selectedEntityId) : undefined; if (entity?.source) navigateSource(entity.source); };
  const onSourceCursor = (offset: number) => {
    const candidates = model?.tree.nodes.filter(node => node.source && node.source.source === sourceName && offset >= node.source.start && offset <= node.source.start + node.source.length) ?? [];
    const closest = candidates.sort((a, b) => (a.source?.length ?? Infinity) - (b.source?.length ?? Infinity))[0];
    if (closest && (closest.id !== selectedEntityId || selectedFaceId)) select(closest.id);
  };
  const paletteCommands: PaletteCommand[] = [
    { id: 'new-sketch', label: 'New IntelliDraft part', detail: 'Draw a profile, trace it and extrude it', run: newIntelliDraft },
    { id: 'edit-sketch', label: 'Edit profile in IntelliDraft', detail: "Edit this part's Profile dimensions and construction", run: () => void openIntelliDraft() },
    { id: 'insert-box', label: 'Insert Box', detail: 'Insert a 30 × 20 × 10 mm Box inside Model', run: addBox },
    ...(['Helix', 'Loft'] as const).flatMap(kind => {
      const entry = semanticSchema?.constructs.find(item => item.id === kind)?.entry;
      return entry ? [{ id: `new-${kind.toLowerCase()}`, label: `New ${kind} model`, detail: `Open the Aetheris ${kind} entry template`, run: () => newDocument(entry, `${kind.toLowerCase()}.firmament`) }] : [];
    }),
    { id: 'insert-hole', label: 'Insert Hole', detail: 'Append a centered through hole', run: addHole },
    { id: 'rebuild', label: 'Rebuild model', detail: 'Ctrl+Enter', run: () => void rebuildSource() },
    { id: 'format', label: 'Format document', detail: 'Aetheris canonical formatter', run: () => void sourcePanel.current?.formatDocument() },
    ...(model ? [{ id: 'export', label: 'Export model…', run: () => setExportOpen(true) }] : []),
    { id: 'save', label: 'Save', detail: onSave ? 'Save project source' : 'Download Firmament source', run: () => onSave ? void save() : downloadSource() },
    { id: 'open', label: 'Open file', run: () => fileInput.current?.click() },
    { id: 'new', label: 'New Firmament file', detail: 'Start a new single-file model', run: () => loadSample('new') },
    { id: 'assembly', label: 'Open assembly example', run: () => loadSample('assembly') },
    { id: 'source', label: 'Go to source', run: goToSource },
    ...(['front', 'top', 'right', 'iso', 'fit', 'fitselection'] as const).map(view => ({ id: view, label: `${view === 'iso' ? 'Isometric' : view === 'fitselection' ? 'Fit selection' : view[0].toUpperCase() + view.slice(1)} view`, run: () => view === 'fit' || view === 'fitselection' ? setViewCommand(`${view}-${Date.now()}`) : namedView(view) }))
  ];

  return <div className={`helios-app${project ? ' cloud-mode' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => project ? location.assign('/') : onShowcase ? onShowcase() : setExamplesOpen(true)} aria-label="Helios home"><span className="helios-symbol">H</span><div><strong>HELIOS</strong><small>by Aetheris</small></div></button>
      <div className="workspace-identity"><strong title={partName}>{partName}</strong><small>{sourceName} · {project ? 'Saved project' : 'Local workspace'}</small></div>
      <nav className="workspace-tabs" aria-label="Workspace"><button aria-label="Undo" title="Undo · Ctrl+Z" disabled={!historyState.undo || !!busy || !!pendingAuthoring} onClick={() => void runHistory('undo')}>↶</button><button aria-label="Redo" title="Redo · Ctrl+Shift+Z" disabled={!historyState.redo || !!busy || !!pendingAuthoring} onClick={() => void runHistory('redo')}>↷</button><button onClick={() => setExamplesOpen(true)}>Examples</button><button onClick={() => fileInput.current?.click()}>Open file</button><button onClick={() => fileInput.current?.click()} title="Import a supported canonical STEP part as immutable geometry">Import STEP</button><button title="Download source, or a portable workspace with all imported assets · Ctrl+S" onClick={() => onSave ? void save() : downloadSource()}>{!onSave && Object.keys(projectDocuments.current).length > 1 ? 'Save workspace' : 'Save source'}</button><button className="build-action" disabled={buildStarted !== null || !!busy || !!pendingAuthoring} title="Build project · Ctrl+Enter" onClick={() => void rebuildSource()}>{buildStarted !== null ? `Building · ${elapsedSeconds.toFixed(1)} s` : 'Build'}</button><ExportPicker formats={model?.exportFormats ?? []} disabled={!model || !!busy || buildStarted !== null || !!pendingAuthoring} open={exportOpen} onOpen={setExportOpen} onExport={exportSelected} /></nav>
      <div className="toolbar">
        <LocalHostControl />
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}>⌕ <span>Command palette</span><kbd>Ctrl+Shift+P</kbd></button>
      </div>
      <div className="top-actions"><button title="Toggle utility dock" aria-label="Toggle utility dock" aria-pressed={shellLayout.utilityOpen} onClick={() => shellLayout.setUtilityOpen(value => !value)}>▥</button><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as ThemeName)}><option value="bronze-age">Bronze Age</option><option value="apollonia">Apollonia</option></select></div>
      <input ref={fileInput} hidden type="file" multiple accept=".firmament,.firmasm,.step,.stp,.zip" onChange={async event => {
        const files = Array.from(event.target.files ?? []); if (!files.length) return;
        event.target.value = '';
        try {
          if (files.some(file => file.size > 32 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error('Local import supports files up to 32 MB and workspaces up to 64 MB.');
          let next;
          if (files.length === 1 && /\.zip$/i.test(files[0].name)) next = unpackProject(new Uint8Array(await files[0].arrayBuffer()));
          else if (files.length === 1 && isStep(files[0].name)) next = importedProject(files[0].name, await files[0].text());
          else {
            if (files.some(file => !/\.(firmament|firmasm|step|stp)$/i.test(file.name))) throw new Error('Open Firmament source, STEP, or a .helios.zip workspace.');
            const entries = await Promise.all(files.map(async file => [file.name, await file.text()] as const));
            if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error('Choose unique project-relative names.');
            const root = entries.find(([name]) => /\.firmasm$/i.test(name)) ?? entries.find(([name]) => /\.firmament$/i.test(name));
            if (!root) throw new Error('Choose one STEP part, or a Firmament root with its STEP assets.');
            next = { root: root[0], documents: Object.fromEntries(entries) };
          }
          if (project && Object.keys(next.documents).length > 1) throw new Error('Imported workspaces currently save locally. Open this from the local workspace; cloud projects store one source document.');
          projectDocuments.current = next.documents; projectRoot.current = next.root;
          setProjectFileNames(sourceFiles(next.documents)); setWorkspaceTitle(stripExtension(next.root)); setUtilityTab({ kind: 'inspector' });
          await open(next.documents[next.root], next.root);
        } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-OPEN')]); setBusy(null); }
      }} />
    </header>
    {project && <div className="cloud-project-bar"><button onClick={() => { if (saveState === 'Saved' || confirm('Leave this project with unsaved source?')) onBack?.(); }}>← Discover</button><strong>{project.name}</strong><span className="cloud-save-state" role="status">{saveState}</span><div className="cloud-editor-actions"><button className="cloud-save" onClick={() => void save()}>Save</button>{onPublish && <button onClick={() => { setPublishState(''); setPublishOpen(true); }}>Publish</button>}<button onClick={() => downloadText(source, sourceName)}>Download source</button>{onSignOut && <button onClick={() => { if (saveState === 'Saved' || confirm('Sign out with unsaved source?')) onSignOut(); }}>Sign out</button>}</div></div>}
    <main className={`workspace ${shellLayout.utilityOpen ? '' : 'utility-collapsed'} ${shellLayout.bottomOpen ? '' : 'bottom-collapsed'}`} ref={shellLayout.ref}>
        <div className="editor-pane" style={shellLayout.place('editor')}>
        <div className="editor-mode"><div className="segmented" role="tablist" aria-label="Editing view">
          <button role="tab" aria-selected={editorMode === 'graph'} className={editorMode === 'graph' ? 'active' : ''} onClick={() => setEditorMode('graph')}>Graph</button>
          <button role="tab" disabled={!!pendingAuthoring} aria-selected={editorMode === 'source'} className={editorMode === 'source' ? 'active' : ''} onClick={() => setEditorMode('source')}>Source</button>
        </div></div>
        {editorMode === 'graph' && <GraphPanel pending={!!pendingAuthoring} outline={outline} error={outlineError} diagnostics={shownDiagnostics} selection={graphSelection} theme={theme}
          onSelect={(unitId, row, graph) => selectFromGraph(unitId, row, graph)} onOpenSource={(unitId, row, graph) => openFromGraph(unitId, row, graph)}
          authoring={graphAuthoring()} assembly={assemblyView()}
          inspector={<div className="graph-side">
            {pendingAuthoring && outline ? <AuthoringPanel pending={pendingAuthoring} source={source} sourceName={sourceName} outline={outline} palette={palette} schema={semanticSchema}
              runtime={runtime} assembly={assemblyGraph} jointKinds={jointKinds} selection={previewModel ? null : selectedSelection}
              documents={projectDocuments.current} root={projectRoot.current ?? sourceName} onCancel={() => setPendingAuthoring(null)}
              onPreview={setPreviewModel} onSketch={newIntelliDraft}
              onInspect={id => { setPendingAuthoring(null); selectGraphNode(id); }}
              onApply={(result, label) => {
                if (pendingAuthoring.revision !== sourceRevisionRef.current) { pushOutput('Source changed; prepare the edit again.'); setPendingAuthoring(null); return; }
                setPendingAuthoring(null); setPreviewModel(null);
                if (!result.changed) { const target = featureTarget(outline, pendingAuthoring.node); if ('body' in target) selectGraphNode(target.body.id); return; }
                pendingGraphSelection.current = result.nodes.at(-1) ?? pendingAuthoring.node;
                applyGraphChange({ ...result.edit, before: source.slice(result.edit.start, result.edit.start + result.edit.length), next: result.text },
                  { nodeId: result.nodes.at(-1) ?? pendingAuthoring.node ?? '', field: null, label, warnings: result.warnings });
              }} /> : <>
            <div className="graph-side-tabs" role="tablist" aria-label="Side panel">
              <button role="tab" aria-selected={sideTab === 'selection'} className={sideTab === 'selection' ? 'active' : ''} onClick={() => setSideTab('selection')}>Selection</button>
              <button role="tab" aria-selected={sideTab === 'parameters'} className={sideTab === 'parameters' ? 'active' : ''} onClick={() => setSideTab('parameters')}>
                Parameters{parameterNodes(outline).length > 0 && <small>{parameterNodes(outline).length}</small>}</button>
            </div>
            {sideTab === 'selection'
              ? <NodeInspector {...inspectorProps()} {...graphActions} actions={contextActions()} onCommit={commitGraphField} onRevert={revertGraphEdit} onSelectNode={selectGraphNode}
                  onOpenSource={span => { setEditorMode('source'); navigateSource({ source: sourceName, start: span.start, length: span.length, line: 1, column: 1 }); }} />
              : <ParametersSheet outline={outline} edit={graphEdit && graphEdit.revision === sourceRevision ? graphEdit : null}
                  readOnly={inspectorProps().readOnly} onCommit={commitGraphField} onRename={graphActions.onRename} onDelete={graphActions.onDelete}
                  onAdd={parameterActions.onAdd} onSelect={selectGraphNode} />}</>}
          </div>} />}
        <div className="source-host" hidden={editorMode !== 'source'}>
        <SourcePanel ref={sourcePanel} onHistoryState={setHistoryState} onHistoryApplied={value => { setGraphEdit(null); void submitBuild(value, sourceName, sourceRevisionRef.current); }} disabled={!!busy} fileName={sourceName} dirty={dirtyFiles.has(sourceName)} source={source} diagnostics={shownDiagnostics.filter(item => !item.source || item.source.source === sourceName)} runtime={runtime} model={model} selectedSelector={selectedSelection?.selector} theme={theme} onSourceChange={value => editSource(value)} onCursorChange={onSourceCursor} onRebuild={() => void rebuildSource()} onLiveDiagnostics={setLiveDiagnostics} onLanguageError={error => { setDiagnostics([toDiagnostic(error, 'FIRMAMENT-FORMAT')]); pushOutput(`Format refused · ${error instanceof Error ? error.message : String(error)}`); }} onDiagnosticClick={diagnostic => { if (diagnostic.source) setSelectedEntityId(null); }} />
        </div>
        </div>
        <ResizeHandle axis="horizontal" label="Resize source and viewport" value={shellLayout.editorPercent} onResize={shellLayout.resizeEditor} style={shellLayout.splitter} />
        <div className={`viewport-pane${ghosted ? ' ghosted' : ''}`} style={shellLayout.place('viewport')}>
        <div className={`viewport-toolbar${shellLayout.toolbarStacked ? ' stacked' : ''}`} inert={!!intelliDraft} style={shellLayout.place('toolbar')}>
          <div className="toolbar-tools"><button title="Draw, dimension and trace Profiles" disabled={!!busy || buildStarted !== null} onClick={() => void openIntelliDraft()}>IntelliDraft</button>
          <button title="Show retained geometric Concept Structs as gold wireframes; disabled when none are available" aria-pressed={showConcepts}
            disabled={!model?.mesh.definitions.some(d => d.concepts?.length) && !model?.mesh.occurrences.some(o => o.concepts?.length)} onClick={() => setShowConcepts(value => !value)}>Concepts</button></div>
          <div className="toolbar-views"><button title="Front view" onClick={() => namedView('front')}>Front</button><button title="Top view" onClick={() => namedView('top')}>Top</button><button title="Right view" onClick={() => namedView('right')}>Right</button><button title="Isometric view" onClick={() => namedView('iso')}>Iso</button><button title="Fit model · F" onClick={() => setViewCommand(`fit-${Date.now()}`)}>Fit</button><button title="Fit selection" disabled={!selectedEntityId} onClick={() => setViewCommand(`fitselection-${Date.now()}`)}>Fit selection</button></div>
          <div className="toolbar-display"><select aria-label="Display mode" value={displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)}><option value="shaded">Shaded</option><option value="edges">Shaded with edges</option><option value="wireframe">Wireframe</option></select><button aria-label="Selection mode" title="Switch face or edge selection" onClick={() => { setSelectionMode(value => value === 'face' ? 'edge' : 'face'); setDisplayMode('edges'); }}>{selectionMode === 'face' ? 'Faces' : 'Edges'}</button><button title="Toggle camera projection" onClick={() => setViewMode(value => value === 'perspective' ? 'orthographic' : 'perspective')}>{viewMode === 'perspective' ? 'Perspective' : 'Orthographic'}</button></div>
        </div>
        <div className="viewport-stage" style={shellLayout.place('stage')}>
        {previewModel && <div className="authoring-preview-banner" role="status">Preview · {wireframePreview ? 'gold boundaries · ' : ''}source unchanged · Apply or Cancel</div>}
        <Viewport measurementDisabledReason={previewModel ? 'Apply or cancel the preview before measuring.' : busy || displayRevision !== sourceRevision ? "Build the current source successfully before measuring." : undefined} showConcepts={showConcepts} pose={previewModel ? null : pose} busyMessage={busy === 'Worker failed' ? null : busy} errorMessage={shownDiagnostics.some(item => item.severity === 'error') ? (model ? 'Build failed. The last valid model remains visible; see Problems for details.' : 'Build needs attention. See Problems for the compiler diagnostic.') : null} model={wireframePreview ? model : previewModel ?? model} wireframePreview={wireframePreview} selectedEntityId={previewModel ? null : selectedEntityId} selectedTopologyId={previewModel ? null : selectedFaceId} theme={theme} displayMode={displayMode} viewMode={viewMode} viewCommand={previewModel && !wireframePreview ? `fit-preview-${previewModel.id}` : viewCommand} selectionMode={selectionMode} onSelect={previewModel ? () => {} : select} captureRef={capturePreview} />
        {intelliDraft && <IntelliDraftPanel key={intelliDraft.source === undefined ? 'new' : `existing:${intelliDraft.node ?? ''}`} runtime={runtime} initialSource={intelliDraft.source}
          document={intelliDraft.source === undefined ? undefined : sourceName} initialNode={intelliDraft.node ?? null}
          onSource={intelliDraft.source === undefined ? undefined : span => { setIntelliDraft(null); setEditorMode('source'); navigateSource({ source: sourceName, ...span, line: 1, column: 1 }); }}
          onNew={() => setIntelliDraft({ revision: sourceRevision })} onClose={() => setIntelliDraft(null)} onCommit={async candidate => {
          if (busy || buildStarted !== null) throw new Error('Wait for the current build to finish.');
          if (sourceRevisionRef.current !== intelliDraft.revision) throw new Error('The working document changed. Cancel this draft and start again to avoid replacing newer work.');
          const result = await runtime.preview(candidate, intelliDraft.source === undefined ? 'intellidraft.firmament' : sourceName, sourceRevision, projectDocuments.current);
          try {
            if (!result.model || result.diagnostics.some(d => d.severity === 'error'))
              throw new Error(result.diagnostics.map(d => `${d.code}: ${d.message}`).join('\n') || 'The compiler did not admit this part.');
          } finally { await result.model?.dispose(); }
          if (sourceRevisionRef.current !== intelliDraft.revision) throw new Error('The working document changed during compilation. Your draft is retained.');
          fitOnNextModel.current = true;
          if (intelliDraft.source !== undefined) {
            applyGraphChange({ start: 0, length: source.length, before: source, replacement: candidate, next: candidate }, { nodeId: '', field: null, label: 'Updated IntelliDraft construction', warnings: [] });
            setIntelliDraft(null); return;
          }
          if (dirtyFiles.size && !confirm('Use this built IntelliDraft part and replace the working document? Save or checkpoint unsaved edits first if you need them.')) return;
          projectRoot.current = null; projectDocuments.current = {}; setProjectFileNames([]); setWorkspaceTitle('IntelliDraft part');
          await open(candidate, 'intellidraft.firmament'); setIntelliDraft(null);
        }} />}
        {model?.motions?.length ? <MotionStrip clips={model.motions} revision={model.revision} onPose={setPose}
          sample={(motion, t) => runtime.sampleMotion(motion, t)} coverage={next => poseCoverage(model.mesh, next)} /> : null}
        {welcomeHint && <div className="workflow-hint"><span><b>{editorMode === 'graph' ? 'Select → Edit → Apply' : 'Source → Build → Geometry'}</b> {editorMode === 'graph' ? 'Select the body to add holes or finish edges. Preview new features, then Apply.' : 'Edit on the left. Ctrl+Enter builds.'} Drag to orbit; scroll to zoom.</span><button aria-label="Dismiss workflow hint" onClick={() => { setWelcomeHint(false); localStorage.setItem('helios-workflow-understood', '1'); }}>×</button></div>}
        </div>
        <div className="viewport-caption" style={shellLayout.place('caption')}><span>{partName}</span><span>{previewModel ? 'Preview · source unchanged' : ghosted ? 'Last good model · the current draft does not build' : displayRevision !== sourceRevision && model ? 'Last valid model · source changed' : model ? 'Compiled geometry' : 'Waiting for geometry'}</span></div>
        </div>
      <aside className="utility-dock" aria-label="Utility panel" style={shellLayout.place('utility')} hidden={!shellLayout.utilityOpen}>
        <div className="dock-tabs" role="tablist" aria-label="Utilities">{([['files', 'Files'], ['inspector', 'Inspector'], ['examples', 'Examples'], ['llm', 'AI Author'], ['version-control', 'Version Control']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={utilityTab.kind === id} className={utilityTab.kind === id ? 'active' : ''} onClick={() => setUtilityTab({ kind: id })}>{label}</button>)}</div>
        <div className="utility-content">
          {matchKind(utilityTab, {
            files: () => <><ProjectExplorer projectName={workspaceTitle} fileName={sourceName} dirty={dirtyFiles.has(sourceName)} dirtyFiles={dirtyFiles} documents={projectFileNames.length ? projectFileNames : [sourceName]} cloud={!!project} onSelectFile={projectFileNames.length ? switchFile : undefined} onOpen={() => fileInput.current?.click()} onNew={() => loadSample('new')} onReveal={() => sourcePanel.current?.focusAt()} /><ModelTree tree={model?.tree ?? null} selectedId={selectedEntityId} onSelect={id => select(id)} /></>,
            inspector: () => <><ModelTree tree={model?.tree ?? null} selectedId={selectedEntityId} onSelect={id => select(id)} /><Inspector model={model} schema={semanticSchema} projection={fieldProjection} projectionCurrent={source === model?.source} entityId={selectedEntityId} faceId={selectedFaceId} selection={selectedSelection} diagnostics={diagnostics} onApply={applyProperty} onRewriteField={rewriteField} onGoToSource={navigateSource} onReferenceFace={referenceFace} onReferenceHoleWall={referenceHoleWall}
              annotationEditor={selectedSelection?.sourceAddressability === 'ImportedStable' && selectedSelection.selector && ['Plane', 'Cylinder'].includes(selectedSelection.surfaceKind ?? '') ?
                <PmiAuthor key={`${model?.revision}:${selectedSelection.selector}`} selection={selectedSelection} outline={outline} disabled={!!busy || sourceRevision !== displayRevision} onApply={(operations, label) => structuralEdit(operations, { nodeId: '', label })} /> : undefined} /></>,
            examples: () => <div className="dock-gallery"><ExampleGallery onOpen={id => void openExample(id)} opening={openingExample} unavailableReason={busy ? "A project operation is running. Open another example when it finishes." : undefined} /></div>,
            llm: () => null,
            'version-control': () => null,
          })}
          <WorkspacePanels key={project?.id ?? 'local-workspace'} active={utilityTab.kind} workspace={{
              id: project?.id ?? 'local-workspace',
              busy: !!busy || buildStarted !== null,
              snapshot: () => ({ revision: sourceRevisionRef.current, project: {
                root: projectRoot.current ?? sourceName,
                documents: { ...projectDocuments.current, [sourceName]: source },
              } }),
              apply: async (next, expectedRevision, label) => {
                if (sourceRevisionRef.current !== expectedRevision) throw new Error('The working source changed. Reconcile the candidate against the current revision.');
                if (busy || buildStarted !== null) throw new Error('Wait for the current operation before applying project changes.');
                if (!Object.hasOwn(next.documents, next.root)) throw new Error('The checkpoint is missing its root document.');
                const active = Object.hasOwn(next.documents, sourceName) ? sourceName : next.root;
                projectRoot.current = next.root; projectDocuments.current = { ...next.documents };
                setProjectFileNames(sourceFiles(next.documents));
                const before = sourceRevisionRef.current;
                if (active !== sourceName || !sourcePanel.current?.replace({ source: sourceName, start: 0, length: source.length, line: 1, column: 1 }, source, next.documents[active])
                    || sourceRevisionRef.current === before) editSource(next.documents[active], active);
                setDirtyFiles(new Set(Object.keys(next.documents).filter(name => savedSources.current[name] !== next.documents[name])));
                pushOutput(label);
                return submitBuild(next.documents[active], active, sourceRevisionRef.current);
              },
            }} />
        </div>
      </aside>
      <div className="bottom-region" style={shellLayout.place('bottom')}><ResizeHandle axis="vertical" label="Resize bottom panel" value={shellLayout.bottomPixels} onResize={shellLayout.resizeBottom} /><BottomDock collapsed={!shellLayout.bottomOpen} onToggle={() => shellLayout.setBottomOpen(value => !value)} diagnostics={shownDiagnostics} busy={busy} sourceName={sourceName} sourceRevision={sourceRevision} displayRevision={displayRevision} lastTiming={lastTiming} events={phaseTiming ? [...outputEvents, phaseTiming] : outputEvents} onDiagnosticClick={diagnostic => { if (diagnostic.source) navigateSource(diagnostic.source); }} /></div>
    </main>
    <WorkspaceStatus busy={busy ?? (workerFailed ? 'Worker failed' : null)} elapsed={elapsedSeconds} runtimeName={runtimeName} model={model} sourceRevision={sourceRevision} displayRevision={displayRevision} diagnostics={shownDiagnostics} timing={lastTiming} theme={theme} viewMode={viewMode} onRestart={() => { void buildClient.restart().then(() => submitBuild(source, sourceName)).catch(error => setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER-RESTART')])); }} />
    {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
    {examplesOpen && <ExampleDialog onClose={() => setExamplesOpen(false)}><ExampleGallery onOpen={id => void openExample(id)} opening={openingExample} unavailableReason={busy ? "A project operation is running. Open another example when it finishes." : undefined} /></ExampleDialog>}
    {publishOpen && onPublish && project && <div className="publish-backdrop"><form className="publish-dialog" aria-label="Publish model" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); if (saveState !== 'Saved' || !model || model.source !== source || displayRevision !== sourceRevision) { setPublishState('Save and rebuild the current source before publishing.'); return; } const png = capturePreview.current?.(); if (!png?.startsWith('data:image/png;base64,')) { setPublishState('A preview could not be captured.'); return; } setPublishState('Publishing…'); void onPublish({ expectedRevisionId: project.revisionId, title: String(fields.get('title')).trim(), description: String(fields.get('description')).trim(), category: String(fields.get('category')), tags: String(fields.get('tags')).split(',').map(x => x.trim()).filter(Boolean), previewPngBase64: png.slice('data:image/png;base64,'.length) }).then(() => { setPublishOpen(false); setPublishState(''); }).catch(error => setPublishState(error instanceof Error ? error.message : 'Publish failed')); }}><h2>Publish model</h2><p>Publish the saved revision and this viewport view. Later edits stay private until you publish again.</p><label>Title<input name="title" defaultValue={project.name} maxLength={160} required /></label><label>Description<textarea name="description" maxLength={2000} /></label><label>Category<select name="category"><option>Mechanical</option><option>Assemblies</option><option>Sheet Metal</option><option>Surface</option><option>Furniture</option><option>Architecture</option><option>Game Assets</option></select></label><label>Tags, separated by commas<input name="tags" /></label>{publishState && <p role="status">{publishState}</p>}<div><button type="button" onClick={() => setPublishOpen(false)}>Cancel</button><button type="submit">Publish</button></div></form></div>}
  </div>;
}

function readEditorMode(): 'graph' | 'source' {
  try { return localStorage.getItem('helios-editor-mode') === 'graph' ? 'graph' : 'source'; } catch { return 'source'; }
}
function stripExtension(name: string) { return name.replace(/\.[^.]+$/, ''); }
function snapshotSession(session: ModelSession | null) { return session ? Object.assign(Object.create(Object.getPrototypeOf(session)), session) as ModelSession : null; }
function isTyping(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof Node && !!(target as Element).parentElement?.closest('.monaco-editor'); }
function toDiagnostic(error: unknown, code: string): Diagnostic { return { severity: 'error', code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : code, message: error instanceof Error ? error.message : String(error), details: error instanceof Error && 'details' in error && typeof error.details === 'string' ? error.details : undefined }; }
function isWorkerFailure(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && ['worker-error', 'worker-message-error', 'worker-terminated', 'worker-protocol', 'worker-revision'].includes(String(error.code)); }
function downloadText(value: string, name: string) { downloadBlob(new Blob([value], { type: 'text/plain' }), name); }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, LanguageOutline, ModelSession, LanguageEditOperation, LanguageField, MotionPose, OutlineField, OutlineNode, PaletteItem, SelectionDescription, SemanticSchema, UnitValue } from '@aetheris/cad';
import { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { AetherisWorkerClient, type BuildResult } from '../sdk/AetherisWorkerClient';
import { assemblySource, bracketSource, emptyModelSource } from '../sdk/samples';
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
import { AuthorPanel } from '../author/AuthorPanel';
import { ResizeHandle } from './ResizeHandle';
import { WorkspaceStatus } from './WorkspaceStatus';
import { useTheme } from '../themes/useTheme';
import { GraphPanel, type GraphSelection } from '../graph/GraphPanel';
import { NodeInspector, type GraphEditState } from '../graph/NodeInspector';
import { outlineNode, spliceField } from '../graph/fieldEdit';
import { bodyParent, featureTarget, paletteOperation, paletteUnavailable, wireOperation } from '../graph/graphAuthoring';
import { editorFor, formatQuantity, parameterSource, vectorText, type Quantity } from '../graph/fieldEdit';
import { startingValue } from '../graph/NodeInspector';
import { parameterNodes, ParametersSheet } from '../graph/ParametersSheet';
import { buildPartGraph, nodeAtSpan, unitAtSpan, type GraphRow, type PartGraph } from '../graph/outlineGraph';
import { assembliesOf, buildAssemblyGraph, jointOperation, type AssemblyEnd } from '../graph/assemblyGraph';
import type { AssemblyView } from '../graph/GraphPanel';
import { MotionStrip } from '../viewport/MotionStrip';
import { poseCoverage } from '../viewport/pose';
import type { ExportFormat } from '@aetheris/cad';
import { ExportPicker } from './ExportPicker';

type UtilityTab = { kind: 'files' } | { kind: 'inspector' } | { kind: 'examples' } | { kind: 'llm' };

export function HeliosApp({ project, initialWorkspace, onShowcase, onSave, onPublish, onBack, onSignOut }: { project?: Project; initialWorkspace?: WorkspaceProject; onShowcase?: () => void; onSave?: (source: string) => Promise<void>; onPublish?: (payload: { expectedRevisionId: string; title: string; description: string; category: string; tags: string[]; previewPngBase64: string }) => Promise<void>; onBack?: () => void; onSignOut?: () => void } = {}) {
  const [runtime] = useState(() => new WebSdkCadRuntime());
  const [buildClient] = useState(() => new AetherisWorkerClient(runtime));
  const [editorMode, setEditorMode] = useState<'graph' | 'source'>(() => readEditorMode());
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
  const [viewCommand, setViewCommand] = useState('fit');
  const [runtimeName, setRuntimeName] = useState('WASM');
  const [lastTiming, setLastTiming] = useState<{ label: string; milliseconds: number } | null>(null);
  const [phaseTiming, setPhaseTiming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectDocuments = useRef<Record<string,string>>(initialWorkspace?.documents ?? {});
  const projectRoot = useRef<string | null>(initialWorkspace?.root ?? null);
  const savedSources = useRef<Record<string,string>>({ ...initialWorkspace?.documents, [initialName]: initialSource });
  const [projectFileNames, setProjectFileNames] = useState<string[]>(Object.keys(initialWorkspace?.documents ?? {}));
  runtime.setProjectContext?.(projectRoot.current, projectDocuments.current);
  const sourcePanel = useRef<SourcePanelHandle>(null);
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
  const pushOutput = (message: string) => setOutputEvents(events => [...events.slice(-79), message]);
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

  const acceptBuild = (result: BuildResult) => {
    if (result.status === 'superseded' || result.request.sourceRevision !== sourceRevisionRef.current) return;
    setDiagnostics(result.diagnostics);
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
      setBusy(result.diagnostics.some(item => item.code === 'HELIOS-WORKER') ? 'Worker failed' : null);
    }
    setBuildStarted(null);
  };

  const submitBuild = async (value: string, name: string, revision = sourceRevisionRef.current) => {
    const submission = ++latestSubmission.current;
    setBusy(runtime.info ? 'Building' : 'Initializing Aetheris Worker');
    setBuildStarted(performance.now());
    pushOutput(`Build started · ${name} · revision ${revision}`);
    const root = projectRoot.current ?? name;
    const rootSource = root === name ? value : projectDocuments.current[root];
    try {
      await runtime.initialize();
      if (submission === latestSubmission.current) setBusy('Building');
    } catch (error) {
      setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER')]);
      setBusy('Worker failed'); setBuildStarted(null);
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

  useEffect(() => { void submitBuild(initialSource, initialName, 0); void runtime.schema().then(setSemanticSchema).catch(error => setDiagnostics([toDiagnostic(error, 'HELIOS-LANGUAGE')])); return () => { void runtime.dispose(); }; }, []);
  useEffect(() => { if (buildStarted === null) return; const timer = setInterval(() => setElapsedSeconds((performance.now() - buildStarted) / 1000), 250); return () => clearInterval(timer); }, [buildStarted]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (onSave) void save(); else downloadSource(); }
      if (((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') || event.key === 'F1') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) setViewCommand(`fit-${Date.now()}`);
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [source, sourceName, onSave]);

  const save = async () => {
    if (!onSave) return;
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
    const entity = node ? entityForSpan(node.span.start, node.span.length) : undefined;
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
    if (!id || !partGraph) return;
    const unitId = partGraph.unitOf.get(id);
    if (!unitId) return;
    pendingGraphSelection.current = null;
    setGraphSelection({ unitId, rowId: id === unitId ? null : id });
  }, [partGraph]);
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
      const next = axis === null || editor.kind !== 'vector' ? name : vectorText(editor.parts.map((part, i) => i === axis ? { kind: 'name' as const, name } : part));
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
    authoring: busy === 'Worker failed' ? null : {
      kinds: jointKinds,
      onJoin: (kind: string, a: AssemblyEnd, b: AssemblyEnd) => {
        if (!outline) return;
        const operation = jointOperation(assemblyGraph, kind, a, b, outline);
        if ('reason' in operation) { pushOutput(operation.reason); return; }
        const name = (id: string) => assemblyGraph.parts.find(p => p.id === id)?.name ?? id;
        void structuralEdit([operation], { nodeId: assemblyGraph.assembly.id, label: `Joined ${name(a.part)}.${a.port} to ${name(b.part)}.${b.port} (${kind})` })
          .then(refused => { if (refused) pushOutput(`Joint refused · ${refused}`); });
      },
    },
    onPickAssembly: setPickedAssembly,
    onSelect: id => selectGraphNode(id),
    onOpenSource: id => { const node = outline?.nodes.find(n => n.id === id); if (node) { setEditorMode('source'); navigateSource({ source: sourceName, start: node.span.start, length: node.span.length, line: 1, column: 1 }); } },
  };
  const graphAuthoring = () => {
    if (busy === 'Worker failed' || !outline) return null;
    const target = featureTarget(outline, inspectedId);
    return {
      palette: [...documentFeatures(), ...palette],
      featureTarget: 'body' in target ? { body: target.body.name ?? target.body.id } : target,
      unavailable: (item: PaletteItem) => paletteUnavailable(item, outline, inspectedId),
      onInsert: (item: PaletteItem) => {
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
  const revertGraphEdit = () => {
    if (!graphEdit) return;
    const base = graphEdit.base;
    setGraphEdit(null);
    editSource(base);
    pushOutput('Reverted the draft');
    // Back to exactly what the displayed model was built from: nothing to rebuild.
    if ((projectRoot.current ?? sourceName) === sourceName && model?.source === base) setDisplayRevision(sourceRevisionRef.current);
    else void submitBuild(base, sourceName, sourceRevisionRef.current);
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
      node, nodes: partGraph?.nodes ?? new Map<string, OutlineNode>(), focusField, problems, edit,
      completion: completion && node && completion.nodeId === node.id ? completion.fields : [],
      external: unit?.category === 'external' ? { title: unit.title, document: unit.document } : null,
      schema: semanticSchema?.constructs.find(item => item.id === node?.schemaId) ?? null,
      readOnly: busy === 'Worker failed' ? 'The build worker stopped. Restart it from the status bar to edit.' : null,
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
      <div className="workspace-identity"><strong>{workspaceTitle}</strong><small>{project ? 'Saved project' : 'Local workspace'} · Firmament</small></div>
      <nav className="workspace-tabs" aria-label="Workspace"><button onClick={() => setExamplesOpen(true)}>Examples</button><button onClick={() => fileInput.current?.click()}>Open file</button><button title="Download the active Firmament document · Ctrl+S" onClick={() => onSave ? void save() : downloadSource()}>Save source</button><button className="build-action" disabled={buildStarted !== null || !!busy} title="Build project · Ctrl+Enter" onClick={() => void rebuildSource()}>{buildStarted !== null ? `Building · ${elapsedSeconds.toFixed(1)} s` : 'Build'}</button><ExportPicker formats={model?.exportFormats ?? []} disabled={!model || !!busy || buildStarted !== null} open={exportOpen} onOpen={setExportOpen} onExport={exportSelected} /></nav>
      <div className="toolbar">
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}>⌕ <span>Command palette</span><kbd>Ctrl+Shift+P</kbd></button>
      </div>
      <div className="top-actions"><button title="Toggle utility dock" aria-label="Toggle utility dock" aria-pressed={shellLayout.utilityOpen} onClick={() => shellLayout.setUtilityOpen(value => !value)}>▥</button><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as ThemeName)}><option value="bronze-age">Bronze Age</option><option value="apollonia">Apollonia</option></select></div>
      <input ref={fileInput} hidden type="file" multiple accept=".firmament,.firmasm,.txt" onChange={async event => {
        const files = Array.from(event.target.files ?? []); if (!files.length) return;
        if (project && files.length > 1) { setDiagnostics([toDiagnostic(new Error('This saved project stores one document. Open multi-file projects from Helios home.'), 'project-single-source')]); event.target.value = ''; return; }
        const entries = await Promise.all(files.map(async file => [file.name, await file.text()] as const));
        if (new Set(entries.map(([name])=>name)).size !== entries.length) { setDiagnostics([toDiagnostic(new Error('Choose files with unique project-relative names.'), 'project-duplicate-path')]); return; }
        projectDocuments.current = Object.fromEntries(entries); setProjectFileNames(entries.map(([name])=>name));
        const root = entries.find(([name]) => name.endsWith('.firmasm')) ?? entries[0]; projectRoot.current = root[0]; setWorkspaceTitle(stripExtension(root[0]));
        void open(root[1], root[0]); event.target.value = '';
      }} />
    </header>
    {project && <div className="cloud-project-bar"><button onClick={() => { if (saveState === 'Saved' || confirm('Leave this project with unsaved source?')) onBack?.(); }}>← Discover</button><strong>{project.name}</strong><span className="cloud-save-state" role="status">{saveState}</span><div className="cloud-editor-actions"><button className="cloud-save" onClick={() => void save()}>Save</button>{onPublish && <button onClick={() => { setPublishState(''); setPublishOpen(true); }}>Publish</button>}<button onClick={() => downloadText(source, sourceName)}>Download source</button><button onClick={() => { if (saveState === 'Saved' || confirm('Sign out with unsaved source?')) onSignOut?.(); }}>Sign out</button></div></div>}
    <main className={`workspace ${shellLayout.utilityOpen ? '' : 'utility-collapsed'} ${shellLayout.bottomOpen ? '' : 'bottom-collapsed'}`} ref={shellLayout.ref} style={shellLayout.style}>
      <div className="workbench">
        <div className="editor-pane">
        <div className="editor-mode"><div className="segmented" role="tablist" aria-label="Editing view">
          <button role="tab" aria-selected={editorMode === 'graph'} className={editorMode === 'graph' ? 'active' : ''} onClick={() => setEditorMode('graph')}>Graph</button>
          <button role="tab" aria-selected={editorMode === 'source'} className={editorMode === 'source' ? 'active' : ''} onClick={() => setEditorMode('source')}>Source</button>
        </div></div>
        {editorMode === 'graph' && <GraphPanel outline={outline} error={outlineError} diagnostics={shownDiagnostics} selection={graphSelection} theme={theme}
          onSelect={(unitId, row, graph) => selectFromGraph(unitId, row, graph)} onOpenSource={(unitId, row, graph) => openFromGraph(unitId, row, graph)}
          authoring={graphAuthoring()} assembly={assemblyView()}
          inspector={<div className="graph-side">
            <div className="graph-side-tabs" role="tablist" aria-label="Side panel">
              <button role="tab" aria-selected={sideTab === 'selection'} className={sideTab === 'selection' ? 'active' : ''} onClick={() => setSideTab('selection')}>Selection</button>
              <button role="tab" aria-selected={sideTab === 'parameters'} className={sideTab === 'parameters' ? 'active' : ''} onClick={() => setSideTab('parameters')}>
                Parameters{parameterNodes(outline).length > 0 && <small>{parameterNodes(outline).length}</small>}</button>
            </div>
            {sideTab === 'selection'
              ? <NodeInspector {...inspectorProps()} {...graphActions} onCommit={commitGraphField} onRevert={revertGraphEdit} onSelectNode={selectGraphNode}
                  onOpenSource={span => { setEditorMode('source'); navigateSource({ source: sourceName, start: span.start, length: span.length, line: 1, column: 1 }); }} />
              : <ParametersSheet outline={outline} edit={graphEdit && graphEdit.revision === sourceRevision ? graphEdit : null}
                  readOnly={inspectorProps().readOnly} onCommit={commitGraphField} onRename={graphActions.onRename} onDelete={graphActions.onDelete}
                  onAdd={parameterActions.onAdd} onSelect={selectGraphNode} />}
          </div>} />}
        <div className="source-host" hidden={editorMode !== 'source'}>
        <SourcePanel ref={sourcePanel} disabled={!!busy} fileName={sourceName} dirty={dirtyFiles.has(sourceName)} source={source} diagnostics={shownDiagnostics.filter(item => !item.source || item.source.source === sourceName)} runtime={runtime} model={model} selectedSelector={selectedSelection?.selector} theme={theme} onSourceChange={value => editSource(value)} onCursorChange={onSourceCursor} onRebuild={() => void rebuildSource()} onLiveDiagnostics={setLiveDiagnostics} onLanguageError={error => { setDiagnostics([toDiagnostic(error, 'FIRMAMENT-FORMAT')]); pushOutput(`Format refused · ${error instanceof Error ? error.message : String(error)}`); }} onDiagnosticClick={diagnostic => { if (diagnostic.source) setSelectedEntityId(null); }} />
        </div>
        </div>
        <ResizeHandle axis="horizontal" label="Resize source and viewport" value={shellLayout.editorPercent} onResize={shellLayout.resizeEditor} />
        <div className={`viewport-pane${ghosted ? ' ghosted' : ''}`}>
        <div className="viewport-toolbar">
          <button title="Show retained geometric Concept Structs as gold wireframes; disabled when none are available" aria-pressed={showConcepts}
            disabled={!model?.mesh.definitions.some(d => d.concepts?.length) && !model?.mesh.occurrences.some(o => o.concepts?.length)} onClick={() => setShowConcepts(value => !value)}>Concepts</button>
          <div><button title="Front view" onClick={() => namedView('front')}>Front</button><button title="Top view" onClick={() => namedView('top')}>Top</button><button title="Right view" onClick={() => namedView('right')}>Right</button><button title="Isometric view" onClick={() => namedView('iso')}>Iso</button><button title="Fit model · F" onClick={() => setViewCommand(`fit-${Date.now()}`)}>Fit</button><button title="Fit selection" disabled={!selectedEntityId} onClick={() => setViewCommand(`fitselection-${Date.now()}`)}>Fit selection</button></div>
          <div><select aria-label="Display mode" value={displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)}><option value="shaded">Shaded</option><option value="edges">Shaded with edges</option><option value="wireframe">Wireframe</option></select><button aria-label="Selection mode" title="Switch face or edge selection" onClick={() => { setSelectionMode(value => value === 'face' ? 'edge' : 'face'); setDisplayMode('edges'); }}>{selectionMode === 'face' ? 'Faces' : 'Edges'}</button><button title="Toggle camera projection" onClick={() => setViewMode(value => value === 'perspective' ? 'orthographic' : 'perspective')}>{viewMode === 'perspective' ? 'Perspective' : 'Orthographic'}</button></div>
        </div>
        <Viewport measurementDisabledReason={busy || displayRevision !== sourceRevision ? "Build the current source successfully before measuring." : undefined} showConcepts={showConcepts} pose={pose} busyMessage={busy === 'Worker failed' ? null : busy} errorMessage={shownDiagnostics.some(item => item.severity === 'error') ? (model ? 'Build failed. The last valid model remains visible; see Problems for details.' : 'Build needs attention. See Problems for the compiler diagnostic.') : null} model={model} selectedEntityId={selectedEntityId} selectedTopologyId={selectedFaceId} theme={theme} displayMode={displayMode} viewMode={viewMode} viewCommand={viewCommand} selectionMode={selectionMode} onSelect={select} captureRef={capturePreview} />
        {model?.motions?.length ? <MotionStrip clips={model.motions} revision={model.revision} onPose={setPose}
          sample={(motion, t) => runtime.sampleMotion(motion, t)} coverage={next => poseCoverage(model.mesh, next)} /> : null}
        <div className="viewport-caption"><span>{model?.name ?? workspaceTitle}</span><span>{ghosted ? 'Last good model · the current draft does not build' : displayRevision !== sourceRevision && model ? 'Last valid model · source changed' : model ? 'Compiled geometry' : 'Waiting for geometry'}</span></div>
        {welcomeHint && <div className="workflow-hint"><span><b>Source → Build → Geometry</b> Edit on the left. Ctrl+Enter builds. Drag to orbit; scroll to zoom.</span><button aria-label="Dismiss workflow hint" onClick={() => { setWelcomeHint(false); localStorage.setItem('helios-workflow-understood', '1'); }}>×</button></div>}
        </div>
      </div>
      <aside className="utility-dock" aria-label="Utility panel">
        <div className="dock-tabs" role="tablist" aria-label="Utilities">{([['files', 'Files'], ['inspector', 'Inspector'], ['examples', 'Examples'], ['llm', 'AI Author']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={utilityTab.kind === id} className={utilityTab.kind === id ? 'active' : ''} onClick={() => setUtilityTab({ kind: id })}>{label}</button>)}</div>
        <div className="utility-content">
          {matchKind(utilityTab, {
            files: () => <><ProjectExplorer projectName={workspaceTitle} fileName={sourceName} dirty={dirtyFiles.has(sourceName)} dirtyFiles={dirtyFiles} documents={projectFileNames.length ? projectFileNames : [sourceName]} cloud={!!project} onSelectFile={projectFileNames.length ? switchFile : undefined} onOpen={() => fileInput.current?.click()} onNew={() => loadSample('new')} onReveal={() => sourcePanel.current?.focusAt()} /><ModelTree tree={model?.tree ?? null} selectedId={selectedEntityId} onSelect={id => select(id)} /></>,
            inspector: () => <><ModelTree tree={model?.tree ?? null} selectedId={selectedEntityId} onSelect={id => select(id)} /><Inspector model={model} schema={semanticSchema} projection={fieldProjection} projectionCurrent={source === model?.source} entityId={selectedEntityId} faceId={selectedFaceId} selection={selectedSelection} diagnostics={diagnostics} onApply={applyProperty} onRewriteField={rewriteField} onGoToSource={navigateSource} onReferenceFace={referenceFace} onReferenceHoleWall={referenceHoleWall} /></>,
            examples: () => <div className="dock-gallery"><ExampleGallery onOpen={id => void openExample(id)} opening={openingExample} unavailableReason={busy ? "A project operation is running. Open another example when it finishes." : undefined} /></div>,
            llm: () => <AuthorPanel />,
          })}
        </div>
      </aside>
      <div className="bottom-region"><ResizeHandle axis="vertical" label="Resize bottom panel" value={shellLayout.bottomPixels} onResize={shellLayout.resizeBottom} /><BottomDock collapsed={!shellLayout.bottomOpen} onToggle={() => shellLayout.setBottomOpen(value => !value)} diagnostics={shownDiagnostics} busy={busy} sourceName={sourceName} sourceRevision={sourceRevision} displayRevision={displayRevision} lastTiming={lastTiming} events={phaseTiming ? [...outputEvents, phaseTiming] : outputEvents} onDiagnosticClick={diagnostic => { if (diagnostic.source) navigateSource(diagnostic.source); }} /></div>
    </main>
    <WorkspaceStatus busy={busy} elapsed={elapsedSeconds} runtimeName={runtimeName} model={model} sourceRevision={sourceRevision} displayRevision={displayRevision} diagnostics={shownDiagnostics} timing={lastTiming} theme={theme} viewMode={viewMode} onRestart={() => { void buildClient.restart().then(() => submitBuild(source, sourceName)).catch(error => setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER-RESTART')])); }} />
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

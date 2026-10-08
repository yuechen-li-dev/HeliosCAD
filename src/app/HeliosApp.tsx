import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, ModelSession, SelectionDescription, SemanticSchema, UnitValue } from '@aetheris/cad';
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

type UtilityTab = { kind: 'files' } | { kind: 'inspector' } | { kind: 'examples' } | { kind: 'llm' };

export function HeliosApp({ project, initialWorkspace, onShowcase, onSave, onPublish, onBack, onSignOut }: { project?: Project; initialWorkspace?: WorkspaceProject; onShowcase?: () => void; onSave?: (source: string) => Promise<void>; onPublish?: (payload: { expectedRevisionId: string; title: string; description: string; category: string; tags: string[]; previewPngBase64: string }) => Promise<void>; onBack?: () => void; onSignOut?: () => void } = {}) {
  const [runtime] = useState(() => new WebSdkCadRuntime());
  const [buildClient] = useState(() => new AetherisWorkerClient(runtime));
  const shellLayout = useShellLayout();
  const [model, setModel] = useState<ModelSession | null>(null);
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
  const capturePreview = useRef<(() => string) | null>(null);
  const shownDiagnostics = [...liveDiagnostics, ...diagnostics.filter(item => !liveDiagnostics.some(live =>
    live.code === item.code && live.source?.start === item.source?.start))];
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
      setLastTiming({ label: 'WORKER BUILD', milliseconds: result.milliseconds });
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
    finally { setLastTiming({ label: 'PROPERTY REBUILD', milliseconds: performance.now() - started }); setBusy(value => value === 'Building' ? null : value); }
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
      setLastTiming({ label: 'SOURCE REBUILD', milliseconds: performance.now() - started });
      return success;
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-FIELD-REWRITE')]); if (isWorkerFailure(error)) setBusy('Worker failed'); return false; }
    finally { setBusy(value => value === 'Rewriting source' ? null : value); }
  };
  const exportStep = async () => {
    const started = performance.now();
    const revision = sourceRevisionRef.current;
    if (displayRevision !== revision || buildStarted !== null) {
      if (!await submitBuild(source, sourceName, revision)) return;
    }
    if (revision !== sourceRevisionRef.current) return;
    setBusy('Exporting');
    pushOutput(`STEP export started · ${sourceName}`);
    try { const bytes = await runtime.exportSTEP(); if (revision !== sourceRevisionRef.current) return; downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: 'model/step' }), `${stripExtension(sourceName)}.step`); setLastTiming({ label: 'STEP DOWNLOAD STARTED', milliseconds: performance.now() - started }); pushOutput(`STEP download started · ${bytes.length} bytes · ${(performance.now() - started).toFixed(0)} ms`); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-EXPORT')]); pushOutput(`STEP export failed · ${error instanceof Error ? error.message : String(error)}`); if (isWorkerFailure(error)) setBusy('Worker failed'); }
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
      return entry ? [{ id: `new-${kind.toLowerCase()}`, label: `New ${kind} Model`, detail: `Open the Aetheris ${kind} entry template`, run: () => newDocument(entry, `${kind.toLowerCase()}.firmament`) }] : [];
    }),
    { id: 'insert-hole', label: 'Insert Hole', detail: 'Append a centered through hole', run: addHole },
    { id: 'rebuild', label: 'Rebuild Model', detail: 'Ctrl+Enter', run: () => void rebuildSource() },
    { id: 'format', label: 'Format Document', detail: 'Aetheris canonical formatter', run: () => void sourcePanel.current?.formatDocument() },
    ...(model?.mesh.schema !== 'aetheris/scene-display-mesh/1' ? [{ id: 'export', label: 'Export STEP', run: () => void exportStep() }] : []),
    { id: 'save', label: 'Save', detail: onSave ? 'Save project source' : 'Download Firmament source', run: () => onSave ? void save() : downloadSource() },
    { id: 'open', label: 'Open File', run: () => fileInput.current?.click() },
    { id: 'new', label: 'New Firmament File', detail: 'Start a new single-file model', run: () => loadSample('new') },
    { id: 'assembly', label: 'Open Assembly Example', run: () => loadSample('assembly') },
    { id: 'source', label: 'Go to Source', run: goToSource },
    ...(['front', 'top', 'right', 'iso', 'fit', 'fitselection'] as const).map(view => ({ id: view, label: `${view === 'iso' ? 'Isometric' : view === 'fitselection' ? 'Fit Selection' : view[0].toUpperCase() + view.slice(1)} View`, run: () => view === 'fit' || view === 'fitselection' ? setViewCommand(`${view}-${Date.now()}`) : namedView(view) }))
  ];

  return <div className={`helios-app${project ? ' cloud-mode' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => project ? location.assign('/') : onShowcase ? onShowcase() : setExamplesOpen(true)} aria-label="Helios home"><span className="helios-symbol">H</span><div><strong>HELIOS</strong><small>by Aetheris</small></div></button>
      <div className="workspace-identity"><strong>{workspaceTitle}</strong><small>{project ? 'Saved project' : 'Local workspace'} · Firmament</small></div>
      <nav className="workspace-tabs" aria-label="Workspace"><button onClick={() => setExamplesOpen(true)}>Examples</button><button onClick={() => fileInput.current?.click()}>Open File</button><button title="Download the active Firmament document · Ctrl+S" onClick={() => onSave ? void save() : downloadSource()}>Save source</button><button className="build-action" disabled={buildStarted !== null || !!busy} title="Build project · Ctrl+Enter" onClick={() => void rebuildSource()}>{buildStarted !== null ? `Building · ${elapsedSeconds.toFixed(1)}s` : 'Build'}</button>{model?.mesh.schema !== 'aetheris/scene-display-mesh/1' && <button disabled={!model || !!busy} onClick={() => void exportStep()}>Export STEP</button>}</nav>
      <div className="toolbar">
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}>⌕ <span>Command Palette</span><kbd>Ctrl+Shift+P</kbd></button>
      </div>
      <div className="top-actions"><button title="Toggle utility dock" aria-label="Toggle utility dock" aria-pressed={shellLayout.utilityOpen} onClick={() => shellLayout.setUtilityOpen(value => !value)}>▥</button><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as ThemeName)}><option value="mars">Mars</option><option value="sirius">Sirius</option></select></div>
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
        <SourcePanel ref={sourcePanel} disabled={!!busy} fileName={sourceName} dirty={dirtyFiles.has(sourceName)} source={source} diagnostics={shownDiagnostics.filter(item => !item.source || item.source.source === sourceName)} runtime={runtime} model={model} selectedSelector={selectedSelection?.selector} theme={theme} onSourceChange={value => editSource(value)} onCursorChange={onSourceCursor} onRebuild={() => void rebuildSource()} onLiveDiagnostics={setLiveDiagnostics} onLanguageError={error => { setDiagnostics([toDiagnostic(error, 'FIRMAMENT-FORMAT')]); pushOutput(`Format refused · ${error instanceof Error ? error.message : String(error)}`); }} onDiagnosticClick={diagnostic => { if (diagnostic.source) setSelectedEntityId(null); }} />
        <ResizeHandle axis="horizontal" label="Resize source and viewport" value={shellLayout.editorPercent} onResize={shellLayout.resizeEditor} />
        <div className="viewport-pane">
        <div className="viewport-toolbar">
          <div><button title="Front view" onClick={() => namedView('front')}>Front</button><button title="Top view" onClick={() => namedView('top')}>Top</button><button title="Right view" onClick={() => namedView('right')}>Right</button><button title="Isometric view" onClick={() => namedView('iso')}>Iso</button><button title="Fit model · F" onClick={() => setViewCommand(`fit-${Date.now()}`)}>Fit</button><button title="Fit selection" disabled={!selectedEntityId} onClick={() => setViewCommand(`fitselection-${Date.now()}`)}>Fit selection</button></div>
          <div><select aria-label="Display mode" value={displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)}><option value="shaded">Shaded</option><option value="edges">Shaded with edges</option><option value="wireframe">Wireframe</option></select><button aria-label="Selection mode" title="Switch face or edge selection" onClick={() => { setSelectionMode(value => value === 'face' ? 'edge' : 'face'); setDisplayMode('edges'); }}>{selectionMode === 'face' ? 'Faces' : 'Edges'}</button><button title="Toggle camera projection" onClick={() => setViewMode(value => value === 'perspective' ? 'orthographic' : 'perspective')}>{viewMode === 'perspective' ? 'Perspective' : 'Orthographic'}</button></div>
        </div>
        <Viewport busyMessage={busy === 'Worker failed' ? null : busy} errorMessage={shownDiagnostics.some(item => item.severity === 'error') ? (model ? 'Build failed. The last valid model remains visible; see Problems for details.' : 'Build needs attention. See Problems for the compiler diagnostic.') : null} model={model} selectedEntityId={selectedEntityId} selectedTopologyId={selectedFaceId} theme={theme} displayMode={displayMode} viewMode={viewMode} viewCommand={viewCommand} selectionMode={selectionMode} onSelect={select} captureRef={capturePreview} />
        <div className="viewport-caption"><span>{model?.name ?? workspaceTitle}</span><span>{displayRevision !== sourceRevision && model ? 'Last valid model · source changed' : model ? 'Compiled geometry' : 'Waiting for geometry'}</span></div>
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

function stripExtension(name: string) { return name.replace(/\.[^.]+$/, ''); }
function snapshotSession(session: ModelSession | null) { return session ? Object.assign(Object.create(Object.getPrototypeOf(session)), session) as ModelSession : null; }
function isTyping(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof Node && !!(target as Element).parentElement?.closest('.monaco-editor'); }
function toDiagnostic(error: unknown, code: string): Diagnostic { return { severity: 'error', code, message: error instanceof Error ? error.message : String(error), details: error instanceof Error && 'details' in error && typeof error.details === 'string' ? error.details : undefined }; }
function isWorkerFailure(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && ['worker-error', 'worker-message-error', 'worker-terminated', 'worker-protocol', 'worker-revision'].includes(String(error.code)); }
function downloadText(value: string, name: string) { downloadBlob(new Blob([value], { type: 'text/plain' }), name); }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }

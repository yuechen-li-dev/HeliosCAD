import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConstructProjection, Diagnostic, EditableProperty, FieldProjection, ModelSession, SelectionDescription, SemanticSchema, UnitValue } from '@aetheris/cad';
import { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { AetherisWorkerClient, type BuildResult } from '../sdk/AetherisWorkerClient';
import { assemblySource, bracketSource, emptyModelSource } from '../sdk/samples';
import { appendCenteredHole, appendFaceDatum, appendHoleWallDiameter, insertBox } from '../commands/sourceAuthoring';
import { CommandPalette, type PaletteCommand } from '../commands/CommandPalette';
import { ProjectExplorer } from '../explorer/ProjectExplorer';
import { Inspector } from '../inspector/Inspector';
import { SourcePanel, type SourcePanelHandle } from '../source/SourcePanel';
import { Viewport } from '../viewport/Viewport';
import type { BusyState, DisplayMode, ThemeName, ViewMode } from './types';
import type { Project } from '../cloud/api';

const runtime = new WebSdkCadRuntime();
const buildClient = new AetherisWorkerClient(runtime);

export function HeliosApp({ project, onSave, onPublish, onBack, onSignOut }: { project?: Project; onSave?: (source: string) => Promise<void>; onPublish?: (payload: { expectedRevisionId: string; title: string; description: string; category: string; tags: string[]; previewPngBase64: string }) => Promise<void>; onBack?: () => void; onSignOut?: () => void } = {}) {
  const [model, setModel] = useState<ModelSession | null>(null);
  const [semanticSchema, setSemanticSchema] = useState<SemanticSchema | null>(null);
  const [fieldProjection, setFieldProjection] = useState<ConstructProjection | null>(null);
  const [source, setSource] = useState(project?.source ?? bracketSource);
  const [sourceName, setSourceName] = useState(project ? `${project.name}.firmament` : 'editable-bracket.firmament');
  const [saveState, setSaveState] = useState('Saved');
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
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
  const [theme, setTheme] = useState<ThemeName>(() => localStorage.getItem('helios-theme') === 'sirius' ? 'sirius' : 'mars');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('edges');
  const [selectionMode, setSelectionMode] = useState<'face' | 'edge'>('face');
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');
  const [viewCommand, setViewCommand] = useState('fit');
  const [runtimeName, setRuntimeName] = useState('WASM');
  const [lastTiming, setLastTiming] = useState<{ label: string; milliseconds: number } | null>(null);
  const [phaseTiming, setPhaseTiming] = useState<string | null>(null);
  const [history, setHistory] = useState([bracketSource]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourcePanel = useRef<SourcePanelHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishState, setPublishState] = useState('');
  const capturePreview = useRef<(() => string) | null>(null);
  const namedView = (view: 'front' | 'top' | 'right' | 'iso') => {
    setViewMode(view === 'iso' ? 'perspective' : 'orthographic');
    setViewCommand(`${view}-${Date.now()}`);
  };

  const editSource = (value: string, name = sourceName) => {
    sourceRevisionRef.current++;
    setSourceRevision(sourceRevisionRef.current);
    setSource(value);
    setSourceName(name);
    setSaveState('Unsaved');
    setDiagnostics([]);
  };

  const acceptBuild = (result: BuildResult) => {
    if (result.status === 'superseded' || result.request.sourceRevision !== sourceRevisionRef.current) return;
    setDiagnostics(result.diagnostics);
    if (result.status === 'completed' && result.model) {
      const snapshot = snapshotSession(result.model);
      setModel(snapshot);
      setDisplayRevision(result.request.sourceRevision);
      setSelectedEntityId(snapshot?.tree.rootId ?? null);
      setSelectedFaceId(null); setSelectedSelection(null);
      setViewCommand(`fit-${Date.now()}`);
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
    const result = await buildClient.submit(value, name, revision);
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
    await submitBuild(nextSource, nextName, sourceRevisionRef.current);
  }, [source, sourceName]);

  useEffect(() => { void submitBuild(project?.source ?? bracketSource, project ? `${project.name}.firmament` : 'editable-bracket.firmament', 0); void runtime.schema().then(setSemanticSchema).catch(error => setDiagnostics([toDiagnostic(error, 'HELIOS-LANGUAGE')])); return () => { void runtime.dispose(); }; }, []);
  useEffect(() => { if (buildStarted === null) return; const timer = setInterval(() => setElapsedSeconds((performance.now() - buildStarted) / 1000), 250); return () => clearInterval(timer); }, [buildStarted]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('helios-theme', theme); }, [theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (onSave) void save(); else downloadText(source, sourceName); }
      if (((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') || event.key === 'F1') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) setViewCommand(`fit-${Date.now()}`);
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [source, sourceName, onSave]);

  const save = async () => {
    if (!onSave) return;
    setSaveState('Saving…');
    try { await onSave(source); setSaveState('Saved'); }
    catch (error) { setSaveState(error instanceof Error ? error.message : 'Save failed'); }
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
    if (await submitBuild(source, sourceName)) commitHistory(source);
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
      if (success) { commitHistory(rewrite.source); select(selectedEntityId); }
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
    try { const bytes = await runtime.exportSTEP(); if (revision !== sourceRevisionRef.current) return; downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: 'model/step' }), `${stripExtension(sourceName)}.step`); setLastTiming({ label: 'STEP DOWNLOAD STARTED', milliseconds: performance.now() - started }); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-EXPORT')]); if (isWorkerFailure(error)) setBusy('Worker failed'); }
    finally { setBusy(value => value === 'Exporting' ? null : value); }
  };
  const commitHistory = (value: string) => { const next = [...history.slice(0, historyIndex + 1), value]; setHistory(next); setHistoryIndex(next.length - 1); };
  const navigateHistory = (delta: number) => { const index = Math.max(0, Math.min(history.length - 1, historyIndex + delta)); setHistoryIndex(index); editSource(history[index]); };
  const loadSample = (kind: 'part' | 'assembly' | 'new') => {
    const value = kind === 'assembly' ? assemblySource : kind === 'new' ? emptyModelSource : bracketSource;
    const name = kind === 'assembly' ? 'shared-block-assembly.firmament' : kind === 'new' ? 'untitled.firmament' : 'editable-bracket.firmament';
    setHistory([value]); setHistoryIndex(0); void open(value, name);
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
  const goToSource = () => { const entity = selectedEntityId ? model?.entity(selectedEntityId) : undefined; if (entity?.source) sourcePanel.current?.focusAt(entity.source); };
  const onSourceCursor = (offset: number) => {
    const candidates = model?.tree.nodes.filter(node => node.source && node.source.source === sourceName && offset >= node.source.start && offset <= node.source.start + node.source.length) ?? [];
    const closest = candidates.sort((a, b) => (a.source?.length ?? Infinity) - (b.source?.length ?? Infinity))[0];
    if (closest && (closest.id !== selectedEntityId || selectedFaceId)) select(closest.id);
  };
  const paletteCommands: PaletteCommand[] = [
    { id: 'insert-box', label: 'Insert Box', detail: 'Insert a 30 × 20 × 10 mm Box inside Model', run: addBox },
    ...(['Helix', 'Loft'] as const).flatMap(kind => {
      const entry = semanticSchema?.constructs.find(item => item.id === kind)?.entry;
      return entry ? [{ id: `new-${kind.toLowerCase()}`, label: `New ${kind} Model`, detail: `Open the Aetheris ${kind} entry template`, run: () => { setHistory([entry]); setHistoryIndex(0); void open(entry, `${kind.toLowerCase()}.firmament`); } }] : [];
    }),
    { id: 'insert-hole', label: 'Insert Hole', detail: 'Append a centered through hole', run: addHole },
    { id: 'rebuild', label: 'Rebuild Model', detail: 'Ctrl+Enter', run: () => void rebuildSource() },
    { id: 'export', label: 'Export STEP', run: () => void exportStep() },
    { id: 'save', label: 'Save', detail: onSave ? 'Save project source' : 'Download Firmament source', run: () => onSave ? void save() : downloadText(source, sourceName) },
    { id: 'open', label: 'Open File', run: () => fileInput.current?.click() },
    { id: 'new', label: 'New Firmament File', detail: 'Start a new single-file model', run: () => loadSample('new') },
    { id: 'assembly', label: 'Open Assembly Example', run: () => loadSample('assembly') },
    { id: 'source', label: 'Go to Source', run: goToSource },
    ...(['front', 'top', 'right', 'iso', 'fit', 'fitselection'] as const).map(view => ({ id: view, label: `${view === 'iso' ? 'Isometric' : view === 'fitselection' ? 'Fit Selection' : view[0].toUpperCase() + view.slice(1)} View`, run: () => view === 'fit' || view === 'fitselection' ? setViewCommand(`${view}-${Date.now()}`) : namedView(view) }))
  ];

  return <div className={`helios-app${project ? ' cloud-mode' : ''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">H</span><div><strong>HELIOS</strong><small>by Aetheris</small></div></div>
      <nav className="workspace-tabs" aria-label="Workspace"><button onClick={() => fileInput.current?.click()}>Open File</button><button onClick={() => sourcePanel.current?.focusAt()}>Edit Source</button><button onClick={() => setViewCommand(`fit-${Date.now()}`)}>Fit View</button><button onClick={() => void rebuildSource()}>Rebuild</button><button onClick={() => void exportStep()}>Export STEP</button></nav>
      <div className="toolbar">
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}>⌕ <span>Command Palette</span><kbd>Ctrl+Shift+P</kbd></button>
      </div>
      <div className="top-actions"><button onClick={() => navigateHistory(-1)} disabled={historyIndex === 0} title="Undo">↶</button><button onClick={() => navigateHistory(1)} disabled={historyIndex === history.length - 1} title="Redo">↷</button><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as ThemeName)}><option value="mars">Mars</option><option value="sirius">Sirius</option></select></div>
      <input ref={fileInput} hidden type="file" accept=".firmament,.txt" onChange={async event => { const file = event.target.files?.[0]; if (file) { const value = await file.text(); setHistory([value]); setHistoryIndex(0); void open(value, file.name); } }} />
    </header>
    {project && <div className="cloud-project-bar"><button onClick={() => { if (saveState === 'Saved' || confirm('Leave this project with unsaved source?')) onBack?.(); }}>← Discover</button><strong>{project.name}</strong><span className="cloud-save-state" role="status">{saveState}</span><div className="cloud-editor-actions"><button className="cloud-save" onClick={() => void save()}>Save</button>{onPublish && <button onClick={() => { setPublishState(''); setPublishOpen(true); }}>Publish</button>}<button onClick={() => downloadText(source, sourceName)}>Download source</button><button onClick={() => { if (saveState === 'Saved' || confirm('Sign out with unsaved source?')) onSignOut?.(); }}>Sign out</button></div></div>}
    <main className="workspace">
      <ProjectExplorer projectName={project?.name ?? 'Local workspace'} fileName={sourceName} dirty={saveState !== 'Saved'} onOpen={() => fileInput.current?.click()} onNew={() => loadSample('new')} onReveal={() => sourcePanel.current?.focusAt()} />
      <div className="center-stack">
        <div className="viewport-toolbar">
          <div><button onClick={() => namedView('front')}>FRONT</button><button onClick={() => namedView('top')}>TOP</button><button onClick={() => namedView('right')}>RIGHT</button><button onClick={() => namedView('iso')}>ISO</button><button onClick={() => setViewCommand(`fit-${Date.now()}`)}>FIT</button><button onClick={() => setViewCommand(`fitselection-${Date.now()}`)}>FIT SEL</button></div>
          <div><select aria-label="Display mode" value={displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)}><option value="shaded">Shaded</option><option value="edges">Shaded with edges</option><option value="wireframe">Wireframe</option></select><button aria-label="Selection mode" onClick={() => { setSelectionMode(value => value === 'face' ? 'edge' : 'face'); setDisplayMode('edges'); }}>{selectionMode === 'face' ? 'PICK FACE' : 'PICK EDGE'}</button><button onClick={() => setViewMode(value => value === 'perspective' ? 'orthographic' : 'perspective')}>{viewMode === 'perspective' ? 'PERSP' : 'ORTHO'}</button></div>
        </div>
        <Viewport model={model} selectedEntityId={selectedEntityId} selectedTopologyId={selectedFaceId} theme={theme} displayMode={displayMode} viewMode={viewMode} viewCommand={viewCommand} selectionMode={selectionMode} onSelect={select} captureRef={capturePreview} />
        <SourcePanel ref={sourcePanel} fileName={sourceName} dirty={saveState !== 'Saved'} source={source} diagnostics={diagnostics} runtime={runtime} model={model} selectedSelector={selectedSelection?.selector} theme={theme} onSourceChange={value => editSource(value)} onCursorChange={onSourceCursor} onRebuild={() => void rebuildSource()} onDiagnosticClick={diagnostic => { if (diagnostic.source) setSelectedEntityId(null); }} />
      </div>
      <Inspector model={model} schema={semanticSchema} projection={fieldProjection} projectionCurrent={source === model?.source} entityId={selectedEntityId} faceId={selectedFaceId} selection={selectedSelection} diagnostics={diagnostics} onApply={applyProperty} onRewriteField={rewriteField} onGoToSource={reference => sourcePanel.current?.focusAt(reference)} onReferenceFace={referenceFace} onReferenceHoleWall={referenceHoleWall} />
    </main>
    <footer className="statusbar"><span className="status-ready" role="status"><i />{busy ?? (model ? 'READY' : 'NO MODEL')}{buildStarted !== null ? ` ${elapsedSeconds.toFixed(1)}s` : ''}</span><span>{runtimeName}</span><span>SOURCE REV {sourceRevision} · DISPLAY REV {displayRevision ?? '—'}</span>{displayRevision !== sourceRevision && model && <span>MODEL OUT OF DATE</span>}<span>{model?.mesh.definitions.length ?? 0} DEFS · {model?.mesh.occurrences.length ?? 0} OCC</span><span className={diagnostics.length ? 'has-diagnostics' : ''}>{diagnostics.length ? `⚠ ${diagnostics.length}` : '✓ 0'} DIAGNOSTICS</span>{lastTiming && <span>{lastTiming.label} {lastTiming.milliseconds.toFixed(0)}MS</span>}{phaseTiming && <span title="Last successful Worker build phases">{phaseTiming}</span>}<span className="status-selection">{selectedEntityId ? `${model?.entity(selectedEntityId)?.name ?? selectedEntityId}${selectedFaceId ? ` · ${selectedFaceId}` : ''}` : 'NO SELECTION'}</span><span>{viewMode.toUpperCase()}</span><span>{theme.toUpperCase()}</span>{busy === 'Worker failed' && <button onClick={() => { void buildClient.restart().then(() => submitBuild(source, sourceName)).catch(error => setDiagnostics([toDiagnostic(error, 'HELIOS-WORKER-RESTART')])); }}>Restart Worker</button>}</footer>
    {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
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

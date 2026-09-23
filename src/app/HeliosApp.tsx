import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diagnostic, EditableProperty, ModelSession, SelectionDescription, UnitValue } from '@aetheris/cad';
import { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { assemblySource, bracketSource, emptyModelSource } from '../sdk/samples';
import { appendCenteredHole, appendFaceDatum, appendHoleWallDiameter, helixModelSource, insertBox } from '../commands/sourceAuthoring';
import { CommandPalette, type PaletteCommand } from '../commands/CommandPalette';
import { ProjectExplorer } from '../explorer/ProjectExplorer';
import { Inspector } from '../inspector/Inspector';
import { SourcePanel, type SourcePanelHandle } from '../source/SourcePanel';
import { Viewport } from '../viewport/Viewport';
import type { BusyState, DisplayMode, ThemeName, ViewMode } from './types';
import type { Project } from '../cloud/api';

const runtime = new WebSdkCadRuntime();

export function HeliosApp({ project, onSave, onBack, onSignOut }: { project?: Project; onSave?: (source: string) => Promise<void>; onBack?: () => void; onSignOut?: () => void } = {}) {
  const [model, setModel] = useState<ModelSession | null>(null);
  const [source, setSource] = useState(project?.source ?? bracketSource);
  const [sourceName, setSourceName] = useState(project ? `${project.name}.firmament` : 'editable-bracket.firmament');
  const [saveState, setSaveState] = useState('Saved');
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [selectedSelection, setSelectedSelection] = useState<SelectionDescription | null>(null);
  const [busy, setBusy] = useState<BusyState>('Initializing Aetheris');
  const [theme, setTheme] = useState<ThemeName>(() => localStorage.getItem('helios-theme') === 'sirius' ? 'sirius' : 'mars');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('edges');
  const [selectionMode, setSelectionMode] = useState<'face' | 'edge'>('face');
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');
  const [viewCommand, setViewCommand] = useState('fit');
  const [runtimeName, setRuntimeName] = useState('WASM');
  const [lastTiming, setLastTiming] = useState<{ label: string; milliseconds: number } | null>(null);
  const [history, setHistory] = useState([bracketSource]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourcePanel = useRef<SourcePanelHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const namedView = (view: 'front' | 'top' | 'right' | 'iso') => {
    setViewMode(view === 'iso' ? 'perspective' : 'orthographic');
    setViewCommand(`${view}-${Date.now()}`);
  };

  const open = useCallback(async (nextSource: string, nextName: string) => {
    const started = performance.now();
    setSource(nextSource); setSourceName(nextName);
    setBusy(model ? 'Compiling' : 'Initializing Aetheris');
    try {
      const result = await runtime.open(nextSource, nextName);
      setRuntimeName(runtime.info ? `WASM · ${runtime.info.packageVersion}` : 'WASM');
      setModel(result.model); setDiagnostics(result.diagnostics);
      setSelectedEntityId(result.model?.tree.rootId ?? null); setSelectedFaceId(null); setSelectedSelection(null); setViewCommand(`fit-${Date.now()}`);
    } catch (error) {
      setDiagnostics([toDiagnostic(error, 'HELIOS-INIT')]);
    } finally { setLastTiming({ label: model ? 'COMPILE' : 'INIT+COMPILE', milliseconds: performance.now() - started }); setBusy(null); }
  }, [model]);

  useEffect(() => { void open(project?.source ?? bracketSource, project ? `${project.name}.firmament` : 'editable-bracket.firmament'); return () => { void runtime.dispose(); }; }, []);
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
  const rebuildSource = async () => {
    if (!model) return;
    const started = performance.now();
    setBusy('Rebuilding');
    try {
      const result = await runtime.setSource(source, sourceName);
      setDiagnostics(result.diagnostics); setModel(snapshotSession(runtime.session()));
      if (result.success) { commitHistory(source); select(runtime.session()?.tree.rootId ?? null); }
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-REBUILD')]); }
    finally { setLastTiming({ label: 'SOURCE REBUILD', milliseconds: performance.now() - started }); setBusy(null); }
  };
  const applyProperty = async (property: EditableProperty, value: UnitValue) => {
    const started = performance.now();
    setBusy('Rebuilding');
    try {
      const result = await runtime.setProperty(property.id, value);
      setDiagnostics(result.diagnostics); setModel(snapshotSession(runtime.session()));
      if (result.success) select(runtime.session()?.tree.rootId ?? null);
      return result.success;
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-PROPERTY')]); return false; }
    finally { setLastTiming({ label: 'PROPERTY REBUILD', milliseconds: performance.now() - started }); setBusy(null); }
  };
  const exportStep = async () => {
    const started = performance.now();
    setBusy('Exporting');
    try { const bytes = await runtime.exportSTEP(); downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: 'model/step' }), `${stripExtension(sourceName)}.step`); setLastTiming({ label: 'STEP DOWNLOAD STARTED', milliseconds: performance.now() - started }); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-EXPORT')]); }
    finally { setBusy(null); }
  };
  const commitHistory = (value: string) => { const next = [...history.slice(0, historyIndex + 1), value]; setHistory(next); setHistoryIndex(next.length - 1); };
  const navigateHistory = (delta: number) => { const index = Math.max(0, Math.min(history.length - 1, historyIndex + delta)); setHistoryIndex(index); setSource(history[index]); };
  const loadSample = (kind: 'part' | 'assembly' | 'new') => {
    const value = kind === 'assembly' ? assemblySource : kind === 'new' ? emptyModelSource : bracketSource;
    const name = kind === 'assembly' ? 'shared-block-assembly.firmament' : kind === 'new' ? 'untitled.firmament' : 'editable-bracket.firmament';
    setHistory([value]); setHistoryIndex(0); setSaveState('Unsaved'); void open(value, name);
  };
  const addHole = () => {
    try { const target = model?.tree.nodes.find(node => ['Box', 'Part'].includes(node.kind))?.name ?? 'Body'; setSource(appendCenteredHole(source, target)); setSaveState('Unsaved'); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const addBox = () => {
    try { const cursor = sourcePanel.current?.cursor() ?? -1; const result = insertBox(source, cursor < 0 ? source.lastIndexOf('}') : cursor); setSource(result.source); setSaveState('Unsaved'); requestAnimationFrame(() => sourcePanel.current?.focusAt({ source: sourceName, start: result.selection, length: 4, line: 1, column: 1 })); }
    catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const referenceFace = () => {
    try {
      if (!selectedSelection?.selector) return;
      const result = appendFaceDatum(source, selectedSelection.selector);
      setSource(result.source); setSaveState('Unsaved');
      requestAnimationFrame(() => sourcePanel.current?.focusAt({ source: sourceName, start: result.selection, length: selectedSelection.selector!.length, line: 1, column: 1 }));
    } catch (error) { setDiagnostics([toDiagnostic(error, 'HELIOS-AUTHOR')]); }
  };
  const referenceHoleWall = () => {
    try {
      if (selectedSelection?.outputRole !== 'HoleWallFace' || !selectedSelection.selector) return;
      const diameterMm = selectedEntityId ? model?.entity(selectedEntityId)?.holeDiameterMm : null;
      if (diameterMm == null) throw new Error('The selected Hole has no compiled shaft diameter.');
      const result = appendHoleWallDiameter(source, selectedSelection.selector, diameterMm);
      setSource(result.source); setSaveState('Unsaved');
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
    { id: 'new-helix', label: 'New Helix Model', detail: 'Open a valid formed-wire Helix example', run: () => { setHistory([helixModelSource]); setHistoryIndex(0); setSaveState('Unsaved'); void open(helixModelSource, 'helix.firmament'); } },
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
    {project && <div className="cloud-project-bar"><button onClick={() => { if (saveState === 'Saved' || confirm('Leave this project with unsaved source?')) onBack?.(); }}>← Projects</button><strong>{project.name}</strong><span className="cloud-save-state" role="status">{saveState}</span><div className="cloud-editor-actions"><button className="cloud-save" onClick={() => void save()}>Save</button><button onClick={() => downloadText(source, sourceName)}>Download source</button><button onClick={() => { if (saveState === 'Saved' || confirm('Sign out with unsaved source?')) onSignOut?.(); }}>Sign out</button></div></div>}
    <main className="workspace">
      <ProjectExplorer projectName={project?.name ?? 'Local workspace'} fileName={sourceName} dirty={saveState !== 'Saved'} onOpen={() => fileInput.current?.click()} onNew={() => loadSample('new')} onReveal={() => sourcePanel.current?.focusAt()} />
      <div className="center-stack">
        <div className="viewport-toolbar">
          <div><button onClick={() => namedView('front')}>FRONT</button><button onClick={() => namedView('top')}>TOP</button><button onClick={() => namedView('right')}>RIGHT</button><button onClick={() => namedView('iso')}>ISO</button><button onClick={() => setViewCommand(`fit-${Date.now()}`)}>FIT</button><button onClick={() => setViewCommand(`fitselection-${Date.now()}`)}>FIT SEL</button></div>
          <div><select aria-label="Display mode" value={displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)}><option value="shaded">Shaded</option><option value="edges">Shaded with edges</option><option value="wireframe">Wireframe</option></select><button aria-label="Selection mode" onClick={() => { setSelectionMode(value => value === 'face' ? 'edge' : 'face'); setDisplayMode('edges'); }}>{selectionMode === 'face' ? 'PICK FACE' : 'PICK EDGE'}</button><button onClick={() => setViewMode(value => value === 'perspective' ? 'orthographic' : 'perspective')}>{viewMode === 'perspective' ? 'PERSP' : 'ORTHO'}</button></div>
        </div>
        <Viewport model={model} selectedEntityId={selectedEntityId} selectedTopologyId={selectedFaceId} theme={theme} displayMode={displayMode} viewMode={viewMode} viewCommand={viewCommand} selectionMode={selectionMode} onSelect={select} />
        <SourcePanel ref={sourcePanel} fileName={sourceName} dirty={saveState !== 'Saved'} source={source} diagnostics={diagnostics} disabled={busy !== null} onSourceChange={value => { setSource(value); setSaveState('Unsaved'); }} onCursorChange={onSourceCursor} onRebuild={() => void rebuildSource()} onDiagnosticClick={diagnostic => { if (diagnostic.source) setSelectedEntityId(null); }} />
      </div>
      <Inspector model={model} entityId={selectedEntityId} faceId={selectedFaceId} selection={selectedSelection} diagnostics={diagnostics} onApply={applyProperty} onGoToSource={reference => sourcePanel.current?.focusAt(reference)} onReferenceFace={referenceFace} onReferenceHoleWall={referenceHoleWall} />
    </main>
    <footer className="statusbar"><span className="status-ready"><i />{busy ?? (model ? 'READY' : 'NO MODEL')}</span><span>{runtimeName}</span><span>REV {model?.revision ?? '—'}</span><span>{model?.mesh.definitions.length ?? 0} DEFS · {model?.mesh.occurrences.length ?? 0} OCC</span><span className={diagnostics.length ? 'has-diagnostics' : ''}>{diagnostics.length ? `⚠ ${diagnostics.length}` : '✓ 0'} DIAGNOSTICS</span>{lastTiming && <span>{lastTiming.label} {lastTiming.milliseconds.toFixed(0)}MS</span>}<span className="status-selection">{selectedEntityId ? `${model?.entity(selectedEntityId)?.name ?? selectedEntityId}${selectedFaceId ? ` · ${selectedFaceId}` : ''}` : 'NO SELECTION'}</span><span>{viewMode.toUpperCase()}</span><span>{theme.toUpperCase()}</span></footer>
    {busy && <div className="busy-overlay" role="status"><span className="spinner" />{busy}</div>}
    {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
  </div>;
}

function stripExtension(name: string) { return name.replace(/\.[^.]+$/, ''); }
function snapshotSession(session: ModelSession | null) { return session ? Object.assign(Object.create(Object.getPrototypeOf(session)), session) as ModelSession : null; }
function isTyping(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; }
function toDiagnostic(error: unknown, code: string): Diagnostic { return { severity: 'error', code, message: error instanceof Error ? error.message : String(error), details: error instanceof Error && 'details' in error && typeof error.details === 'string' ? error.details : undefined }; }
function downloadText(value: string, name: string) { downloadBlob(new Blob([value], { type: 'text/plain' }), name); }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }

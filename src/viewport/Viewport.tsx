import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useMemo,
  type MutableRefObject,
} from "react";
import {
  TelosHost,
  fromDisplayMesh,
  clearColor,
  inspectSurfaces,
  inspectionFaceKey,
  surfaceInspectionFaces,
  type SurfaceInspectionMode,
  type TelosScene,
  type TelosMesh,
} from "@aetheris/three-telos";
import type { ModelSession, SelectionDescription } from "@aetheris/cad";
import type { DisplayMode, ThemeName, ViewMode } from "../app/types";
import { HELIOS_PRESENTATIONS } from "./presentation";
const LegacyViewport = lazy(() =>
  import("./LegacyViewport").then((module) => ({
    default: module.LegacyViewport,
  })),
);

interface Props {
  busyMessage?: string | null;
  errorMessage?: string | null;
  aaMode?: import("@aetheris/three-telos").TelosAAMode;
  aaDebug?: import("@aetheris/three-telos").TelosAADebug;
  model: ModelSession | null;
  selectedEntityId: string | null;
  selectedTopologyId: string | null;
  theme: ThemeName;
  displayMode: DisplayMode;
  viewMode: ViewMode;
  viewCommand: string;
  selectionMode: "face" | "edge";
  onSelect(
    entityId: string | null,
    faceId: string | null,
    selection?: SelectionDescription | null,
  ): void;
  captureRef?: MutableRefObject<(() => string) | null>;
}

/** Legacy is explicitly transitional and used only when WebGPU is unavailable. */
export function Viewport(props: Props) {
  const [generation, setGeneration] = useState(0);
  if (typeof navigator === "undefined" || !navigator.gpu)
    return (
      <div data-display-host="transitional-webgl">
        <Suspense
          fallback={<div role="status">Preparing browser fallback…</div>}
        >
          <LegacyViewport {...props} />
        </Suspense>
        <small>Transitional WebGL: WebGPU unavailable</small>
      </div>
    );
  return (
    <TelosViewport
      key={generation}
      {...props}
      onRetry={() => setGeneration((value) => value + 1)}
    />
  );
}

function TelosViewport(props: Props & { onRetry(): void }) {
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<TelosHost | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const modelKey = useRef<string | null>(null),
    viewKey = useRef<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authoredCamera, setAuthoredCamera] = useState('');
  const [inspectionMode, setInspectionMode] = useState<SurfaceInspectionMode>("normal");
  const [isolatedFaceKey, setIsolatedFaceKey] = useState("");
  const inspectionFaces = useMemo(() => props.model
    ? surfaceInspectionFaces(fromDisplayMesh(props.model.mesh)) : [], [props.model, props.model?.revision]);
  const isolatedFace = inspectionFaces.find(face => face.key === isolatedFaceKey);
  const inspection = useRef({ mode: inspectionMode, face: isolatedFace });
  inspection.current = { mode: inspectionMode, face: isolatedFace };
  const apply = () => {
    const current = host.current;
    if (!current) return;
    const value = latest.current;
    current.setAA(value.aaMode ?? "SpatialOnly", value.aaDebug ?? "color");
    current.setPresentation(HELIOS_PRESENTATIONS[value.theme]);
    const scene: TelosScene = value.model
      ? fromDisplayMesh(value.model.mesh)
      : { meshes: [], lines: [], fields: [] };
    const selected =
      value.model && value.selectedEntityId
        ? value.model.selectionForEntity(value.selectedEntityId)
        : { occurrenceIds: [], ranges: [] };
    const selectedIds = new Set(selected.occurrenceIds);
    const meshes: TelosMesh[] = scene.meshes.map((mesh) => ({
      ...mesh,
      selected: selectedIds.has(mesh.identity.occurrenceId),
      visible: value.displayMode !== "wireframe",
    }));
    if (
      value.model &&
      value.selectedTopologyId &&
      !value.selectedTopologyId.startsWith("edge:")
    ) {
      for (const mesh of [...scene.meshes, ...scene.fields.filter(f=>f.proxy).map(f=>({definition:f.proxy!, identity:f.identity, transform:f.transform!, material:f.material}))])
        for (const range of mesh.definition.ranges ?? [])
          if (range.faceId === value.selectedTopologyId) {
            meshes.push({
              ...mesh,
              definition: {
                ...mesh.definition,
                id: mesh.definition.id + ":selection:" + range.faceId,
                indices: Array.from(mesh.definition.indices).slice(
                  range.startTriangle * 3,
                  (range.startTriangle + range.triangleCount) * 3,
                ),
              },
              selected: true,
              overlay: true,
            });
          }
    }
    const lines = scene.lines.map((line) => ({
      ...line,
      selected:
        line.identity.edgeId === value.selectedTopologyId ||
        selectedIds.has(line.identity.occurrenceId),
      visible: value.displayMode !== "shaded",
      color:
        value.theme === "mars"
          ? [0.18, 0.22, 0.2, 0.85]
          : [0.3, 0.35, 0.32, 0.85],
    }));
    const displayScene = { ...scene, meshes, lines, fields: scene.fields.map(f=>({...f, selected:selectedIds.has(f.identity.occurrenceId), visible:value.displayMode !== "wireframe"})) };
    current.setScene(inspectSurfaces(inspection.current.mode === "normal" && !inspection.current.face ? displayScene : scene,
      inspection.current.mode, inspection.current.face));
    canvas.current?.setAttribute("data-surface-inspection", JSON.stringify({ mode: inspection.current.mode,
      isolatedFace: inspection.current.face ?? null,
      usesFieldProxy: scene.fields.some(field => field.proxy) && (!!inspection.current.face || inspection.current.mode === "patches"),
      visibleMeshes: current.scene.meshes.filter(mesh => mesh.visible !== false && !mesh.overlay).length,
      visibleFields: current.scene.fields.filter(field => field.visible !== false).length,
      visibleEdges: current.scene.lines.filter(line => line.visible !== false && line.identity.edgeId !== undefined).length }));
    current.grid = true;
    current.gridPlane = "xy";
    current.background = clearColor(
      value.theme === "mars" ? "#111814" : "#e9ece8",
    );
    const key = value.model
      ? value.model.id + ":" + value.model.revision
      : null;
    if (modelKey.current !== key) {
      modelKey.current = key;
      current.fit();
    }
    const view = value.viewMode + ":" + value.viewCommand;
    if (viewKey.current !== view) {
      viewKey.current = view;
      current.camera.mode = value.viewMode;
      const command = value.viewCommand.split("-")[0];
      if (command !== 'authored') setAuthoredCamera('');
      if (command === 'authored' && value.model?.mesh.cameras?.[0]) {
        const camera = value.model.mesh.cameras[0];
        current.camera.applyDisplayCamera(camera); setAuthoredCamera(camera.name);
      }
      const directions: Record<string, [number, number, number]> = {
        front: [0, -1, 0],
        top: [0, 0, 1],
        right: [1, 0, 0],
        iso: [1, 1, 1],
      };
      if (directions[command]) {
        if (command !== "iso") current.camera.mode = "orthographic";
        const distance = Math.max(
          current.camera.position.distanceTo(current.camera.target),
          current.camera.near * 10,
        );
        current.camera.position
          .set(...directions[command])
          .normalize()
          .multiplyScalar(distance)
          .add(current.camera.target);
        current.camera.up.set(
          0,
          command === "top" ? 1 : 0,
          command === "top" ? 0 : 1,
        );
      }
      if (command === "fit") current.fit();
      if (command === "fitselection" && selectedIds.size)
        current.fit(selectedIds);
      current.camera.update();
    }
    current.invalidate();
    if (canvas.current) {
      const state = JSON.parse(canvas.current.getAttribute("data-surface-inspection") ?? "{}");
      canvas.current.setAttribute("data-surface-inspection", JSON.stringify({ ...state,
        camera: { position: current.camera.position.toArray(), target: current.camera.target.toArray(),
          up: current.camera.up.toArray(), span: current.camera.span, mode: current.camera.mode } }));
    }
  };
  useEffect(() => {
    let disposed = false;
    const initialization = new AbortController();
    const element = canvas.current;
    if (!element) return;
    const pixel = (event: MouseEvent): [number, number] => {
      const rect = element.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const click = (event: MouseEvent) => {
      const current = host.current;
      if (!current) return;
      const value = latest.current,
        hit = current.picker.pick(pixel(event), value.selectionMode);
      element.setAttribute("data-surface-inspection-pick", JSON.stringify(hit ?? null));
      if (inspection.current.mode !== "normal" && hit?.faceId !== undefined)
        setIsolatedFaceKey(inspectionFaceKey(hit.occurrenceId, hit.faceId));
      const selection =
        hit && hit.definitionId
          ? hit.edgeId
            ? value.model?.describeEdgeSelection(
                hit.definitionId,
                String(hit.edgeId),
                hit.occurrenceId,
              )
            : value.model?.describeSelection(
                hit.definitionId,
                hit.triangleIndex ?? 0,
                hit.occurrenceId,
              )
          : null;
      value.onSelect(
        selection?.semanticEntityId ?? null,
        selection?.faceId ?? null,
        selection,
      );
    };
    const move = (event: PointerEvent) => {
      const current = host.current;
      if (!current || event.buttons) return;
      const hit =
        event.type === "pointerleave"
          ? null
          : current.picker.pick(pixel(event));
      let changed = false;
      for (const mesh of current.scene.meshes) {
        const hovered =
          !mesh.overlay && mesh.identity.occurrenceId === hit?.occurrenceId;
        changed ||= mesh.hovered !== hovered;
        mesh.hovered = hovered;
      }
      if (changed) current.invalidate();
    };
    element.addEventListener("click", click);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", move);
    void TelosHost.create(element, setDiagnostic, initialization.signal)
      .then((current) => {
        if (disposed) {
          current.dispose();
          return;
        }
        host.current = current;
        current.camera.up.set(0, 0, 1);
        current.attach(container.current!);
        apply();
        setReady(true);
        if (latest.current.captureRef)
          latest.current.captureRef.current = () => {
            current.render();
            return element.toDataURL("image/png");
          };
      })
      .catch((error) => {
        if (!disposed) setDiagnostic(String(error));
      });
    return () => {
      disposed = true;
      initialization.abort();
      element.removeEventListener("click", click);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", move);
      if (latest.current.captureRef) latest.current.captureRef.current = null;
      host.current?.dispose();
      host.current = null;
    };
  }, []);
  useEffect(() => {
    apply();
  }, [props.model, props.model?.revision, props.selectedEntityId, props.selectedTopologyId,
    props.theme, props.displayMode, props.viewMode, props.viewCommand, props.aaMode, props.aaDebug,
    inspectionMode, isolatedFaceKey]);
  useEffect(() => { setIsolatedFaceKey(""); }, [props.model?.id, props.model?.revision]);
  return (
    <section
      className="viewport-shell"
      aria-label="3D viewport"
      data-display-host="three-telos"
      aria-busy={!ready || !!props.busyMessage}
    >
      <div className="viewport-canvas" ref={container} data-testid="viewport">
        {inspectionFaces.length > 0 && <details style={{ position: "absolute", bottom: 12, left: 12, zIndex: 3,
          padding: 8, maxWidth: 390, color: props.theme === "mars" ? "#eef4f1" : "#17221f",
          background: props.theme === "mars" ? "#17221f" : "#f4f5f2" }}>
          <summary>Surface / trim inspection</summary>
          <label>View <select aria-label="Surface inspection view" value={inspectionMode}
            onChange={event => setInspectionMode(event.target.value as SurfaceInspectionMode)}>
            <option value="normal">Normal</option><option value="surfaces">Surfaces only</option>
            <option value="wire">BRep wire only</option><option value="overlay">Translucent + wire</option>
            <option value="patches">Face colours + wire</option>
          </select></label>
          <div><label>Face <select aria-label="Isolated display face" value={isolatedFaceKey}
            style={{ maxWidth: 300 }} onChange={event => setIsolatedFaceKey(event.target.value)}>
            <option value="">All faces</option>{inspectionFaces.map(face => <option key={face.key} value={face.key}>
              {face.occurrenceId} · {face.faceId}</option>)}
          </select></label></div>
          <small>Red lines are source BRep edges. Views preserve the camera. Click a surface to isolate it.
            {props.model?.mesh.definitions.some(definition => definition.cir?.qualification === "cir-qualified") &&
              " Face colours and isolated faces use the retained BRep mesh proxy; whole-model views show the field."}
            {isolatedFace && " Wire shows occurrence edges; this packet has no face-edge adjacency."}
          </small>
        </details>}
        {!!props.model?.mesh.cameras?.length && <select aria-label="Scene camera" style={{position:"absolute",left:12,top:48,zIndex:2}}
          value={authoredCamera} onChange={event=>{ setAuthoredCamera(event.target.value); const camera=props.model?.mesh.cameras?.find(c=>c.name===event.target.value); if(camera && host.current) { host.current.camera.applyDisplayCamera(camera); host.current.invalidate(); } else if (!event.target.value && host.current) { host.current.fit(); host.current.invalidate(); } }}>
          <option value="">Fit view</option>{props.model.mesh.cameras.map(c=><option key={c.name}>{c.name}</option>)}
        </select>}
        <canvas
          ref={canvas}
          aria-label="Engineering WebGPU viewport"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
      <div className="axis-labels" aria-hidden="true">
        <span className="axis-x">X</span>
        <span className="axis-y">Y</span>
        <span className="axis-z">Z</span>
      </div>
      {!props.model && ready && !props.busyMessage && (
        <div className="viewport-empty">
          <strong>Build your first model</strong>
          <span>Open a Firmament file, edit its source, then Build.</span>
          <small>Drag to orbit · Shift-drag to pan · Scroll to zoom</small>
        </div>
      )}
      {!diagnostic && (!ready || props.busyMessage) && (
        <div className="viewport-status" role="status">
          {props.busyMessage ?? "Preparing viewport…"}
        </div>
      )}
      {(diagnostic || props.errorMessage) && (
        <div className="viewport-status viewport-error" role="alert">
          {diagnostic
            ? "The viewport could not render. Your model is retained."
            : props.errorMessage}
          {diagnostic && (
            <>
              <details>
                <summary>Details</summary>
                {diagnostic}
              </details>
              <button onClick={props.onRetry}>Restart viewport</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

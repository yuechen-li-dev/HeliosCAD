import { useEffect, useRef, type MutableRefObject } from 'react';
import type { MotionPose } from '@aetheris/cad';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DisplayEdgePolyline, ModelSession, SelectionDescription } from '@aetheris/cad';
import { TelosCamera } from '@aetheris/three-telos';
import type { DisplayMode, ThemeName, ViewMode } from '../app/types';
import { applyNamedView, WORLD_UP } from './viewCommands';
import { HELIOS_PRESENTATIONS } from './presentation';
import { referenceGrid } from './referenceGrid';

interface Props {
  model: ModelSession | null;
  selectedEntityId: string | null;
  selectedTopologyId: string | null;
  theme: ThemeName;
  displayMode: DisplayMode;
  viewMode: ViewMode;
  viewCommand: string;
  selectionMode: 'face' | 'edge';
  onSelect(entityId: string | null, faceId: string | null, selection?: SelectionDescription | null): void;
  captureRef?: MutableRefObject<(() => string) | null>;
  pose?: MotionPose | null;
}

type MeshMeta = { definitionId: string; occurrenceId: string; edgeId?: string; highlight?: boolean; baseColor?: readonly number[] };

export function LegacyViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<ReturnType<typeof createScene> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const sceneState = createScene(host.current, props.onSelect);
    state.current = sceneState;
    if (props.captureRef) props.captureRef.current = sceneState.capture;
    return () => { if (props.captureRef) props.captureRef.current = null; sceneState.dispose(); state.current = null; };
  }, []);

  useEffect(() => { if (state.current) loadModel(state.current, props.model); }, [props.model, props.model?.revision]);
  useEffect(() => { if (state.current) selectEntity(state.current, props.model, props.selectedEntityId, props.selectedTopologyId); }, [props.model, props.selectedEntityId, props.selectedTopologyId]);
  useEffect(() => { if (state.current) applyAppearance(state.current, props.theme, props.displayMode); }, [props.theme, props.displayMode]);
  useEffect(() => { if (state.current) applyViewCommand(state.current, props.viewMode, props.viewCommand); }, [props.viewMode, props.viewCommand]);
  useEffect(() => { if (state.current) state.current.selectionMode = props.selectionMode; }, [props.selectionMode]);
  // A motion pose moves occurrences in place: the built geometry stays loaded.
  useEffect(() => { if (state.current && props.model) applyPose(state.current.group, props.model, props.pose ?? null); }, [props.model, props.model?.revision, props.pose]);

  return <section className="viewport-shell" aria-label="3D viewport">
    <div className="viewport-canvas" ref={host} data-testid="viewport" />
    <div className="axis-labels" aria-hidden="true"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
    {!props.model && <div className="viewport-empty">Firmament geometry will appear here.</div>}
  </section>;
}

function createScene(host: HTMLDivElement, onSelect: Props['onSelect']) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Telos tone-maps with the Narkowicz ACES fit; three's ACES filmic (exposure 1) is its close match.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  // The same camera authority as the WebGPU viewport: framing, views and projection come from a
  // TelosCamera and are copied onto these three.js cameras. Z is up before the controls exist,
  // because OrbitControls fixes its orbit axis from camera.up when it is created.
  const authority = new TelosCamera();
  authority.up.set(...WORLD_UP);
  const perspective = new THREE.PerspectiveCamera(authority.fov, 1, authority.near, authority.far);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, authority.near, authority.far);
  perspective.up.set(...WORLD_UP); orthographic.up.set(...WORLD_UP);
  let camera: THREE.Camera = perspective;
  const controls = new OrbitControls(perspective, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  // Lights, backdrop colour and grid come from the same presentation the WebGPU viewport uses
  // (applyAppearance), with the hemisphere's sky along world up.
  const lights = { ambient: new THREE.AmbientLight(), hemisphere: new THREE.HemisphereLight(), key: new THREE.DirectionalLight(), fill: new THREE.DirectionalLight() };
  lights.hemisphere.position.set(...WORLD_UP);
  scene.add(...Object.values(lights));
  const grid = { minor: gridLines(), major: gridLines(), key: '' };
  const backdrop = createBackdrop();
  scene.add(backdrop, grid.minor, grid.major);
  const group = new THREE.Group(); scene.add(group);
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line!.threshold = 1.5;
  const pointer = new THREE.Vector2();
  let dirty = true;
  let raf = 0;
  const invalidate = () => { dirty = true; if (!raf) raf = requestAnimationFrame(render); };
  const render = () => {
    raf = 0;
    const damping = controls.update();
    if (dirty || damping) updateGrid(state);
    if (dirty || damping) renderer.render(scene, camera);
    dirty = false;
    if (damping) raf = requestAnimationFrame(render);
  };
  controls.addEventListener('change', invalidate);
  // OrbitControls turns about Z (fixed when it was created). The top view looks down Z with Y up on
  // screen; a drag from there goes back to Z up, which the controls' pole clamp makes seamless.
  controls.addEventListener('start', () => { if (camera.up.z < 0.5) camera.up.set(...WORLD_UP); });
  const resize = new ResizeObserver(() => {
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    (backdrop.material as THREE.ShaderMaterial).uniforms.viewport.value.set(width, height);
    authority.resize(width, height);
    projectFrom(authority, perspective, orthographic);
    invalidate();
  });
  resize.observe(host);
  const hitTest = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(group.children, false);
    const face = hits.find(hit => hit.object instanceof THREE.Mesh);
    if (state.selectionMode === 'face') return face;
    const edge = hits.find(hit => hit.object instanceof THREE.LineSegments);
    return edge && (!face || edge.distance <= face.distance + 1.5) ? edge : undefined;
  };
  renderer.domElement.addEventListener('pointermove', event => {
    const next = hitTest(event)?.object instanceof THREE.Mesh ? hitTest(event)?.object as THREE.Mesh : undefined;
    if (state.hovered !== (next ?? null)) { state.hovered = next ?? null; updateMaterials(state); invalidate(); }
  });
  renderer.domElement.addEventListener('click', event => {
    const hit = hitTest(event);
    if (!hit) { onSelect(null, null); return; }
    const meta = hit.object.userData as MeshMeta;
    const resolved = meta.edgeId
      ? state.model?.describeEdgeSelection(meta.definitionId, meta.edgeId, meta.occurrenceId)
      : state.model?.describeSelection(meta.definitionId, hit.faceIndex ?? 0, meta.occurrenceId);
    onSelect(resolved?.semanticEntityId ?? null, resolved?.faceId ?? null, resolved);
  });
  controls.addEventListener('change', () => publishCamera(renderer.domElement, camera, controls.target, authority));
  const state = { scene, renderer, perspective, orthographic, authority, lights, backdrop, theme: 'apollonia' as ThemeName, displayMode: 'shaded' as DisplayMode, get camera() { return camera; }, set camera(value) { camera = value; }, controls, grid, group, model: null as ModelSession | null, selectionMode: 'face' as 'face' | 'edge', selectedIds: new Set<string>(), hovered: null as THREE.Mesh | null, invalidate,
    capture() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() { cancelAnimationFrame(raf); resize.disconnect(); controls.dispose(); renderer.dispose(); host.replaceChildren(); } };
  invalidate();
  return state;
}

function loadModel(state: ReturnType<typeof createScene>, model: ModelSession | null) {
  const started = performance.now();
  for (const child of [...state.group.children]) { state.group.remove(child); disposeObject(child); }
  state.model = model;
  if (!model) { state.invalidate(); return; }
  const geometries = new Map(model.mesh.definitions.map(definition => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(definition.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(definition.normals), 3));
    geometry.setIndex(new THREE.BufferAttribute(definition.indices, 1));
    geometry.computeBoundingSphere();
    return [definition.id, geometry];
  }));
  for (const occurrence of model.mesh.occurrences) {
    const geometry = occurrence.definitionId ? geometries.get(occurrence.definitionId) : undefined;
    if (!geometry || !occurrence.definitionId) continue;
    // The occurrence's resolved appearance, as the WebGPU viewport shows it; Telos' default otherwise.
    const look = occurrence.material;
    const mesh = new THREE.Mesh(geometry, material(look?.roughness ?? 0.62, look?.opacity ?? 1));
    mesh.matrix.fromArray(occurrence.transform); mesh.matrixAutoUpdate = false;
    mesh.userData = { definitionId: occurrence.definitionId, occurrenceId: occurrence.id, baseColor: look?.baseColor ?? DEFAULT_COLOR } satisfies MeshMeta;
    state.group.add(mesh);
    // Triangle adjacency is display tessellation, not BRep topology. Only draw
    // polylines supplied by the kernel's edge tessellator.
    for (const edge of definitionEdges(model, occurrence.definitionId)) {
      const edgePoints: number[] = [];
      for (let i = 1; i < edge.points.length; i++) edgePoints.push(...edge.points[i - 1], ...edge.points[i]);
      if (edge.closed && edge.points.length > 2) edgePoints.push(...edge.points[edge.points.length - 1], ...edge.points[0]);
      if (!edgePoints.length) continue;
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePoints, 3));
      const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x323a35, transparent: true, opacity: 0.72 }));
      edges.matrix.copy(mesh.matrix); edges.matrixAutoUpdate = false;
      edges.userData = { definitionId: occurrence.definitionId, occurrenceId: occurrence.id, edgeId: edge.edgeId } satisfies MeshMeta;
      state.group.add(edges);
    }
  }
  // New parts take the current theme, display mode and selection colours.
  applyAppearance(state, state.theme, state.displayMode);
  fit(state);
  performance.clearMeasures('helios-display-update');
  performance.measure('helios-display-update', { start: started, end: performance.now() });
}

function selectEntity(state: ReturnType<typeof createScene>, model: ModelSession | null, entityId: string | null, topologyId: string | null) {
  for (const overlay of state.group.children.filter(object => (object.userData as MeshMeta).highlight)) {
    state.group.remove(overlay); disposeObject(overlay);
  }
  const selection = entityId && model ? model.selectionForEntity(entityId) : { occurrenceIds: [] };
  state.selectedIds = new Set(selection.occurrenceIds);
  if (model && topologyId?.startsWith('edge:')) {
    for (const definition of model.mesh.definitions) {
      const edge = definition.edges?.find(item => item.edgeId === topologyId);
      if (!edge || edge.points.length < 2) continue;
      const base = state.group.children.find(object => object instanceof THREE.Mesh && (object.userData as MeshMeta).definitionId === definition.id) as THREE.Mesh | undefined;
      if (!base) continue;
      const points = edge.points.map(point => new THREE.Vector3(point[0], point[1], point[2]));
      const curve = new THREE.CatmullRomCurve3(points, edge.closed);
      const highlight = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(points.length * 2, 8), 0.24, 6, edge.closed), new THREE.MeshBasicMaterial({ color: 0xffda69, depthTest: false }));
      highlight.matrix.copy(base.matrix); highlight.matrixAutoUpdate = false; highlight.renderOrder = 3;
      highlight.userData = { definitionId: definition.id, occurrenceId: (base.userData as MeshMeta).occurrenceId, highlight: true } satisfies MeshMeta;
      highlight.raycast = () => undefined;
      state.group.add(highlight);
    }
  }
  if (model && entityId && 'ranges' in selection && selection.occurrenceIds.length === 0) {
    for (const range of selection.ranges) {
      const base = state.group.children.find(object => object instanceof THREE.Mesh && (object.userData as MeshMeta).definitionId === range.definitionId) as THREE.Mesh | undefined;
      if (!base) continue;
      const indices = base.geometry.getIndex()?.array.slice(range.startTriangle * 3, (range.startTriangle + range.triangleCount) * 3);
      if (!indices?.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', base.geometry.getAttribute('position'));
      geometry.setAttribute('normal', base.geometry.getAttribute('normal'));
      geometry.setIndex(Array.from(indices));
      const overlay = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffbb4f, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      overlay.matrix.copy(base.matrix); overlay.matrixAutoUpdate = false; overlay.renderOrder = 2;
      overlay.userData = { definitionId: range.definitionId, occurrenceId: (base.userData as MeshMeta).occurrenceId, highlight: true } satisfies MeshMeta;
      overlay.raycast = () => undefined;
      state.group.add(overlay);
    }
  }
  updateMaterials(state);
  state.invalidate();
}

/** Telos' default part colour (#b8beb3), linear. */
const DEFAULT_COLOR = new THREE.Color(0xb8beb3).toArray();

/** Selection and hover tint each part's own colour toward the theme's selection colour, as Telos does. */
function updateMaterials(state: ReturnType<typeof createScene>) {
  const selection = HELIOS_PRESENTATIONS[state.theme].lighting.selection;
  const edge = state.theme === 'bronze-age' ? 0x323a35 : 0x69716d;
  for (const object of state.group.children) {
    const meta = object.userData as MeshMeta;
    const selected = state.selectedIds.has(meta.occurrenceId);
    if (object instanceof THREE.Mesh && !meta.highlight) {
      const strength = selected ? 0.52 : object === state.hovered ? 0.16 : 0;
      const base = meta.baseColor ?? DEFAULT_COLOR;
      (object.material as THREE.MeshStandardMaterial).color.setRGB(...[0, 1, 2].map(i => base[i] * (1 - strength) + selection[i] * strength) as [number, number, number], THREE.LinearSRGBColorSpace);
    } else if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.set(selected ? 0xffca63 : edge);
  }
}

/** The studio and paper backdrops of three-telos' background shader, drawn behind everything.
 * Colours are display-encoded and written as they are, like Telos does. */
function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { viewport: { value: new THREE.Vector2(1, 1) }, kind: { value: 0 }, base: { value: new THREE.Vector3() },
      accent: { value: new THREE.Vector3() }, intensity: { value: 1 }, vignette: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }',
    fragmentShader: `
      uniform vec2 viewport; uniform int kind; uniform vec3 base; uniform vec3 accent; uniform float intensity; uniform float vignette;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; p.x *= viewport.x / max(viewport.y, 1.0);
        vec3 color = base;
        if (kind == 1) color = mix(color * 0.88, color + accent * 0.12, vUv.y);
        else { vec2 q = p - vec2(-0.3, 0.5); color += accent * exp(-dot(q, q) * 0.65) * 0.10; color *= 0.8 + 0.2 * vUv.y; }
        vec2 c = vUv - 0.5;
        float shade = 1.0 - clamp(dot(c, c) * vignette * 1.2, 0.0, 0.5);
        gl_FragColor = vec4(clamp(color * intensity * shade, 0.0, 1.0), 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = -2;
  quad.raycast = () => undefined;
  return quad;
}

function gridLines() {
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  lines.raycast = () => undefined;
  lines.renderOrder = -1;
  return lines;
}

/** Redraw the reference grid when the view has moved far enough to change its lines. */
function updateGrid(state: ReturnType<typeof createScene>) {
  const authority = pull(state);
  authority.update();
  const next = referenceGrid(authority, HELIOS_PRESENTATIONS[state.theme].grid);
  if (next.key === state.grid.key) return;
  state.grid.key = next.key;
  for (const [lines, points] of [[state.grid.minor, next.minor], [state.grid.major, next.major]] as const)
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points as number[], 3));
}

/** Presentation colours are linear for lights and display-encoded (sRGB) for backdrop and grid. */
const linearColor = (rgb: readonly number[]) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
const displayColor = (rgb: readonly number[]) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

function applyAppearance(state: ReturnType<typeof createScene>, theme: ThemeName, mode: DisplayMode) {
  const presentation = HELIOS_PRESENTATIONS[theme];
  const { lighting, backdrop } = presentation;
  state.theme = theme;
  state.displayMode = mode;
  const uniforms = (state.backdrop.material as THREE.ShaderMaterial).uniforms;
  uniforms.kind.value = backdrop.kind === 'paper' ? 1 : 0;
  uniforms.base.value.set(...backdrop.base);
  uniforms.accent.value.set(...backdrop.accent);
  uniforms.intensity.value = backdrop.intensity;
  uniforms.vignette.value = backdrop.vignette;
  // Telos' shading terms, rescaled for three.js' physically based lights (a Lambert surface under a
  // light of intensity π reflects its full colour).
  const exposure = lighting.exposure * Math.PI;
  state.lights.ambient.intensity = lighting.ambient * exposure;
  state.lights.hemisphere.color = linearColor(lighting.sky);
  state.lights.hemisphere.groundColor = linearColor(lighting.ground);
  state.lights.hemisphere.intensity = lighting.hemisphere * 0.5 * exposure;
  for (const [light, direction, color, intensity] of [
    [state.lights.key, lighting.key, lighting.keyColor, lighting.keyIntensity * 0.5],
    [state.lights.fill, lighting.fill, lighting.fillColor, lighting.fillIntensity * 0.6],
  ] as const) {
    light.position.set(direction[0], direction[1], direction[2]).normalize();
    light.color = linearColor(color);
    light.intensity = intensity * exposure;
  }
  rim.rimColor.value = linearColor(lighting.rim);
  rim.rimStrength.value = lighting.rimIntensity * 0.32 * lighting.exposure;
  for (const [lines, color, opacity] of [[state.grid.minor, presentation.grid.minor, presentation.grid.minorOpacity], [state.grid.major, presentation.grid.major, presentation.grid.majorOpacity]] as const) {
    const material = lines.material as THREE.LineBasicMaterial;
    material.color = displayColor(color);
    material.opacity = opacity;
  }
  state.grid.key = '';
  for (const object of state.group.children) if (object instanceof THREE.Mesh) {
    if ((object.userData as MeshMeta).highlight) continue;
    const mat = object.material as THREE.MeshStandardMaterial;
    mat.wireframe = mode === 'wireframe';
    mat.flatShading = mode !== 'shaded'; mat.needsUpdate = true;
  } else if (object instanceof THREE.LineSegments) object.visible = mode === 'edges';
  updateMaterials(state);
  state.invalidate();
}

function applyViewCommand(state: ReturnType<typeof createScene>, mode: ViewMode, command: string) {
  command = command.split('-')[0];
  const authority = pull(state);
  authority.mode = mode;
  const camera = state.model?.mesh.cameras?.[0];
  if (command === 'authored' && camera) authority.applyDisplayCamera(camera);
  applyNamedView(authority, command);
  if (command === 'fit') { fit(state); return; }
  if (command === 'fitselection') { fitSelection(state); return; }
  authority.update();
  push(state);
}

/** The authority, updated with wherever the user has orbited, panned or zoomed to. */
function pull(state: ReturnType<typeof createScene>) {
  const { authority, camera, controls } = state;
  authority.position.copy(camera.position);
  authority.target.copy(controls.target);
  authority.up.copy(camera.up);
  if (camera instanceof THREE.OrthographicCamera) authority.span = (camera.top - camera.bottom) / camera.zoom;
  return authority;
}

/** Show what the authority describes: its camera kind, pose and projection. */
function push(state: ReturnType<typeof createScene>) {
  const { authority, controls } = state;
  const camera = authority.mode === 'orthographic' ? state.orthographic : state.perspective;
  state.camera = camera;
  controls.object = camera;
  camera.up.copy(authority.up);
  camera.position.copy(authority.position);
  controls.target.copy(authority.target);
  camera.zoom = 1;
  projectFrom(authority, state.perspective, state.orthographic);
  camera.lookAt(authority.target);
  controls.update();
  publishCamera(state.renderer.domElement, camera, controls.target, authority);
  state.invalidate();
}

/** Projection from the authority: the same field of view, orthographic span and clipping. */
function projectFrom(authority: TelosCamera, perspective: THREE.PerspectiveCamera, orthographic: THREE.OrthographicCamera) {
  const aspect = authority.width / authority.height;
  perspective.fov = authority.fov; perspective.aspect = aspect; perspective.near = authority.near; perspective.far = authority.far;
  perspective.updateProjectionMatrix();
  const h = authority.span / 2;
  orthographic.left = -h * aspect; orthographic.right = h * aspect; orthographic.top = h; orthographic.bottom = -h;
  orthographic.near = authority.near; orthographic.far = authority.far;
  orthographic.updateProjectionMatrix();
}

/** The camera state in the same shape the WebGPU viewport publishes, so the two can be compared. */
function publishCamera(canvas: HTMLCanvasElement, camera: THREE.Camera, target: THREE.Vector3, authority: TelosCamera) {
  const span = camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom : authority.span;
  canvas.setAttribute('data-surface-inspection', JSON.stringify({ camera: { position: camera.position.toArray(), target: target.toArray(),
    up: camera.up.toArray(), span, mode: camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective' } }));
}

function definitionEdges(model: ModelSession, definitionId: string): readonly DisplayEdgePolyline[] {
  return model.mesh.definitions.find(definition => definition.id === definitionId)?.edges ?? [];
}

function fit(state: ReturnType<typeof createScene>, objects: readonly THREE.Object3D[] = [state.group]) {
  const box = new THREE.Box3();
  for (const object of objects) if (!(object.userData as MeshMeta).highlight) box.expandByObject(object);
  if (box.isEmpty()) { state.invalidate(); return; }
  // The authority frames the bounds exactly as the WebGPU viewport does.
  const authority = pull(state);
  authority.fit(box.min.toArray(), box.max.toArray());
  push(state);
}

function fitSelection(state: ReturnType<typeof createScene>) {
  const selected = state.group.children.filter(object => object instanceof THREE.Mesh && state.selectedIds.has((object.userData as MeshMeta).occurrenceId));
  fit(state, selected.length ? selected : [state.group]);
}

// Telos' shader lights the full base colour, so no metalness here: three's standard material would
// take that share out of the diffuse light. Colour is set per part in updateMaterials.
function material(roughness: number, opacity: number) {
  const result = new THREE.MeshStandardMaterial({ metalness: 0, roughness, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  result.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColor;\nuniform float rimStrength;\nvoid main() {')
      .replace('#include <opaque_fragment>', 'outgoingLight += rimColor * pow(1.0 - max(dot(normal, geometryViewDir), 0.0), 3.0) * rimStrength;\n#include <opaque_fragment>');
  };
  result.customProgramCacheKey = () => 'helios-rim';
  return result;
}

/** Telos' rim term, which outlines a part against the backdrop; set from the presentation. */
const rim = { rimColor: { value: new THREE.Color() }, rimStrength: { value: 0 } };
function disposeObject(object: THREE.Object3D) { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }

function applyPose(group: THREE.Group, model: ModelSession, pose: MotionPose | null) {
  const built = new Map(model.mesh.occurrences.map(occurrence => [occurrence.id, occurrence.transform]));
  const moved = new Map((pose?.transforms ?? []).map(t => [t.id, Array.from(t.matrix)]));
  for (const object of group.children) {
    const id = (object.userData as MeshMeta).occurrenceId;
    const transform = moved.get(id) ?? built.get(id);
    if (transform) { object.matrix.fromArray(transform); object.matrixWorldNeedsUpdate = true; }
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const disposeModel = (model: THREE.Object3D) => model.traverse(object => {
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  }
});

export function mountKnotLogo(host: HTMLElement, ready: () => void, failed: () => void) {
  if (!('WebGL2RenderingContext' in window)) throw new Error('WebGL unavailable');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  const scene = new THREE.Scene(), spin = new THREE.Group(), pose = new THREE.Group();
  let reflections: THREE.WebGLRenderTarget | undefined;
  pose.rotation.set(1.22, 0, .15);
  spin.add(pose); scene.add(spin);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 10);
  camera.position.z = 3.55;
  scene.add(new THREE.HemisphereLight(0xfff4db, 0x151c26, .18));
  for (const [color, strength, position] of [[0xfff5df, 2.8, [2, 3, 4]], [0xe5f1ff, .3, [-3, 0, 2]], [0xffd161, 2, [1, -2, -3]]] as const) {
    const light = new THREE.DirectionalLight(color, strength); light.position.set(position[0], position[1], position[2]); scene.add(light);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, model: THREE.Object3D | undefined, frame = 0, previous = 0, visible = true, elapsed = 0;
  const render = () => { if (!disposed && model) renderer.render(scene, camera); };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || !model || !visible || document.hidden || reduced.matches) { previous = 0; return; }
    if (previous && now - previous >= 1000 / 30) {
      elapsed += Math.min((now - previous) / 1000, .1);
      spin.rotation.y = elapsed * Math.PI * 2 / 100;
      render(); previous = now;
    } else if (!previous) previous = now;
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    render();
    if (!disposed && model && visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
  };
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
  });
  resize.observe(host);
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); });
  observer.observe(host);
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  const lost = (event: Event) => { event.preventDefault(); failed(); dispose(); };
  canvas.addEventListener('webglcontextlost', lost);
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect();
    document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update);
    canvas.removeEventListener('webglcontextlost', lost);
    if (model) disposeModel(model);
    scene.environment = null; reflections?.dispose();
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  };
  new GLTFLoader().load('/branding/aetheris-knot.glb', gltf => {
    if (disposed) { disposeModel(gltf.scene); return; }
    model = gltf.scene;
    // Bake broad studio reflections once. Only the rigid pose changes afterward.
    // Keep this after cleanup is installed so a GPU setup failure can fall back.
    try {
      const studio = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
      try { reflections = pmrem.fromScene(studio, .025); scene.environment = reflections.texture; scene.environmentIntensity = .7; }
      finally { studio.dispose(); pmrem.dispose(); }
    } catch { failed(); dispose(); return; }
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2;
    if (!Number.isFinite(radius) || radius <= 0) { failed(); dispose(); return; }
    model.position.sub(center); pose.scale.setScalar(1 / radius);
    model.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) { material.emissive.setRGB(.25, .13, .01); material.emissiveIntensity = .08; }
      }
    });
    pose.add(model); ready(); update();
  }, undefined, () => { if (!disposed) { failed(); dispose(); } });
  return dispose;
}

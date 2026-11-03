# Aetheris-authored knot logo

Date: 2026-11-01

The boxed H has been replaced in the home/editor/discovery headers by a static
Aetheris GLB with slow rigid rotation. The welcome-page wordmark uses a larger
instance so the crossings are legible. Gold PBR appearance, studio reflections
and a small CSS halo provide the glow; light-theme brightness is reduced for contrast.
The boxed H remains the load/failure fallback.

## Geometry and delivery

- `fixtures/branding/aetheris-knot.firmament`: a coprime (3,5) TorusKnot WireForm,
  R=42 mm, r=14 mm, wire diameter 6 mm, in one anchored assembly occurrence.
- `scripts/export-branding.mjs` / `npm run branding:export`: real Aetheris CLI
  validation, assembly inspection and GLB export, with a container/self-contained
  mesh check before copying into `public/branding/`.
- `public/branding/aetheris-knot.glb`: 1,307,312 bytes, one mesh, no animation clips
  or external buffers. Geometry comes from the existing assembly display export.
  The UI neither evaluates torus equations nor rebuilds engineering geometry.
- `public/branding/provenance.json`: source, appearance and delivered-asset hashes.
  Two exports from identical inputs produced the same GLB SHA256:
  `1409291b164c39397f79462b580a606d6464dc40082b7b419c360440bcb0739d`.
- A separate STEP build/reimport reports one enclosed-manifold body and shell,
  with 640 faces, 1,280 edges and 640 vertices. Source stays editable in Firmament;
  GLB is its presentation mesh.

An initial appearance-map export correctly refused an unknown definition key.
The map now uses the exact compiler-inspected identity,
`AetherisKnot<Diameter: 6mm>`, including its authored spacing.

## Solid gold refinement

The first 2.4 mm version read as thin linework, especially in the header. The
revised source uses a 6 mm tube (2.5 times the diameter), with the same knot path.
The compact mark grows from 34 to 38 px. The exported finish is saturated yellow
gold with metalness 0.92 and roughness 0.20. A prefiltered studio environment is
baked once per renderer to provide broad reflections. Lower ambient fill and
emissive intensity retain shaded sides instead of flattening the section; key
and rim lights highlight the rounded volume. The environment render target is
disposed with the mark, including load-failure/context-loss paths.

## Runtime behavior

The scene loads in a separate dynamic module and uses existing Three.js. Each
visible mark renders at up to 30 fps, rotating once per 100 seconds. Reduced
motion renders a still pose. Visibility/intersection changes pause animation;
unmount disposes geometry, materials, renderer/context, observers and listeners.
Load failure or context loss returns to the boxed H without blocking CAD startup.
No new package or running service is required by the shipped app.

## Verification

- `npm test`: 220 tests in 46 files passed.
- `npm run build:fast`: passed (existing large-chunk advisory).
- UI/branding browser suite: five passed. Real canvas pixels change while rotating
  and remain equal with reduced motion. An aborted GLB request shows the boxed H,
  removes its canvas and still opens a working CAD model. Both themes, editor
  startup, five reloads, delayed Vite preamble and IntelliDraft remain covered.
- Built-app browser smoke also covers the same branding cases through preview.
- Manual Edge use inspected the actual light/dark welcome page and loaded mark.
- `git diff --check`: passed.

Evidence under ignored `artifacts/local/branding/`: `validate.json`, `inspect.json`,
`export.json`, `generate.log`, `aetheris-knot.step`, `build-step.json`, `analyze.json`,
`unit.log`, `build.log`, `browser.log`, `built-browser.log`, `home-light.png`,
`home-dark.png`, `workspace.png`, `header-light.png`, `header-dark.png`,
`mark-light.png`, `mark-dark.png`, `lockup-light.png` and `lockup-dark.png`.

Changes are confined to HeliosCAD. The sibling Aetheris compiler/exporter was
used without modification. The original screenshot was visual direction; this
is a new (3,5) authoring source rather than recovered original code.

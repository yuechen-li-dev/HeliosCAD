# Aetheris Helios knot mark

The logo is an Aetheris-authored torus-knot WireForm, exported as a static binary
glTF (`.glb`). Helios loads that mesh for the welcome-page and header marks. The
browser supplies lighting, a subtle glow and a slow rigid rotation; it does not
generate the knot geometry or run the CAD compiler for the logo.

The [Firmament source](../../fixtures/branding/aetheris-knot.firmament) defines a
single closed (3,5) torus knot with 42 mm major radius, 14 mm minor radius and
6 mm wire diameter. Its scale is arbitrary for this branding use. The
[appearance file](../../fixtures/branding/appearance.json) supplies the warm
yellow-gold metal finish. Studio reflections give the round tube broad highlights
and shaded sides. The source is independent of the original reference image's
authoring code.

To regenerate with a built sibling Aetheris checkout:

```powershell
npm run branding:export
```

`AETHERIS_CLI` can point to another built `aetheris.dll`. The command validates
and inspects the source, exports through `asm export-glb`, then publishes
`public/branding/aetheris-knot.glb` and its source/asset hash receipt. Diagnostic
outputs go under ignored `artifacts/local/branding/`.

The mark makes one turn in roughly 100 seconds. Reduced-motion preferences keep
it still, and hidden or offscreen marks stop animating. If WebGL or the asset is
unavailable, the boxed H remains usable. The product name stays accessible as
ordinary text; the model is decorative.

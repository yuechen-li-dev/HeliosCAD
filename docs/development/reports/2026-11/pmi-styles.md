# PMI styles: Markers and Drawing (Label L4)

Aetheris side: `docs/development/reports/2026-11/pmi-presentation-styles.md` (drawing geometry in the display mesh,
`PmiStyle` in three-telos) and `viewport-tessellation-conformance.md` (the mesh under it).

## Delivered

- **Toggle** in the viewport's PMI legend: Markers (default) or Drawing, remembered per browser
  (`helios.viewport.pmi-style`).
- **Markers** (`src/viewport/PmiMarkers.tsx`, `pmiMarkers.ts`): one tag per record, `3 Ø10 +0.02/-0.01 · BoreSize`,
  numbered in `Pmi` order and coloured like the record's target (Okabe–Ito). A datum's tag is its letter alone. Tags
  are laid out in screen space by a deterministic greedy search around each anchor (target centroid): no tag overlaps
  another, the viewport edge, or another record's anchor. A requestAnimationFrame loop re-lays out only when the
  projected anchors or the viewport size change. The legend shows the same numbers and colours.
- **Screenshots carry the tags.** The viewport wrapper composes the capture: renderer image, then the tags and leaders
  drawn onto the same canvas, so a published preview or any capture shows what the user sees.
- **Drawing**: the ASME presentation exported to annotated GLB, now in the viewport (frames, datum symbols, dimensions,
  filled text on white panels). It sits in fixed planes in model space: square views read it; oblique views can show
  it edge-on or mirrored, as in the GLB.
- Both renderers (Telos and the WebGL fallback) expose a world→screen projection for the overlay.

## Verification

- `vitest` 278 passing (marker numbering, colours, label de-duplication, layout without overlaps and inside the view,
  determinism).
- Playwright `tests/pmi-styles.spec.ts`: seven records on the SolidWorks part show seven non-overlapping numbered tags;
  Drawing removes them and the choice survives a reload. Label and SolidWorks round-trip specs pass on the rebuilt SDK.

## Not done

- Camera-facing (billboarded) drawing text; Drawing stays the exported model-space presentation.
- Tags for records on the hidden side of the part are still drawn (anchors are not occlusion-tested).

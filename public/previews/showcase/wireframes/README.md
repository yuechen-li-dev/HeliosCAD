# Native wireframe cards

These SVGs are product assets generated from the intact sources under `fixtures/showcase/`.
`provenance.json` records each root, view, placed-body/edge counts, cutaway and SVG hash;
`fixtures/showcase/provenance.json` records the upstream source hashes.

Regenerate from HeliosCAD, with Aetheris as a sibling checkout:

```powershell
dotnet run --project scripts/wireframes -c Release -- .
```

The generator reuses Aetheris compilation, occurrence transforms and
`BrepWireframeSvgRenderer`. Parts use reimported STEP edges and trim-aware isolines.
Assemblies and Scenes use their existing sampled topology-edge projections, with
each occurrence's world transform. Triangle diagonals are never used as edges.
The house hides `main.ceiling`, `main.southWall` and `hall.ceiling` through the
existing Scene presentation projection; this does not edit its source geometry.
Room panels and window pieces retain their twelve rectangular boundary edges.

ATLAS's presentation state is Shoulder -65°, Elbow 100°, GripLeft/GripRight 4 mm.
`AssemblyKinematics.Evaluate` owns its placement and the display exporter retains
all shared definitions. The canonical source is unchanged; the editor opens its
authored zero pose. The state and warm-paper background are recorded in provenance.

All views are Z-up isometric, monochrome and centered, with a 2.2 px boundary stroke
at the SVG's 900 × 900 authored size. Wireframes show through the model: these are
model previews rather than hidden-line engineering drawings. Generated STEP inputs
and logs stay ignored under `artifacts/local/`. No generated raster concept art is
used by the application.

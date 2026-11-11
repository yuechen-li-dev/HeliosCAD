# Label: holes through Recognize, 4X as a listed callout

Follows [L2](label-l2.md). Compiler side: Aetheris
`docs/development/reports/2026-11/imported-pmi-distance-axis-note.md` (recognized holes section).

## Approach

The laziest correct path: Helios does not infer holes or patterns. It names what the user picked.

- **Recognize.** Picking a cylinder groups it with every coaxial face of equal diameter in the part (axis from the
  display mesh: a vertex plus its radial normal, sign chosen by a second vertex). That group is one hole. The action
  writes `Region <Name> { kind: HoleShaft stepFaceEntities: [...] }` into the body's `Recognize` block, creating the
  block after the `InlineStep` when there is none. Several picked holes are recognized in one edit as `Hole1…HoleN`.
- **Hole as a unit.** A face of a recognized hole is that hole: requirements target `part.region("Name")`, both halves
  of a split hole highlight, and picking two halves counts once. A split hole that is not recognized offers only
  Recognize, with the reason; a single-face cylinder can still be labeled by its face.
- **4X.** Several recognized holes of one diameter offer `NX Ø…` and `NX Position`, written as
  `target: [Hole1, Hole2, …]`. Differing diameters are shown disabled with the diameters. No pattern recognition.
- **Hole location.** No `Location` record: a `Position` to datum planes carries the model-implied basic location,
  which the drawing projection already draws.

The SolidWorks fixture's bore is two half-cylinders, so the existing round-trip now recognizes it first; the exported
diameter is associated with both faces.

## Verification

- `vitest`: 276 passing (split hole → Recognize only; region targets from either half; four holes recognized then
  `4X`; differing diameters refused; Recognize block insertion).
- Playwright: datum → recognize the bore → axis perpendicularity on `part.region("Bore")`, duplicate refused; the
  out-of-band warning on the recognized bore; thickness; SolidWorks round trip through AP242, `aetheris analyze`,
  GLB and workspace reopen.

## Not done

Angles between faces; edges; renaming or deleting a recognized hole from the Label tab (Source or Graph does it).

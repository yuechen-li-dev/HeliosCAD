# Label L2: distances, datum axes and notes on imported parts

Follows [L0–L1](label-l0-l1.md). Compiler side: Aetheris
`docs/development/reports/2026-11/imported-pmi-distance-axis-note.md`.

## Delivered

- **Distance.** Two parallel planes offer `Distance` first, with the separation measured from their display vertices
  (exact planes); one plane offers `Distance from A` when a parallel datum plane exists. The source is
  `Distance N { between: [a, b] value tolerance }`. The compiler makes it a thickness when the material is between the
  faces and a location otherwise, and the viewport draws it between the faces.
- **Datum axis.** A cylinder offers `Datum axis` with the next free letter.
- **Note.** Offered with nothing selected; the compiler now admits it on imported parts.
- **Nominal check.** The card's out-of-band warning is now repeated by the compiler as `pmi-nominal-outside-geometry`.
- A record whose action just became unavailable (written) no longer stays selected.

## Deviation from the design

The design proposed `Size Thickness { between: … }`. Firmament already had a `Distance` record (legacy
`targetA`/`targetB`, never exported); `between` was added to it instead of introducing a second construct for the
same requirement. Size versus location is decided by the geometry, not by the record name.

## Verification

- `vitest`: 273 passing.
- Playwright (`tests/label.spec.ts`): datum on top → orbit → bottom face offers `Distance from A 9.000`, nominal
  proposed as 9, written, shown in the record list and PMI legend, then refused as a duplicate. Earlier Label and
  SolidWorks round-trip tests still pass.

## Not done

Edges (needs imported edge selectors), angles, imported hole `Location`, hole-as-unit picking, `4X` patterns,
general-tolerance notes driving defaults (L3), and the Markers/Drawing styles (L4).

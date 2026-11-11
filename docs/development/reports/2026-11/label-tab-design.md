# Label: contextual PMI authoring in Helios

## Goal

Make annotating an existing STEP part as quick as SolidWorks Smart Dimension, and harder to get wrong. Select geometry,
Helios offers only the requirements that make sense for that selection, shows the measured value, asks for the
intended nominal and tolerance, previews the label on the part, and writes one `Pmi` record into the source on Apply.
This is the adoption wedge: a part from any CAD tool comes in as STEP and leaves as an annotated AP242 that a supplier
or inspection system can read.

The rule is the same as the language's: correct should be the easy path, wrong should be hard or impossible to express.

## What exists

| Area | State |
| --- | --- |
| Authoring | `PmiAuthor` in the Inspector: one selected imported Plane → `Datum`, one Cylinder → `HoleDiameter` with explicit allowances. Single source insertion per Apply. |
| Selection | One entity (face or edge, by a global Faces/Edges toggle). `SelectionDescription` carries the selector (`part.face("#51")`), surface kind, cylinder diameter and planar support. |
| Measure | A separate modal tool (`M`): mode dropdown (points / planes / axes), A/B slots, read-only result card, "no drawing dimensions authored". Its picks bypass the selection. |
| Viewport PMI | Compiler-projected `annotations`: label polylines plus a gold target patch and stem per record (`PmiDisplayProjection`). Built for unambiguous screenshots. |
| Drawing-style PMI | `PmiDisplayLayout`: ASME Y14.5 feature control frames, datum symbols, basic dimensions. Used by annotated GLB export only. |
| Language, imported parts | `Datum` on planes; `HoleDiameter` on cylinders; every explicit GD&T control on any proved face (`Flatness`, `Parallelism`, `Position`, `SurfaceProfile` …), with `datumRefs` to declared datums; `part.region("name")` face groups; `Note`. |
| Language gaps, imported parts | No linear size between two faces, no edge targets, no angle dimension, no cylinder (axis) datum, no `Location` from a datum to an imported hole, no check that a nominal agrees with the geometry. |

The language gaps decide the order of work: the Label tab can only offer what the compiler can write.

## Shape of the UI

A **Label** tab beside Graph and Source. Graph edits construction, Source edits text, Label edits the `Pmi` block; all
three write the same source, and Undo/Redo, checkpoints and downloads are unchanged.

```
┌ Graph │ Source │ Label ┐┌──────────── viewport ─────────────┐
│ Datums   A  B  C        ││  selection chips: [face #51] [#88]│
│ Sizes    Ø6.6 4X  25.00 ││                                   │
│ GD&T     ⏥ 0.03  ⌖ Ø0.25││        (preview label in place)   │
│ Notes    Material       ││                                   │
├─────────────────────────┤│                                   │
│ For this selection:     ││                                   │
│  ◉ Distance 25.00 ±0.10 ││                                   │
│  ○ Parallelism to A     ││                                   │
│  [measured 24.9973 mm]  ││                                   │
│  Nominal [25.00] grid…  ││                                   │
│  Tolerance [±0.10 ▾]    ││                                   │
│  [Preview] [Apply]      ││                                   │
└─────────────────────────┘└───────────────────────────────────┘
```

- **Record list** (top): every record in the `Pmi` block, grouped, with its build status. Clicking one selects its
  targets in the viewport and opens it for editing; deleting removes the declaration.
- **Context card** (bottom): the actions for the current selection, ranked, the first preselected. It is the only way
  to create a record from the tab. A record that cannot be expressed for the selection is not offered; a record that is
  close (two faces 0.3° from parallel) is shown disabled with the measured reason.
- **Preview** draws the would-be label in the viewport before Apply, in the current PMI style. Apply writes one
  declaration; the compiler's diagnostics come back on the card, never as a silent no-op.

## Selection

Labeling needs more than one entity, and its order matters (the first face of a parallelism is the controlled one, the
second its datum). Selection becomes an ordered list.

- Click selects one; Ctrl/Shift-click adds or removes; Esc clears. Chips above the viewport list the selection in order
  with kind and selector; a chip's × removes it. The existing single-select callers read the first entry.
- No global Faces/Edges switch in the Label tab: a click picks the edge when it lands within a few pixels of one and
  the face otherwise, with hover showing which. The switch remains for Graph.
- A click on a hole wall selects the **hole**: the cylinder (or counterbore stack) as one entity with its axis and
  diameter, because that is what one labels. Alt-click selects only the face.
- Selections from different parts or bodies cannot be combined; the chip row says why.

## What a selection offers

Measured values come from the exact B-rep through the existing measurement query, never from the mesh.

| Selection | Offered, in order | Disabled with a reason when |
| --- | --- | --- |
| One planar face | Datum (next free letter: A, B, C …, skipping I, O, Q); Flatness; with a datum present, Parallelism / Perpendicularity / Angularity to it, the one matching the measured angle first; Distance from a parallel datum | — |
| One hole or cylinder | Diameter (Ø, measured, rounded); Position to datums (basic locations measured from the datum planes); Perpendicularity of its axis to a datum plane; Cylindricity; Datum axis | Position: fewer than one datum, or no datum plane fixes its axis |
| Several holes of one diameter | One `4X` diameter and one position over all of them | Diameters differ by more than the rounding step |
| Two planar faces | Parallel: Distance (size or location), Parallelism (the second as datum, made a datum on the spot if it is not one); perpendicular: Perpendicularity; otherwise Angle | Parallelism when the measured angle exceeds what the requested tolerance zone could hold |
| One straight edge | Length (between its end faces when they are parallel planes, which is what an inspector measures) | — |
| One circular edge | Diameter or radius of the edge | — |
| A face and a hole | Location of the hole axis from the face | Face not parallel to the axis |
| Nothing | Notes: material, general tolerance (ISO 2768 class), finish | — |

## Values: measured, nominal, tolerance

External STEP is never exactly nominal. A face exported from SolidWorks may sit at 24.9973 mm.

- The card shows the **measured** value to full precision and proposes a **nominal** rounded to a grid the user picks
  (0.001 / 0.01 / 0.1 / 0.5 / 1 mm; 0.0001 / 0.001 in), defaulting to the coarsest grid within 0.5% of the value.
  The deviation is shown next to it: `measured 24.9973 → 25.00 (−0.0027)`.
- **Tolerances are never inferred**, as today. The tolerance control offers explicit `+/−`, symmetric `±`, the
  general-tolerance class from the part's note, and for holes and shafts ISO 286 fits (H7, g6 …) computed to
  allowances, so a common choice is one click and still explicit in the source.
- If the measured value lies outside the declared band (nominal 25.00 ±0.001 on a 24.9973 face), the card warns that
  the model does not meet its own requirement and Apply needs a second click. The compiler repeats the check
  (`pmi-nominal-outside-geometry`, a warning).
- Datum references come from a picker of declared datums in primary/secondary/tertiary order. Undeclared or repeated
  datums cannot be entered. Form controls (flatness, cylindricity) show no datum picker at all.
- Units: the card follows a mm/in toggle; source stays in mm, as the language requires.

## Measure becomes part of selection

The modal tool goes away. With one or two entities selected, the card's first section is the measurement: distance and
angle between them, diameters, ΔX/ΔY/ΔZ, with witness lines in the viewport, chosen by the selection's kinds instead of
a mode dropdown (plane–plane gives distance and angle; hole–hole gives axis distance; point picks remain behind
Shift-click for surface points). Each measured quantity has **Make label**, which opens the matching record in the card.
`M` keeps opening the card for keyboard users. The measure card also exists in Graph and Source, read-only.

## Two PMI styles

A viewport toggle: **Markers** (default) and **Drawing**.

- **Markers** is for checking and for LLM screenshots: every record's target is a solid tint with a numbered tag
  `[3] Ø6.6 ±0.1 · MountSize`, matching the record's name in source; tags are always on top, leaders run to the target
  centroid, and tags are moved apart so none overlap. Distinct hues per record, colour-blind safe, and a legend listing
  tags. Capture for the AI Author uses this style.
- **Drawing** is the ASME presentation from `PmiDisplayLayout`: frames, datum triangles, basic boxes, as exported to
  GLB, brought into the viewport through the same annotation channel.
- The style is presentation only. It never changes the record or the AP242.

## Language work (Aetheris)

Each Label action maps to one record. The ones imported parts cannot write today:

| Record | Proposed form | AP242 |
| --- | --- | --- |
| Distance between two planar faces | `Size Thickness { between: [part.face("#12"), part.face("#40")] value: 25mm tolerance: PlusMinus(0.1mm, 0.1mm) }` | `DIMENSIONAL_SIZE` (opposed faces) or `DIMENSIONAL_LOCATION` |
| Edge length | `Size Leg { target: part.edge("#88") value: … }`, resolved to its parallel end faces | as above |
| Angle | `Angle Bevel { between: [...] value: 30deg tolerance: … }` | `ANGULAR_LOCATION` |
| Datum axis | `Datum D { target: part.face("#191") }` on a cylinder | datum feature on the cylinder |
| Hole location | `Location` with `to: part.face("#191")` on imported holes | `DIMENSIONAL_LOCATION`, basic when position-toleranced |
| Nominal check | all sizes: compare `value` with the measured geometry | diagnostic only |

Selectors for imported edges (`part.edge("#id")`) need the importer's edge provenance, which the SDK already reports
for display polylines.

## Phases

| Phase | Delivers |
| --- | --- |
| L0 | Ordered multi-select with chips; hole-as-unit picking; measure folded into the selection card |
| L1 | Label tab, record list and context card for records the language already writes: datums, diameters, flatness, parallelism, perpendicularity, position, notes; rounding and fit presets |
| L2 | Aetheris: `Size` between faces and on edges, `Angle`, datum axes, imported `Location`, the nominal check; Label offers them |
| L3 | Patterns (`4X`), general-tolerance notes driving defaults |
| L4 | Markers refinement for screenshots; Drawing style in the viewport |

Each phase ships with unit tests on the action table (selection → offered records, disabled reasons, emitted source)
and a Playwright run on an imported SolidWorks STEP: datum, size, position, export, `aetheris analyze` readback.

## Decisions for the author

1. **Edge length** maps to a size between the edge's end faces when they are parallel (what an inspector measures),
   and refuses otherwise, rather than writing a dimension on the edge itself. Proposed.
2. **Out-of-band nominal** warns and needs a second click; it is not blocked. A part whose drawing disagrees with its
   model is sometimes intended (a model at mid-tolerance), so blocking would be wrong.
3. **The modal Measure tool is removed**, its function folded into selection. Proposed.
4. **Markers stays the default style**; Drawing is opt-in.

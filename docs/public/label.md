# Labeling parts

The **Label** tab, beside Graph and Source, adds manufacturing requirements to a part,
native or imported from STEP: datums, sizes and geometric tolerances. Each one becomes
a record in the model's `Pmi` block and is exported in STEP AP242 and annotated GLB.
The geometry is not changed. A native face is named in the record the way the
Inspector names it (`face(bracket.Side("profile:section.Outer.Vertex1_Vertex2"))`,
`face(bracket.Top)`, `face(+X)`); an imported face by its STEP entity
(`part.face("#51")`).

## Selecting

- Click selects a face, or an edge when the pointer is within a few pixels of one.
  Alt-click always selects the face.
- Ctrl-click or Shift-click adds to the selection, or removes an entry already in it.
  Order matters: in a two-face selection, the first face is the one controlled and the
  second is the datum.
- Esc clears the selection. The chips in the selection card list it in order; × removes
  one entry.

The selection card also shows what the selection measures, from the exact geometry: a
hole's diameter, the distance and angle between two planes, the distance and angle
between two axes. It is available in every tab; **Label…** opens the Label tab with the
same selection.

## What a selection offers

The Label tab lists the records the selection can carry, best match first. Records the
measured geometry rules out are listed under **Not available for this selection**, each
with what it would take, for example "No datum plane is perpendicular to this face."

| Selection | Records |
| --- | --- |
| Nothing | Note |
| One plane | Datum (next free letter, skipping I, O and Q), Distance from a parallel datum plane, Flatness, Straightness, Parallelism, Perpendicularity or Angularity to a declared datum plane, Surface and Line profile, Circular and Total runout about a datum axis square to the face |
| One hole or shaft | Diameter, Position, axis Perpendicularity, Parallelism or Angularity to a datum plane, Cylindricity, Roundness, axis Straightness, Circular and Total runout about a coaxial datum axis, Surface profile; Datum axis on an imported cylinder; Recognize on an imported part |
| Several holes | One `NX` Diameter and `NX` Position over all of them (imported holes are recognized first) |
| Two planes | Distance between them when parallel; Parallelism, Perpendicularity or Angularity of the first to the second |
| A hole and a plane | Axis Perpendicularity, Parallelism or Position relative to the plane |

The relation the geometry has is offered first: perpendicularity for a face square to
the datum, angularity for one at another angle.

## Holes

A hole of a native part is labeled by its name (`target: mount`), whichever of its
faces is picked.

On an imported part a hole is labeled as a whole. **Recognize** names it in the part's `Recognize`
block, with every face of its cylinder, so a hole that the exporting CAD system split
into half-cylinders is one hole. Picking any face of a recognized hole selects the
hole, highlights all of its faces, and its requirements target it by name. A split
hole must be recognized before it is labeled; a single-face cylinder can be labeled
directly or recognized first.

Several holes take one requirement only once each is recognized: the Label tab then
offers `4X` (for four holes) Diameter and Position, listing the holes by name. The holes must
have one diameter. Helios does not infer patterns; the callout lists the holes you
picked.

When a record refers to a face that is not yet a datum, the face is declared as the next
datum in the same edit. A face takes each kind of requirement once; a second one is
refused and the existing record is named.

## Values

- **Distance.** Between two parallel faces with the material between them, it is a
  size (thickness); otherwise a location from the first face to the second.
- **Nominal.** The measured size is shown to four decimals and rounded to a grid you
  choose (0.001 to 1 mm). The proposed grid is the coarsest one on which the measured
  value is already nominal, so 24.9973 proposes 25 and 6.6 stays 6.6.
- **Tolerance.** Never inferred. Enter both allowances, or choose a hole fit (H7, H8),
  which fills them from ISO 286 for the nominal size.
- **Datum references.** Chosen from the declared datums, primary first. A datum cannot
  be referenced twice. Form tolerances (flatness, straightness, roundness,
  cylindricity) have no datum references; profiles may have up to three or none.
- **Zone and modifiers.** An axis control (position, axis orientation, axis
  straightness) has a diameter zone Ø by default; choose **Between planes** for a
  zone between two parallel planes. A feature of size takes a material condition,
  Ⓜ or Ⓛ, regardless of feature size by default. Any control can be marked Free
  state Ⓕ or Statistical ⟨ST⟩; a requirement on several holes can share a Common
  zone.
- If the model's measured size lies outside the band you entered, the card says so and
  Apply needs a second click. The compiler repeats the check as the warning
  `pmi-nominal-outside-geometry`.

The card shows the exact source it will write. **Preview** builds the model with the
record and shows it in the viewport; **Apply** writes it. Undo, checkpoints and
downloads work as for any other edit.

## Changing a record

**Edit** beside a record in the list opens its fields: rename it, change its value,
tolerance, datum references, zone or modifiers as written in the source, or delete it.
**Save** writes the change and rebuilds; a value the compiler refuses shows as a
problem like any other edit, and Undo reverts it. A datum that
other records reference cannot be deleted until they no longer do. To move a
requirement to other faces, delete it and label the new faces.

## Viewing what is labeled

The viewport's PMI legend lists every record. In the **Markers** style each record's
surface carries its own colour and a numbered tag; the numbers follow the `Pmi`
block and the legend. **Drawing** shows the ASME presentation that annotated GLB
export carries. See [Exports](exports.md).

## Limits

A face the Inspector cannot name (it shows no Selector) cannot be labeled; label a
neighbouring face, or write the record in Source. Sizes projected from construction
(`Dimension`, `Location`, `HoleCallout`) are written in Source. Edges and angles
cannot be labeled yet. A hole's location is
the basic location implied by the model when it has a Position to datum planes; there
is no separate location record.

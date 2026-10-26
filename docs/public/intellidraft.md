# IntelliDraft

IntelliDraft constructs a profile from dimensioned shapes and explicit dependencies. Gold rectangles retain their dimensions, right angles and equal, parallel opposite sides. Trace chooses the material boundary from that construction. You edit the driving dimensions instead of maintaining a collection of unrelated corner coordinates.

Open **IntelliDraft** above the viewport. It opens an existing profile-based part when available; **New profile part** starts a separate draft. Otherwise it starts a new construction layout. The current part stays unchanged until the candidate passes **Build and use part**.

## Make an L from two rectangles

The complete reference program is Aetheris's `fixtures/Regression/IntelliDraft/rectangles-l.firmament`. Its intentional revision is `rectangles-l-revised.firmament`.

1. Name the construction layout `layout`, choose **XY**, then **Add Layout**.
2. Add a rectangle named `outer`: **Width = 60 mm**, **Height = 40 mm**, **Center X/Y = 0 mm**. Choose **Add Rectangle**.
3. With `outer` selected, choose **Add related rectangle**. Name it `notch`, keep **Top-right aligned inset**, and select `outer` as its reference. Keep **Use one shared wall dimension**, set **Wall thickness = 8 mm**, then **Add Rectangle**.

The second rectangle has width 52 mm, height 32 mm and center (4, 4) mm. Those are derived values: its top and right edges follow the first rectangle, and its left and bottom edges are inset by the shared wall input. Both rectangles remain gold construction objects.

4. Choose **Trace**. Select a **Trace shape**, then click its highlighted spans on the canvas in this order:

| Shape | Selected span |
|---|---|
| outer | Entire bottom edge |
| outer | Right edge below the notch's bottom-right corner |
| notch | Bottom edge |
| notch | Left edge |
| outer | Top edge left of the notch's top-left corner |
| outer | Entire left edge |

The compiler supplies the named corner landmarks. You do not create six points or six Line2 declarations. Connected spans are oriented to follow the preceding span. Selected pieces stay dark across both rectangles; gold construction remains visible. **Available boundary spans** provides the same choices as accessible buttons.

5. Choose **Trace Profile**, leave **Extrusion depth = 6 mm**, then **Extrude Profile** and **Build and use part**.

This L occupies X=-30–30 mm, Y=-20–20 mm and Z=0–6 mm, with nominal volume 4,416 mm³. To use a whole rectangle instead, choose **Use whole rectangle outline** before **Trace Profile**.

## Edit the explanation of the part

Return to **Shapes** and select `outer`. Change **Width** to 80 mm and choose **Apply shape dimensions**. The notch becomes 72 mm wide and stays aligned. Its width displays **Driven by outerWidth - notchWall**: it is not an independent value to overwrite.

Under **Relationship dimensions**, change `notchWall` to 10 mm and apply it. Both leg widths follow the same input. The notch becomes 70 × 30 mm, and the revised L has nominal volume 6,600 mm³. **Placement** contains the independent center controls.

Shape types supply intrinsic relationships. References and shared parameters supply relationships between shapes. The source retains ordinary Rect2 declarations, named inputs and expressions; the UI does not replace these with sampled points or infer relationships from a mesh.

Apply or discard pending dimension fields before switching tools or building. **Discard dimension edits** resets that form. An invalid change leaves the preceding source and geometry intact; discard the refused input or enter another value. Derived controls show their expressions and remain read-only. Typed tolerances and other driven expressions are not flattened into literal coordinates.

## Trace, drafts and history

Trace selects a boundary; it is not a Boolean union or subtraction. **Close** checks that the selected chain closes and never invents a missing edge. A disconnected, degenerate or invalid trace is rejected. Remove or reorder entries to correct a selection. Re-entering Trace for an existing Profile replaces its boundary only after the new trace resolves.

**Undo** and **Redo** navigate staged source transactions. **Cancel** discards the staged draft. A complete candidate must pass the real engineering build before replacing the current document. Updating an existing part uses the normal undoable graph transaction. Save source or create a checkpoint to retain work across closing or refreshing a local browser tab.

## Advanced construction

**Advanced: points, lines and Paths** retains named Point2/Line2/Circle2 guides and ordered line/arc Path steps. These are escape hatches when closed shapes do not express the design well. Circle spans use named endpoints; Paths use distances, radii and signed turns. Positive turns are counterclockwise; **Close Path with line** explicitly adds a closing line.

**Advanced construction objects and dimensions** edits those authored points and literal step dimensions. Existing rectangle/slot dimensions and circular profile openings also remain available through **Sketch**.

## Limits

The relationship preset covers an unrotated reference rectangle in the same Concept Struct, aligned at its top-right with either a shared wall input or separate left/bottom insets. It is not a general rotational mate or inverse constraint system. Edit the driving inputs rather than asking a derived field to solve backwards.

Construction layouts support XY, XZ and YZ. Paths created here use XY. The frame banner shows how local axes map into world space. Boundary span choices use existing named landmarks; arbitrary intersections, geometric snaps, new inner-loop assembly, arbitrary trim/extend and freeform curve editing are not implemented. There is no simultaneous 2D constraint solver.

The canvas samples compiler-resolved curves for display only. Engineering geometry and validation remain compiler-owned. Included/generated construction does not become writable by flattening its expanded geometry.

Related: [graph modeling](graph-modeling.md), [exports](exports.md).

# Make a part through the graph

Use the graph to create a block, drill holes, finish edges and export exact
geometry without writing Firmament. No AI connection is needed.

Drag a card by its header to arrange the graph. Positions stay in the open workspace
when you select cards, edit fields, rebuild, or switch views. This changes the graph
layout only; it does not move a physical part or reorder source declarations.
**Auto arrange** restores the automatic layout for the current graph view.
Manual positions reset when the workspace is closed or the page is refreshed.

The **Parts** graph's links display source dependencies. Cards have no draggable
wire ports: use their fields and **+ Add** to author bodies and features. The
**Assembly** graph retains frame-to-frame dragging to create a mate, with the
mate type chosen before applying the compiler-checked edit.

Assembly ports represent named **mate frames**. Drag from the first, fixed frame
to the second, moving frame, then choose a mate type in **Create mate**. The dialog
shows both frame references; dropping on a part card lets you choose its moving
frame. **Preview → Apply** writes the compiler-checked Firmament `Interface<…>`
and mate definition. These connections have physical assembly meaning. Firmament
source remains authoritative for the graph, fields and resulting placement.

For a custom outline, use [IntelliDraft](intellidraft.md): named points and
guides or distance-driven Paths, then Trace and Extrude. **Sketch** retains the
closed-shape dimension workspace for rectangles, circles and slots.

1. Choose **New part**. In **Choose base shape**, keep **Box**, enter Size X = 60,
   Y = 40 and Z = 12 mm, then **Preview → Apply**. The block is centred in X/Y;
   its bottom is at Z = 0.
2. Choose **Top**, click the broad face, then choose **Add hole on selected
   face**. Set **Center X** to 8 mm, **Center Y** to 4 mm, and **Diameter** to
   8 mm. Keep **Through all**. The gold preview updates after edits. Choose
   **Apply** when it succeeds.
3. Click the hole's row in the Modify card to edit it. Change X, Y and diameter,
   then click **Apply changes** once. **Discard edits** resets unapplied values.
   Changing focus between fields does not rebuild the part.
4. In Graph, choose **Chamfer face rim…** to break the whole top rim. Keep the
   top face and Boundary target, enter 0.5 mm, then **Preview → Apply**.

   A Box also supports a whole-face rim finish on the bottom or any side: change
   **Face** before Preview. Rim previews draw the candidate's BRep boundaries
   as gold polylines over the current solid. The solid, source and export remain
   unchanged until **Apply**. **Cancel** removes the gold guides. For a refused
   preview, the message next to **Apply** tells you what to change.
5. Use **Export → STEP AP242 → Download selected format**. **Save source**
   downloads the editable design. Save before closing or refreshing a local tab.

**Counterbored hole…**, **Countersunk hole…** and **Blind hole…** use the same
placement steps on the top face of a block. Open the tool, click the face,
then drag the gold ring or enter **Center X/Y** to position the hole. On a
block, (0, 0) is the center of the top. **Apply** becomes available once
the preview succeeds.

For a blind hole, set **Blind depth** with room for the drill tip. Use
**End → Through all** when the hole should exit the other side. A flat
bracket face supports through holes, including recessed holes. **Other
expression…** retains access to parameter references and other compiler-admitted
expressions.

For a mounting hole on **Simple Bracket**, click its broad horizontal face and
choose **Add hole on selected face**. Alternatively choose **Add hole…** first,
then click the face. Drag the gold ring to position the hole. The complete disk
stays inside the face with positive edge clearance. Shift-drag or right-drag
keeps camera control available. **Center X/Y** refine the position in the face's
construction frame; a 6 mm hole at X = 13, Y = 10 mm is centered at world
(16, −10, 3) mm. The preview checks automatically after an edit settles.
**Apply** writes one undoable source edit; **Cancel** leaves the source intact.
See the [complete bracket example](https://github.com/yuechen-li-dev/Aetheris/blob/master/fixtures/Regression/OrientedComposeHoles/bracket-foot-hole.firmament).

One bracket face can contain multiple separated **Hole**, **Counterbored hole**
and **Countersunk hole** features. A block supports several plain through holes
or one recessed hole. A blind hole with a drill point must be the only hole on
its block. To add multiple through holes, change the existing blind hole's
**End** to **Through all** first. Counterbores and countersinks show the shaft
and outer recess circles. Dragging reserves at least 0.01 mm between the opening and face
edges or existing openings. If an exact coordinate violates clearance, move
the center or reduce the diameter before applying.

On this 3 mm thick bracket, a counterbore with a 4 mm shaft, 7 mm outer diameter
and 1 mm depth fits; a countersink with a 4 mm shaft, 7 mm outer diameter and
90° angle also fits. Recesses must leave at least 0.01 mm of shaft depth before
the exit. See the [multiple-hole example](https://github.com/yuechen-li-dev/Aetheris/blob/master/fixtures/Regression/OrientedComposeHoles/bracket-multiple-face-holes.firmament).

The gold arrow points inward, into the selected face; the larger recess opens
on that face. New counterbores start at 1 mm depth. New countersinks start with
a 6 mm shaft, 8 mm outer diameter and 90° angle (a 1 mm recess). A recess as
deep as the wall cannot leave a smaller through shaft: for a 3 mm wall, the
maximum recess depth is 2.99 mm. A refused preview reports the actual available
thickness and tells you which parameter to reduce. The accepted solid remains
visible until Apply.

**Clear face** returns to the manual **Face** and **Center** controls. On an
extrusion, choosing **+Z** directly follows the profile's extrusion axis
(world −Y for this bracket's XZ sketch). Click the physical face in the
viewport when you want to drill perpendicular to it. **Field help** explains
the available fields.

For a field of round vents, choose **+ Add → Perforation** on a block without
holes or edge finishes. Keep **Face** at **+Z**, choose **Grid** or **Hex**,
and set **Pitch** greater than **Diameter** to leave material between openings.
**Margin** sets the clearance to the edges. Choose **Preview → Apply**.

Use **Pocket…** for a finite recess; **+ Add** opens the full catalog. A part has
one material body. Choosing another base replaces that base and checks its
existing downstream features. Use an Assembly for separate parts.

## Finish one selected edge

Choose **Edges** in the viewport toolbar's **Pick** control, or choose
**Finish an edge…** from the Graph actions. Click the edge you want to finish.
Choose **Fillet selected edge** or **Chamfer selected edge** above the viewport.
Set **Radius** or **Distance**, inspect the automatic gold preview, then **Apply**.
The dialog locks the target to the selected edge. Cancel leaves source unchanged;
Apply writes one EdgeFinish declaration and can be undone in one step.

For Simple Bracket, use **Iso** and select the inside crease where the foot
meets the upright. The selection reads **Inside bend · full length**. A 2 mm
radius creates a concave fillet across the entire 20 mm width. Outside corners
running across the extrusion also support fillets and chamfers. The selected
edge alone is thick gold; an edge under the pointer is cyan. The body keeps its
ordinary shading so the target stays clear.

These longitudinal finishes modify one straight-sided profile corner and sweep
it through the extrusion. Preview requires at least 0.01 mm of remaining
material at adjacent legs and other boundaries. You can finish multiple
different original corners, mixing fillets and chamfers. A second finish on
the same corner, or finishes that consume their shared edge, are refused.
Radius and Distance must be at least 0.01 mm.

Extrusion end-face edges currently offer chamfer only. Full-edge fillets on
those edges are not yet supported; the earlier inset cap-fillet demo is no
longer offered as a standard UI fillet. The Box's shared +X/+Z edge retains its
qualified route. Imported edges, curved profile corners and other unqualified
selections show why the operation is unavailable and what to try. Use
**Fillet face rim…** or **Chamfer face rim…** to finish the full boundary of a face.
On an extrusion, choose **Top** or **Bottom** for the rim. Select an end face
before opening the form to use **Use picked face**.

On a single profile extrusion, these corner finishes combine with separated
picked-side through holes, counterbores and countersinks on either bracket leg.
Add the holes before or after the finishes. Hole coordinates stay anchored to
the original construction face; the remaining face boundary clips placement.
The complete shaft/recess envelope must retain at least 0.01 mm clearance from
finished boundaries and other holes. A colliding preview disables Apply and
leaves accepted source and geometry intact. Move the hole, reduce the finish,
or cancel the draft. End-face finishes combined with picked-side holes and
general Compose histories are not supported by this route.

## Drafts, failures and history

A placement preview does not change working source. **Cancel** leaves the
accepted design intact. **Preview** and **Apply** stay below the editable fields.
If a preview is refused, use its recovery message to correct the size or selection.
Open **Technical details** for the compiler's full reason. Editing an existing
node and choosing **Apply changes**
changes source and builds it. If that build fails, the last good geometry stays
visible and is marked out of date. The inspector reports the diagnostic and
offers **Revert to last good**. This also resets the displayed fields.

Toolbar **Undo/Redo** reverses complete source transactions and rebuilds. Escape
discards the focused field's pending text; it does not commit it on blur.
During a build or graph refresh, edit controls are temporarily disabled so that
another operation cannot target an older source revision. Apply or discard
unapplied field edits before switching selections.

Unapplied graph fields keep Source, Parameters and other editing operations
unavailable until **Apply changes** or **Discard edits**. Selecting another card
or navigating to its source keeps the current field draft in place. Saving is
also unavailable while these edits are pending, so a download cannot silently
omit the values still shown in the inspector.

The compiler admits supported feature combinations; the graph does not broaden
kernel capabilities. Angular mold Draft is currently a legacy V1 operation and
is not exposed as a V2 graph feature. A saved or failed editing draft is a
different concept. Arbitrary-body fillets and every face/feature combination
are not supported. A rejected preview reports the actual failure.

See [exports](exports.md), [standalone setup](standalone.md) and the
[Firmament language reference](https://github.com/yuechen-li-dev/Aetheris/blob/master/docs/public/reference/language/README.md).

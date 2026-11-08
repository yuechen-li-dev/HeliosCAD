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
2. Select the **Body** card. Click **Add hole…** beside its values. Leave **On**
   at +Z for the top face. Set Center X = 8, Y = 4 mm, Diameter = 8 mm, and
   **End → Through all**. **Preview** displays the candidate. **Apply** commits it.
3. Click the hole's row in the Modify card to edit it. Change X, Y and diameter,
   then click **Apply changes** once. **Discard edits** resets unapplied values.
   Changing focus between fields does not rebuild the part.
4. Click **Chamfer…** or **Fillet…**. Keep the top face and Boundary target;
   enter a distance or radius such as 0.5 mm. **Preview → Apply**.

   A Box also supports a whole-face rim finish on the bottom or any side: change
   **Face** before Preview. Rim previews draw the candidate's BRep boundaries
   as gold polylines over the current solid. The solid, source and export remain
   unchanged until **Apply**; **Cancel** removes the gold guides. Interfering or
   unsupported combinations report a compiler diagnostic instead of a preview.
5. Use **Export → STEP AP242 → Download selected format**. **Save source**
   downloads the editable design. Save before closing or refreshing a local tab.

**Counterbored hole…**, **Countersunk hole…** and **Blind hole…** use the same
placement workflow. A blind hole has a **Blind depth** input. In the End control,
you can switch between through and blind termination. **Other expression…**
retains access to parameter references and other compiler-admitted expressions.

Center X/Y are measured in the support face's local frame, from its authored
origin; they are not screen coordinates. **Use picked face** copies a retained,
source-addressable support from the viewport. Unsupported or unmapped faces are
not substituted with another face. **Field help** explains the compiler's fields.

For a mounting hole on **Simple Bracket**, click its broad horizontal face and
choose **Add hole on selected face**. Alternatively choose **Add hole…** first,
then click the face. Drag the gold ring to position the hole. The complete disk
stays inside the face with positive edge clearance. Shift-drag or right-drag
keeps camera control available. **Center X/Y** refine the position in the face's
construction frame; a 6 mm hole at X = 13, Y = 10 mm is centered at world
(16, −10, 3) mm. The preview checks automatically after an edit settles.
**Apply** writes one undoable source edit; **Cancel** leaves the source intact.
See the [complete bracket example](https://github.com/yuechen-li-dev/Aetheris/blob/master/fixtures/Regression/OrientedComposeHoles/bracket-foot-hole.firmament).

The same face can contain multiple separated **Hole**, **Counterbored hole** and
**Countersunk hole** features. Choose the tool, click the face and drag its gold
preview. Counterbores and countersinks show the shaft and outer recess circles.
Placement reserves the outer recess diameter, with at least 0.01 mm of material
between holes and face boundaries. Dragging avoids existing circular openings;
exact coordinates that violate clearance disable Apply. Features keep their
individual names, dimensions and undoable source edits.

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

Picked-face placement requires convex planar outer boundaries, circular inner
openings, and a clear contained corridor to a parallel exit. Each hole reserves
a full-depth clearance cylinder at its largest radius; crossing envelopes and
unsupported trims reject. A face selector names its source construction, so it
does not depend on display triangle or BRep face numbers.

The legacy **On +Z** form follows the Profile's local extrusion axis (world −Y
for this bracket's XZ sketch). It is separate from picked-face placement.
Apply remains disabled until a preview succeeds. Exact coordinate edits outside
the support bounds disable Apply; dragging clamps to a safe position.

Use **Pocket…** for a finite recess; **+ Add** opens the full catalog. A part has
one material body. Choosing another base replaces that base and checks its
existing downstream features. Use an Assembly for separate parts.

## Drafts, failures and history

A placement preview does not change working source. **Cancel** leaves the
accepted design intact. Editing an existing node and choosing **Apply changes**
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

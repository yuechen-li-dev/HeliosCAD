# IntelliDraft

IntelliDraft draws retained construction shapes, then traces a material Profile from their boundaries. A rectangle retains its exact size, right angles and parallel opposite sides. Each shape has its own placement. Temporary alignment guides help you position shapes without creating persistent relationships or a constraint solver.

Open **IntelliDraft** above the viewport. It edits an existing profile-based part when available; **New profile part** starts a separate draft. Otherwise it starts a new construction layout. The current part stays unchanged until **Build and use part** succeeds.

## Draw, dimension, place, repeat, trace

The complete reference program is Aetheris's `fixtures/Regression/IntelliDraft/independent-rectangles-l.firmament`.

1. Name the layout `layout`, choose **XY**, then **Add Layout**.
2. Name the first rectangle `outer`. Drag between two corners on the canvas to draw it. Enter exact **Width = 60 mm**, **Height = 40 mm**, then **Apply shape dimensions**. **Placement** lets you enter an exact center; use **Center X/Y = 0 mm** for this example. Alternatively, fill these values before choosing **Add Rectangle**.
3. Choose **Draw rectangle**, name it `notch`, and draw the second rectangle. Set its exact **Width = 52 mm**, **Height = 32 mm**, then apply.
4. Drag the second rectangle until its top and right edges align with the first. Pink guides indicate nearby edge or center alignment. Release to store its placement: **Center X/Y = 4 mm** in this example. You can verify or enter these values under **Placement**.

The placement is a number, not a relationship. Moving or resizing `outer` later does not pull `notch` along. The rectangles retain their own shape properties; the source does not acquire a hidden mate or an expression linking the two shapes.

**Hold Alt while dragging** to bypass alignment. **Escape** cancels the active gesture without closing the workspace or changing source. Pointer cancellation also abandons the preview. Drawing corners and unsnapped dragging use 0.1 mm authoring increments; an alignment uses the projected target position exactly. This increment is not a declared manufacturing tolerance. Explicit numeric fields can use finer precision.

**Fit construction**, **+ / −**, and middle-button dragging navigate the canvas. Click a shape card to inspect its dimensions. Overlapping shapes can be selected through their cards; dragging the visible body uses the topmost shape under the pointer.

5. Choose **Trace**. Select a **Trace shape**, then click these spans in boundary order:

| Shape | Selected span |
|---|---|
| outer | Entire bottom edge |
| outer | Right edge below the notch's bottom-right corner |
| notch | Bottom edge |
| notch | Left edge |
| outer | Top edge left of the notch's top-left corner |
| outer | Entire left edge |

Named corners supply the endpoints. You do not author six points or six Line2 declarations. Connected spans follow the preceding span; selected pieces stay dark while the gold construction remains visible. **Available boundary spans** offers the same choices as accessible buttons.

6. Choose **Trace Profile**, leave **Extrusion depth = 6 mm**, then **Extrude Profile** and **Build and use part**.

The L occupies X=-30–30 mm, Y=-20–20 mm and Z=0–6 mm, with nominal volume 4,416 mm³. For a single rectangle, **Use whole rectangle outline** replaces span-by-span selection.

## Exact inputs and transactions

Drawing and dragging preview locally, then submit one compiler-owned source transaction on release. Dimension fields require **Apply** or **Discard** before switching editors, tools or building. Independent dimensions remain writable; expression-driven dimensions show their authored expressions and remain read-only. Dragging never replaces an explicit expression with a number.

**Undo** and **Redo** navigate staged source transactions. **Cancel** discards the staged draft. Save source or create a checkpoint before closing or refreshing a local browser tab. A complete candidate must pass normal engineering build admission before replacing the current document.

A traced Profile must remain closed and valid. A move that breaks an existing Profile is refused with the compiler's diagnostic and leaves the preceding candidate intact; another shape is never moved to repair it. Correct the placement or use Trace to select a different valid boundary. **Close** verifies closure and never invents a missing segment.

## Explicit dependencies are optional

Under **Advanced: explicit expression relationship**, **Add related rectangle** intentionally creates a dimension-driven top-right inset with a shared wall or separate insets. This is an explicit source expression workflow, separate from independent placement. Its values remain editable through their driving inputs. Ordinary dragging and alignment never select this behavior implicitly.

Existing references `rectangles-l.firmament` and `rectangles-l-revised.firmament` demonstrate those optional explicit dependencies.

## Advanced construction and limits

The direct draw-and-drag tool currently creates rectangles. Shapes whose compiler-projected center controls are independently writable can be moved; positions driven by expressions retain their inputs. **Advanced: points, lines and Paths** retains named Point2/Line2/Circle2 guides and ordered line/arc Path steps. Circle spans use named endpoints. Paths use distances, radii and signed turns; **Close Path with line** explicitly adds a closing line. Existing slot and rounded-rectangle dimensions and circular profile openings remain available through **Sketch**.

Layouts support XY, XZ and YZ; UI-created Paths use XY. Alignment considers shapes in the same layout, using compiler-projected bounds. It is temporary positioning assistance, not general geometric inference. Trace uses existing named landmarks. Arbitrary intersection creation, new inner-loop assembly, arbitrary trim/extend and freeform curve editing are not implemented.

The canvas samples compiler-resolved curves for display only. Geometry, admissibility and source provenance remain compiler-owned. Included/generated geometry does not become writable by flattening its expansion.

Related: [graph modeling](graph-modeling.md), [exports](exports.md).

# Helios Preview 4

The front page is an object catalog: natural Inter lettering, monochrome wireframe
cards on warm paper and short model names. **New part** opens a base-shape chooser with a box starter;
**New assembly** opens an editable two-component starter. Both are browser-local
workspaces with the existing build, source-download and STEP-export paths.
Search or filter, then click a card to open its intact source project. New browsers use
the white **Apollonia** theme; **Dark** switches to the green-and-gold **Bronze Age**
palette. The choice follows you into the editor and is remembered across reloads.

The **HeliosCAD** hero sets CAD in a lighter Inter weight. A short statement rolls
up every five seconds, with one line visible at a time. Hover, keyboard focus or
the pause control stops it; reduced-motion preferences keep the first line static.

ATLAS's card uses an explicitly recorded bent-arm presentation pose, evaluated by
Aetheris's assembly kinematics. Opening the canonical example retains its authored
zero pose. The card texture is a subtle presentation overlay; SVG geometry remains
the native topology projection.

Open the root page to browse local examples. No account or backend is required for the showcase. Community discovery and saved account projects remain at `/discover` and `/projects`.

1. Open **Mounting plate** for a first model, or choose a composed project.
2. Use **Graph** to select a body or feature and edit its dimensions, then **Apply changes**. **Source** opens Firmament in Monaco; use **Build** or **Ctrl+Enter** after source edits. See [Make a part through the graph](graph-modeling.md) for a complete no-code block-to-hole workflow.
3. Drag the viewport to orbit, Shift-drag to pan, and scroll to zoom. **F** fits the model. Camera presets and authored Scene cameras are available in the viewport.
4. Use **Files** to browse separate project documents and the compiled hierarchy. **Inspector** shows selected semantic and occurrence data. Clicking a diagnostic navigates to its source when a location is available.
5. Download the active source with **Save source** or **Ctrl+S**. Local documents live only in the current browser session. Multi-file local editing does not add multi-file cloud persistence.

Build always targets the project root, including edits in supporting files. Switching files does not build or discard edits. A failed build retains the last valid geometry and labels it as out of date. Problems show the compiler's actual diagnostic codes and explanations.

### Modeling through the graph

Select a card or one of its rows to open **Selection** below or beside the graph.
Box **Size** has X/Y/Z inputs. Simple `Point2` and `Point3` fields, including hole
**Center**, have coordinate inputs with their authored units. A coordinate supplied
by a named parameter remains a parameter link. More complex expressions remain
text fields; the graph does not turn relationships into fixed numbers.

Use **+ Add** to search bodies, features and contextual construction actions.
New features open a pending placement panel. Choose the host and support, then
set dimensions and Center X/Y. **Use picked face** copies an actual compiler-owned
selector from the viewport. Unmapped display faces cannot be used as source
references. Retained top/bottom faces of qualified plain shaft-hole box stock
are mapped; other construction families can still have unmapped faces.

**Preview** compiles the complete candidate without changing working source.
The viewport labels the preview explicitly; exports are disabled until you
**Apply** or **Cancel**. Apply commits one undoable source transaction. A refused
preview reports the compiler diagnostic and leaves the accepted model intact.
Existing node fields collect edits until **Apply changes**; coordinate components
and dimensions build together. **Discard edits** resets pending values. A refused
applied draft retains the last valid geometry and offers **Revert to last good**.

Select a body for **Replace base…** or **Pocket…**. Replacing a base retains its
name and downstream references, and checks whether those features still work.
Changing shape uses the catalog defaults shown in the panel. Pockets accept an
existing Profile or a new circle/rectangle, and finite depth. Qualified plain
Box or Extrude stock is converted to equivalent Compose stock; unsupported
fields or body combinations are refused rather than discarded.

Select a field-based Hole in Modify for **Pattern…**. Grid counts include the
original seed; row/column keys identify additional occurrences. Select a Profile
for **Extrude…**: this edits the extrusion end while retaining its authored start.
The compiler remains the authority on which combinations can build.

The grid creation action is one Pattern workflow. Existing Function-driven
patterns retain their authored layout and recipe. Navigate **Concept Struct →
Points → Series** to edit literal bounds or the position expression; select a
**Function** card to edit its **Value** expression. These rebuild normally.
Generated features remain read-only projections. There is not yet one inspector
joining the Pattern, layout, law inputs and generated keys.

A current compiler binding gap affects checked Static count/spacing inputs in
part Series, even though assembly Series admits them. **Make count a parameter**
can therefore create a rejected draft there; **Revert to last good** or Undo
recovers it. This is a defect being tracked, not a requirement to freeze design
parameters into literal coordinates.

**New assembly** publishes Bottom/Top frames on its two components. Use **+ Mate**
or drag between published frame ports, then choose fixed and moving frames and
preview the relationship. Apply replaces the moving component's absolute
Placement in the same transaction. **Edit mate…** retargets its endpoints while
retaining the authored contract and options. **Place component…** provides X/Y/Z
translation and one-axis rotation for literal Origin-to-Parent placements.
Named-frame placements, expressions and general matrices remain source-driven;
mate-driven components direct you to their relationship instead.

The **⇡** beside a numeric dimension makes it a named parameter. Change shared
dimensions in **Parameters**. **Delete** asks before removing a declaration.
Toolbar **Undo/Redo**, **Ctrl+Z**, **Ctrl+Shift+Z** and **Ctrl+Y** use the same source
history as Monaco; graph transactions undo in one step and rebuild. In text
fields, normal text editing shortcuts retain their ordinary behavior.
Use **Version Control → Save checkpoint** before a group of edits; **Restore**
keeps a checkpoint of the state being replaced. Checkpoints live in this browser.

For a profile-based part, choose **Sketch**. If the current solid has no editable
Profile, **New sketch part** starts a separate rectangle-and-extrusion document;
keep the current work with Save source or a checkpoint first. In Sketch, edit
Width/Height or drag their handles. **Circular profile opening** can follow a named
rectangle corner or midpoint using inward offsets. **Done** returns to the graph.
Source remains available for compiler features beyond these qualified UI actions.

The **Export** picker offers the formats admitted by the compiled model, including
STEP AP242, GLB and USDA. Scene has no STEP product export. See
[export formats and limits](exports.md), including supported datum/diameter PMI
labels and tolerance metadata in GLB. **Import STEP** opens the supported
canonical single-part annotation workflow; **Open file** also reopens portable
`.helios.zip` workspaces containing source and immutable STEP assets.

Drag pane separators or focus them and use arrow keys. The utility dock and bottom panel can collapse. **Ctrl+Shift+P** opens the command palette, which includes formatting and existing source-authoring actions. The terminal is available only on the local Vite development host, and starts when its tab is opened.

Inter is bundled locally and used throughout the workspace, source editor and terminal. **Wrap** above the source editor, or **Alt+Z** while editing, toggles word wrap. That preference is remembered in this browser. Long unwrapped lines scroll horizontally; the vertical scrollbar has its own opaque gutter.

**AI Author** is separate from **Version Control**. Provider configuration is required
for AI authoring; ordinary graph editing, builds, checkpoints and local exports do
not require an AI provider. Spatial examples demonstrate static authoring and
interchange, not factory automation or manufacturing simulation.


A separate Function parameter-shadowing defect can admit incorrect equation
results when a module Static has the same name as a Function parameter. This
needs compiler binding repair before broader equation-pattern editing is exposed;
successful validation alone does not rule out this known counterexample.


### Source-preserving Patterns

Use **Patterns…** in the graph construction menu to reopen a finite Pattern,
its layout, shared law inputs and recipe. New applications can use an existing
keyed collection, equation Series or named stations. Preview builds the complete
candidate project; Apply commits one undoable transaction. Evaluated keys and
expansion associations are read-only. The gold Point2 plot is explicitly local
layout space; it does not guess the recipe's support frame.

Use **Grid seed hole…** for the separate rectangular Hole helper (counts include
the seed). Legacy radial/linear forms remain supported by their domain compiler;
the finite-layout panel explains when it has no visual adapter. Imported laws
remain in their source file; open that file to edit them.

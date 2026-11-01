# Group movement, guide dimensions and explicit mates

Date: 2026-11-01

The separate Vite startup failure recorded below was reproduced and fixed in the
[UI polish and startup follow-up](ui-polish-startup.md).

The follow-up usage pass adds temporary group selection/movement, circular guide
radius editing and explicit mate-frame wording. Firmament remains authoritative:
the UI submits compiler AST edits and validates the resulting sketch before
accepting a source revision. No persistent grouping, dataflow runtime or constraint
solver was added.

## Behavior

- **Group select (G)** supports enclosed-box selection, Shift addition/removal,
  sidebar selection, Select all and Clear. Dragging a selected element previews
  every member. Exact Move X/Y uses the same transaction path.
- A group move edits all selected placements in one compiler call and one Undo
  step. Shared arc/chord points and direct literal Static placement inputs are
  deduplicated. Conflicting shared parameters, driven placements and mixed-layout
  groups refuse the whole move. Source references survive.
- The guide inspector edits line endpoints, arc/circle center and radius, and axis
  origin. Arc radius changes preserve center, endpoint angles and sweep; center
  edits translate it. Connected named points remain shared. Invalid dimensions or
  invalid resulting construction retain the preceding candidate.
- Draw permits construction editing. Trace/Extrude keep dimensions and movement
  locked; Shift-selection in Trace does not switch stages. Pending guide edits
  require Apply or Discard.
- Assembly handles identify their named mate frames. Create mate states which
  frame is fixed and which is moving; Preview/Apply writes the existing Firmament
  Interface/mate through the compiler. Parts dependency edges retain their hidden,
  nonconnectable React Flow anchors and expose no interactive wire ports.

## Usage findings and correction

Manual Edge usage drew a rectangle and arc, changed the arc radius from 9 to 12 mm,
then moved both by X=5/Y=4 mm. The inspector confirmed center 23/3 became 28/7 mm
with radius 12 unchanged. Undo restored construction but initially left stale
inspector coordinates, incorrectly blocking tools as pending edits. The inspector
now resets against compiler-resolved values when the asynchronous projection
arrives. Manual Undo/Redo confirmed 23/3 ↔ 28/7 with no pending edit. A component
regression and browser history assertions cover this failure.

## Validation

- `npm test`: 46 files, 220 tests passed.
- `npm run build:fast`: passed; existing bundle-size advisory remains.
- Graph browser suite: 12 passed, including real frame-handle drag, Fixed mate
  Preview/Apply, source download and absence of visible/connectable Parts ports.
  The focused mate test also passed after the final header wording change.
- IntelliDraft browser suite against the built app: 22 passed, including group boxing/drag/numeric move,
  one-step Undo, shared arc/chord endpoints, circular radius edits, invalid-radius
  discard, stage locks and source/STEP export.
- The group specimen builds an extruded circular cap after moving a rectangle,
  arc and chord together. The saved source retains shared point references at
  center 25/7, start 40/7, end 25/22 mm. CLI validation reports valid; downloaded
  STEP analysis reports enclosed-manifold with bounds (25,7,0)–(40,22,6) mm.
- `git diff --check`: passed.

One intermediate development-server rerun failed before New part appeared:
Vite reported `@vitejs/plugin-react can't detect preamble` in LocalHostControl.
The failure trace is retained under
`artifacts/local/intellidraft/browser-tests/intellidraft-draw-dimensio-837c3--alignment-then-trace-the-L/`.
The final built-app run uses preview on port 4176 without hot reload; it does not
claim to fix this development-server initialization failure. Optional local AI
host proxy requests also report connection refused when no host is running; the
anonymous CAD workflows use the browser runtime.

Local evidence (ignored):

- `artifacts/local/group-guides-tests.log`
- `artifacts/local/group-guides-build.log`
- `artifacts/local/group-mates-graph-suite.log`
- `artifacts/local/group-guides-draft-suite.log`
- `artifacts/local/group-guides-draft-preview-suite.log`
- `artifacts/local/mates-browser.log`
- `artifacts/local/intellidraft/group-move.png`
- `artifacts/local/intellidraft/arc-guide-inspector.png`
- `artifacts/local/intellidraft/group-moved-arc.firmament`
- `artifacts/local/intellidraft/group-moved-arc.step`
- `artifacts/local/graph-authoring/explicit-frame-mate.png`

## Boundaries

Groups are temporary selections within one drawing layout. They translate without
scaling or introducing relationships. Shared driving inputs retain their source
semantics, including effects on other dependants. Infinite axes use row selection
instead of requiring a box to enclose their display extent. Driven guide inputs
remain read-only. Connected construction and traced Profiles still require normal
compiler admission; the UI does not repair invalid geometry or invent intersections.
The existing ellipse tool remains available, but circle/arc edits stay circular.
Only HeliosCAD files changed; sibling Aetheris supplied the existing runtime and
read-only CLI validation.

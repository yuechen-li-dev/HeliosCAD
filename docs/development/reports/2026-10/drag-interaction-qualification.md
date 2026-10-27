# Graph and IntelliDraft drag qualification — 2026-10-26

Verdict: **Success for the qualified workflows**. Card placement works in both
graph views, and draft preview work is bounded by display frames. This does not
claim a frame-rate guarantee for arbitrarily large imported models.

## Repairs

Both React Flow canvases explicitly disabled node dragging and discarded position
changes. They now consume React Flow's position/dimension changes through one
shared hook, preserving untouched node objects and measured dimensions. Card
headers are the drag handles; declaration-row reordering and frame connections
retain their existing gestures. Layout coordinates live in the open workspace,
separately for each document and assembly/parts view. Selection, field edits,
rebuilds, and switching to Source do not discard them. Auto arrange resets the
current view. Refreshing/closing the workspace discards these presentation-only
coordinates; neither Firmament nor checkpoints acquire layout bookkeeping.

Changing graph view also resets the React Flow provider, preventing the old view's
nodes from briefly being interpreted with the new view's node types.

IntelliDraft previously processed every pointer event, remeasured the SVG more
than once per update, and regenerated the annotation layer during preview moves.
It now processes the newest sample once per animation frame and memoizes the
annotation projection. Pointer-up independently resolves the final coordinates,
so throttling cannot discard the drop location. Pan uses absolute screen
displacement instead of the last event's movement delta. A shape retains its grab
offset from pointer-down, with no initial jump or geometry edit on a simple click
or a drag back to its starting point. Escape, pointer cancellation, capture loss,
revision/disabled changes and unmount cancel queued work. Geometry edits still go
through the existing compiler transaction, once on drop.

## Evidence

- `npm run build:fast` passed.
- Helios unit suite: 44 files, 203 tests passed. New tests cover untouched card
  identity, retained positions/measurements, final drop coordinates, click/no-op
  drags, cancellation, complete panning displacement and bounded pointer work.
- Graph browser suite: 10 passed. The two added drag cases were repeated after
  the provider change: 2 passed. Part positions survive selection, Source/Graph,
  rebuild and a real Size field edit. Assembly positions survive Parts/Assembly.
  Source is byte-identical after layout-only moves; the part's exported STEP is
  also byte-identical before/after. Auto arrange restores automatic placement.
- IntelliDraft browser suite: 19 passed, including retained geometry qualification
  through the real SDK and CLI. The eight-shape drag case preserves accepted
  Center values during motion, commits the exact drop, cancels another drag, and
  undoes the committed move.
- Same-frame burst comparison against Helios commit `6e6a9bb`: 100 shape-move
  events required 200 SVG matrix reads and 100 annotation projections before;
  after, 1 matrix read and 0 annotation projections. Neither version compiled
  during motion. These are deterministic work counts, not a timing benchmark.
- Real Chrome eight-shape drag: 120 pointer moves, 120 matrix reads, no compiler
  work during motion. Observed frame intervals: median 8.0 ms, p95 8.1 ms, maximum
  8.5 ms on this workstation. These are local observations, not CI thresholds.

Ignored evidence is under `artifacts/local/drag-*`,
`artifacts/local/graph-authoring/` and `artifacts/local/intellidraft/`.
No kernel, SDK, geometry or compiler implementation changed. The unrelated .NET
solution suite was not rerun; browser geometry tests use the existing real CLI.

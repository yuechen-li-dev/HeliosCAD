# Graph authoring usability and integrity

## Changes

The motivating workflow is a fresh user making a block, adding a hole, editing
its dimensions and finishing its edges entirely through the graph. The initial
UI required hunting through the generic palette, supplied no base dimensions,
and rebuilt between field blurs. It also allowed gestures against an older
outline after a successful build.

- Context actions expose shaft, blind, counterbored and countersunk holes, fillet
  and chamfer on the selected or sole body. The full palette remains available.
- Base creation/replacement exposes its actual compiler-outlined fields.
- Node dimensions apply as one AST edit transaction. Coordinates, units and
  parameter references are retained. Apply/Discard and visible field help replace
  blur-time builds. Escape discards the focused edit.
- Hole supports and termination presets and EdgeFinish metadata come from the
  compiler's generated schema. Through/blind termination has a mode and a depth
  control; expressions remain available. Card rows show names and summaries on
  separate lines, and longer field labels wrap.
- All graph mutations wait for an outline matching the current document and
  source revision. This closes the observed `Untitled/Body` versus
  `Untitled/Box:Body` stale-ID failure between consecutive features.
- Revert resets local field drafts by source revision and rebuilds the restored
  source into the live SDK session. Updating only the displayed snapshot left
  exports using the rejected source even though the viewport looked recovered.
- Pending-authoring errors preserve SDK exception details instead of displaying
  only “Aetheris could not complete the operation.”

## Compiler-side pocket failure

The finite pocket built in the CLI but failed during browser source projection:
`Duplicate construction correspondence for BRep face 12.` Section-stack emission
retained both profile construction evidence and its material feature owner as
primary mappings of the same face. Construction origins are now explicit topology
aliases; picking has one primary feature owner while semantic queries retain the
original physical/source evidence. Unmarked duplicate owners and dangling aliases
still fail. Hole/counterbore/slot correspondences use the same producer-owned rule.
No geometry operations, dimensions, STEP surfaces or trims were changed.

## Qualification

Commands and generated evidence are under `artifacts/local/graph-ux-*` and
`artifacts/local/graph-authoring/`. Browser qualification creates each part through
visible graph controls; it never replaces source to manufacture a passing case.
STEP downloads are independently inspected by Aetheris.CLI for enclosure, bounds
and topology. The 60 × 40 × 12 mm block with an 8 mm through hole has analytic
volume 28196.814210510758 mm³, matching box minus cylinder. Recovery compares the
STEP DATA section before and after a refused draft.

Final results and package qualification are recorded below when completed.

## Remaining boundary

Angular mold Draft is not a V2 Modify feature. Its existing bounded implementation
is in the legacy V1 executor (`ExecuteBoundedDraftOnRecognizedOrthogonalRoot`),
with legacy specimen `fixtures/Compatibility/LegacyV1/Examples/m4_draft_box_basic.firmament`
in Aetheris. Modern `BindMechanicalModel` admits Hole, EdgeFinish and Perforation
in primitive Modify scopes. Exposing angular Draft truthfully requires a typed V2
admission/lowering adapter with capability and provenance qualification; relabeling
it as an editor gesture would hide that missing compiler work. Editing drafts and
failed-build recovery are qualified separately from angular draft geometry.

This pass does not qualify every existing advanced graph or sketch operation, or
all possible host/feature combinations. Unsupported combinations remain compiler
errors. The explicit no-code workflows below are the presentation gate.

## Final evidence and verdict

- TypeScript build and production Vite bundle: passed.
- Helios unit suite: 154 passed across 35 files.
- Graph-only browser suite: all seven workflows passed with the production AOT
  worker (54.3 s), then all seven passed against the extracted standalone EXE
  bundle (34.0 s). Through-hole/chamfer, counterbore/fillet, countersink/chamfer,
  preview refusal and applied-draft recovery, blind-depth/delete/undo/redo,
  through ↔ blind switching, and a finite pocket were all exercised.
- Aetheris Release solution build: passed. Core fast lane: 1,110 passed. Full
  solution lane: 6,039 passed, zero failures; two existing external Drawing Notes
  renderer tests were skipped. The full lane was rerun after the alias repair.
- Compiler schema/palette tests: 29 passed. Graph/correspondence tests: 27 passed.
- Extracted Windows package qualification: passed startup/authentication,
  single-instance behavior, real STEP/GLB/PDF exports, checkpoint persistence and
  restore, MCP bridge cleanup, shutdown, and the seven graph workflows.
- Final code-quality review: compiler schema is the sole field/preset authority;
  AST edit batches are shared by graph/source; no parser route, diagnostic
  allowlist, geometric workaround, or parallel frontend validator was added.
  Topology aliases are explicit producer evidence, not an index's arbitrary
  first/last-writer recovery. Unknown primary conflicts remain errors.
- The production SDK publish now disables node reuse and shared compilation,
  matching its existing serial build lane. Qualification hosts exit cleanly.

Local Windows candidate (not published, records dirty source trees in its manifest):
`artifacts/local/standalone/0.1.0-preview.1-win-x64-1792972973159/Helios-0.1.0-preview.1-win-x64.zip`

SHA256: `4a34f57d0ad0dc8c33dcbb7c9f4f9ac56c7f60d541e23e92dd04626bd1255e48`

Package evidence:
`artifacts/local/standalone/Extracted smoke 1792973068894/QUALIFICATION.json`.
No .NET test hosts remained after the final run; the isolated packaged host was
stopped by its qualification script. The task's Vite process is cleaned up too.

**Verdict: Meaningful progression.** The motivating block → hole → edge-finish
workflow, finite pocket, field transactions, export and draft recovery work through
the real graph and packaged runtime. Angular Draft remains the specifically
isolated V2 compiler admission/lowering gap described above. This is not a claim
that every advanced editor or kernel capability has been qualified.

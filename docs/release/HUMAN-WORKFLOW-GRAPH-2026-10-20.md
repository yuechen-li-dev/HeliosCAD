# Graph-first beginner workflow audit — 2026-10-20

## Verdict

**Success for this bounded usability pass.** Basic dimension editing, feature
editing, failure recovery and export work through the real application. Six small
usability defects were repaired and exercised. The graph is **not yet a complete
code-free CAD authoring interface**: base-shape choice, pattern/pocket creation and
assembly placement remain significant gaps. They are recorded below, not counted
as completed workflows.

This is an agent-simulated beginner journey, **not a human user study**. The agent
followed visible UI instructions, avoided source edits and AI Author, and noted
where prior programming knowledge was needed. Source inspection followed the
observations to identify repair ownership. A real browser ran the SDK/WASM worker
and WebGPU viewport at 1280 × 720. No provider or cloud service was used.

Starting revisions: Aetheris `97a2eaa5`, HeliosCAD `c9433e5`. Both working trees were
clean. The application ran from the local Vite host. Development refresh behavior
is separated from ordinary application behavior below.

## Observed journeys

| Beginner intention | Observation | Outcome after this pass |
| --- | --- | --- |
| Start a part | Home → New part opens Graph with a 40 × 30 × 8 mm box. | Works; it does not ask which base shape the user wants. |
| Resize a plate | Select Size, edit X/Y/Z. Changed the mounting plate to 80 × 50 × 6 mm; each edit builds. | Works without Firmament syntax. |
| Add a second hole | + Add → search `hole` → plain hole. Its center defaults to the existing hole's center and compilation refuses the overlap. | Honest refusal; placement workflow still needs improvement. |
| Move that hole | Initially Center was a raw `Point2(0mm, 0mm)` field. The simulation needed constructor syntax to repair it. | **Fixed:** simple point fields have X/Y or X/Y/Z inputs. Moved the second hole to X=25 mm with Y=0. |
| Recover from overlap | The viewport keeps the last accepted body. Initially six planner Info messages preceded the real error; status still said Ready and the node withheld the explanation. | **Fixed:** errors first, Build failed, actual explanation in the draft panel, and one problem plus six Info messages rather than seven problems. Revert restored X=25. |
| Add an edge treatment | + Add → `chamfer` → Chamfer top edges, default 1 mm. Built with both holes. | Works. Face, Target and Kind still expose source vocabulary. |
| Delete a feature | Delete → explicit inline confirmation → Delete. Both hole deletion and chamfer deletion rebuilt successfully. | Works. |
| Undo a graph deletion | Ctrl+Z with the graph focused did not restore the deleted feature; no graph Undo/Redo action was found. | Gap. Monaco's edit history is not a discoverable shared graph history. |
| Make a shared dimension | ⇡ beside CenterMount Diameter → Make parameter; Parameters lists the dimension and its consumer. Changed 8 to 10 mm. | Works without writing Static syntax. |
| Keep a known state | Version Control → Save checkpoint; changed hole X from 25 to 28; restored the checkpoint created by this run. | Works: X=25 returned and the accepted model rebuilt. A Before restore checkpoint was retained. |
| Start a sketch | Sketch on the box said to use Command palette → New sketch part. At this width that toolbar command was hidden; the empty state had no start action. | **Fixed:** direct New sketch part action delegates to the existing compiler-backed document action, with an unsaved-edit decision in the host. |
| Dimension a sketch and locate an opening | New sketch part → Width 100 mm → Circular profile opening, bottom-left, insets 8/8 mm, diameter 4 mm → Done. | Works. The emitted opening follows shared rectangle dimensions; no absolute coordinate entry was needed. |
| Choose Cylinder as the base | The seeded Box makes both Box and Cylinder palette entries unavailable. The explanation suggests Assembly/Compose but provides no action for either. | Gap: no direct replace-base or base-shape chooser. |
| Create a Pattern, Pocket or extrusion from + Add | Searches for `pattern`, `pocket`, `extrude` returned Nothing matches. Sketch offers the existing profile/extrusion path separately. | Gap in graph creation coverage, not evidence that the compiler lacks these features. |
| Join assembly parts | Home → New assembly says to drag between frames, but both cards say No named frames. Placement exposes a 16-number matrix; the Part value is raw `WebBlock<H: 8mm>`. | Blocked for a beginner. No successful mate workflow is claimed. |
| Save and export | Save source and Export → STEP AP242 → Download selected format both produced local files. | Works; the browser STEP was independently inspected by the CLI. |

## Repairs and authority boundaries

1. **Point coordinates:** reuse the existing quantity/vector input controls for
   compiler-outline `call` fields containing simple Point2/Point3 constructors.
   Keep the constructor, authored units and parameter references. Complex
   expressions stay textual. Point-component parameter promotion is not offered
   because the existing promotion contract supports list components, not point
   arguments. No expression evaluator or new geometry semantics were introduced.
2. **Diagnostic order:** stable severity ordering in Problems preserves messages,
   codes and source-navigation objects. Planner information remains accessible.
3. **Diagnostic status:** errors/warnings count as problems; Info has its own count.
   Failed admission no longer reads Ready. An error against current accepted
   geometry reads Needs attention rather than falsely claiming a new build failed.
4. **Draft explanation:** when no selected-node error exists, show the document
   build error with “not located on this declaration.” Do not manufacture a source
   location. Scoped diagnostics retain priority.
5. **Sketch entry:** shared SketchWorkspace accepts an optional host-owned
   createPart action. Helios delegates to its existing New sketch part command and
   SDK sketchEdit path. Existing hosts without this callback keep their old API.
6. **Toolbar layout:** showcase.css overrode the existing wrap rules with nowrap.
   Repair that override and nested groups. At the tested 384 px viewport-pane
   width the controls occupy two rows, 64 px high; their measured rectangles no
   longer overlap. No alternate toolbar implementation was added.

No parser, kernel, geometric lowerer or source-edit transaction was replaced.
Public onboarding was updated in [Helios showcase](../public/helios-showcase.md).

## Remaining gaps and proposals

| Priority | Gap and evidence | Proposed owning change |
| --- | --- | --- |
| P1 | Second hole immediately overlaps the first; raw On/End/Target selectors still require vocabulary knowledge. | Add a pending placement step: select support, preview position, enter offsets or choose semantic references, then commit. Use compiler selectors and sketch/Concept projections. Do not silently choose an arbitrary “safe” center. |
| P1 | Assembly starter promises frame dragging with no frames; Placement is a matrix and selection of a Part can leave the right Inspector showing the assembly root. | Give the starter meaningful Concept/Interface frames and one guided mate action. Add compiler-backed translation/orientation controls for absolute placement, and reconcile graph/compiled occurrence selection. Preserve matrices as an advanced view. |
| P1 | New part assumes Box; alternative base primitives are unavailable once it exists. | Offer base-shape choice and a transactional Replace base action. Explain dependent features before replacement; let the compiler admit the result. |
| P1 | Pattern/Pocket creation absent from palette; no clear transition from a selected profile to its next feature. | Extend existing schema-backed palette/edit operations and offer contextual Profile → Extrude/Pocket and feature → Pattern actions. Do not add UI-only feature semantics. |
| P1 | Ctrl+Z does not undo a graph deletion. | Expose shared source-transaction Undo/Redo across graph and source. Reuse the existing document edit authority; checkpoints remain durable milestones rather than a second undo engine. |
| P2 | Hole-overlap error points to 1:1; combined Hole/EdgeFinish overlap points to the EdgeFinish rather than the hole center. | Preserve originating feature spans through compiler planning. The UI now discloses global scope but cannot recover missing provenance. |
| P2 | Main graph Selection and right compiled Inspector can duplicate/conflict; a sketch with one opening produces eight nodes and eleven edges. | Make editing versus compiled inspection explicit. Default shared parameters to a compact group or focused dependency view; retain full graph access. |
| P2 | Disabled bodies occupy much of the small Add palette; names differ between workspace title, Model and exported file. | Put available actions first, explain disabled actions next to a navigable alternative, and distinguish document/model/occurrence names in labels. |
| Developer | React Fast Refresh after application edits produced HELIOS-WORKER “This workspace has closed.” Restart worker did not recover; full page reload did. | Qualify runtime ownership across effect cleanup/refresh. HeliosApp retains a runtime in state while its mount effect disposes it; investigate recreating the owner on refresh without leaking workers. This was observed during development, not during the ordinary fresh-load workflows. |

Small point editing and actionable diagnostics help immediately. The next coherent
usability slice should combine **support/placement picking and semantic assembly
frames**. These are the places where the current UI most directly asks a human
to supply compiler vocabulary or matrices.

## Qualification and retained evidence

Generated evidence is under Aetheris `artifacts/local/graph-usability/` (ignored),
not mixed into public samples. Browser-downloaded source specimens were copied
there; no existing user download was moved or deleted.

- `moved-hole.firmament`: actual saved graph source, 80 × 50 × 6 stock, Ø8 and Ø6
  through holes at X=0 and X=25, Y=0, top-boundary 1 mm chamfer.
- `browser-export.step` and `cli-export.step`: **identical STEP DATA sections**
  after line-ending normalization; headers were excluded. CLI analyze summaries
  also match: one body/shell, 12 faces, 26 edges, 16 vertices, 10 planes and two
  cylinders, enclosed-manifold, bounds (-40,-25,0) to (40,25,6) mm.
- `geometry-parity.json`, `browser-analysis.json`, `cli-analysis.json` retain the
  comparison and topology evidence. This proves browser/CLI parity for this part,
  not a universal proof about all possible models.
- `two-hole-chamfer.firmament` retains the earlier X=20 specimen; CLI validate
  reported validationLevel Built and CLI build accepted it.
- `sketch-opening.firmament`: actual saved sketch, width 100, height 50, extrusion
  6 mm, Ø4 through opening offset inward 8 mm from bottom-left. CLI measure reports
  authoritative volume 29924.601776313844 mm³, matching 100×50×6 − π×2²×6,
  and bounds (-50,-25,0) to (50,25,6). Measurement is not an assertion pass.
- Screenshots: `before-toolbar.png`, `assembly-matrix-friction.png`,
  `after-invalid-placement.png`, `after-error-first.png`, `after-sketch-start.png`,
  `after-numeric-placement.png`. The final fresh-load retest also repaired an
  immediately overlapping second hole to X=15 mm using only its numeric input.

Regression commands and final results are recorded with the generated logs. The
full qualification includes Helios tests/type build, shared Telos tests, the .NET
solution build, fast kernel lane and full solution test lane. Expected existing
CSS-parser notices in jsdom, large JS chunk warnings and WebAssembly SQLite
interop build warnings are disclosed; they are not suppressed.

| Qualification | Result |
| --- | --- |
| `npm test` in HeliosCAD | 131 passed, 31 test files |
| `npm run build:fast` in HeliosCAD | TypeScript and Vite build passed |
| `npm test` in Aetheris.Web.Runtime/telos | 18 passed, including TypeScript build |
| `dotnet build Aetheris.slnx -c Release -m:1 -nr:false -p:UseSharedCompilation=false` | Passed, zero errors, 34 existing WebAssembly interop warnings |
| Fast kernel lane, Category!=SlowCorpus | 1,087 passed |
| Full solution lane, serial | 5,739 passed across 20 test assemblies, zero failed/skipped; includes full Core corpus, Firmament and editable V8 |
| Real browser/CLI geometry comparison | STEP DATA and topology summaries equal |

The code-quality pass checked all callers of the extended field-editor projection,
preserved point spelling in the shared vector writer, and kept parameter-promotion
eligibility explicit. Existing source-span guards and build/revert authority are
unchanged. No diagnostic-code allowlist, extra compiler route or geometry rewrite
was added. Both repositories pass `git diff --check`.

The run did not qualify cloud persistence, real human discoverability, live AI
providers, arbitrary imported geometry or every engineering operation. Those
claims would require separate journeys. Test-created browser workers and the
temporary Vite host are cleaned up at the end; unrelated processes are preserved.

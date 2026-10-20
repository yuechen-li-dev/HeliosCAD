# Graph authoring follow-up — 2026-10-20

**Outcome: Success for the five bounded workflows approved after the human simulation.**
The graph can now prepare ordinary authoring operations, show their built result
before committing source, and undo the complete transaction. This is a usability
pass on the existing compiler and SDK, not an alternative modeling engine.

## Delivered workflows

| Workflow | Current behavior | Real qualification |
| --- | --- | --- |
| Choose/replace base | New part opens Box/Cylinder choice. Replacement keeps body name and downstream references. Shape changes disclose catalog defaults. | Cylinder preview left saved Box source unchanged; Apply, Undo, Redo produced the intended bodies. |
| Place a feature | Pending host, support, center and dimension controls; Preview compiles complete candidate; Apply commits once. | Overlapping Hole refused with `firmament-v2-semantic-hole-overlap` while accepted source/geometry stayed intact. Corrected center admitted. Actual viewport top-face pick supplied `face(+Z)` and built. |
| Pocket / Extrude / Pattern | Contextual and searchable actions use compiler structural edits. | Plain Box converted to equivalent Compose stock plus finite circular recess; unfinished Profile extruded to 12mm; seed grid produced six keyed holes plus the separate hole. |
| Assembly relations | Starter publishes Top/Bottom frames. Guided mate creation and endpoint editing retain named relationships. | Fixed.Top to Moving.Bottom placed Moving at Z=10mm. Endpoint retarget to Moving.Top placed it at Z=2mm. Existing mate contract/name retained. |
| Absolute placement | Literal parent-relative XYZ and single-axis angle controls, with explicit source-driven and mate-driven refusal. | Browser committed [25,5,0]mm and X=90deg. Mate-driven placement disabled Preview and navigated to the driving mate. |
| Shared history | Toolbar and keyboard use Monaco's existing source history. | One Undo removed the Pattern plus supporting Feature and Set, restoring two holes; Redo restored seven. No separate graph history store. |

## Ownership and safety

- Compiler-owned `language.edit` operations use structural AST spans and the
  existing writer. No new whole-document parser or geometry lowerer.
- Preview owns a separate ModelSession handle on the existing worker. It never
  replaces the live model; cancellation, changed controls and late completion
  release it. Apply checks source revision and commits the exact prepared splice.
- Source and compiler geometry remain authoritative. Complex frame expressions
  and matrices are not turned into guessed fixed coordinates.
- Mate retargeting uses endpoint field edits; it does not replace the authored
  Interface contract, limits or options. New mates use modern typed Interface +
  named Mate declarations and remove competing moving Placement atomically.
- Hole support mapping was missing after hole construction. The materializer now
  publishes retained top/bottom caps from its existing construction ownership;
  the multi-hole builder reports the actual FaceIds at construction. Display
  normals and mesh face ordering do not select a source support.
- Late runtime initialization cannot revive disposed workspaces. A stale
  Inspector query after developer refresh rejects asynchronously through the
  existing handler rather than throwing from a React effect and blanking the app.

## Geometry evidence

Actual browser downloads were copied, not moved, into ignored
`Aetheris/artifacts/local/graph-authoring/` and inspected with Aetheris.CLI.

- Seven-hole plate: 80 x 60 x 8mm stock, six diameter-4mm holes and one
  diameter-6mm hole. Exact compiler volume 37570.619539452295mm^3;
  13 faces, 33 edges, 36 vertices, one shell. Stock bounds
  [-40,-30,0] to [40,30,8]mm.
- Browser and CLI STEP `DATA` sections are byte-identical. SHA-256:
  `2f1d9d73ed11d7cebb82ecb13e2f2be7b03eed379427a04eaf3c3d7c6edc8bc9`.
- 80 x 60 x 12mm profile extrusion: exact vertical-prism volume 57600mm^3.
- Starter, absolute placement, initial mate and retargeted mate all retain the
  same two leaf STEP hashes:
  `DF29CE7675765D179E7BECDE07C99F5AD4CCAA256B0FAA8990A12E6A9D99AD1A` and
  `D0B2A1B57E080C6A57C9D00B350A2B6D6C9D12F8EAC77E5E8C2FF26A1C333577`.
  Their occurrence matrices change as requested. Assembly inspection's stored
  metrics for circular parts are vertex envelopes; they are not used here to
  claim tight cylindrical bounds.
- Pocket source builds into STEP with 15 faces, 32 edges, 20 vertices and one
  shell. Its authoritative volume query returns **Unavailable**. No mesh estimate
  was substituted as volume proof.
- Source-selector spelling `+Z` versus `face(+Z)` produces identical STEP DATA
  for the qualified single- and multi-hole test specimens.

## Qualification

Final gates after the final SDK package refresh:

| Gate | Result |
| --- | --- |
| Full .NET solution build | Passed, zero errors; 17 existing warnings |
| Kernel fast lane | 1087 passed |
| Full .NET solution suite | 5754 passed, zero failed/skipped, 20 projects with discovered tests |
| Firmament suite, included above | 3015 passed |
| Helios tests | 140 passed, 33 files |
| Helios typecheck + development Vite build | Passed |
| Shared Telos tests | 18 passed |
| SDK transport/language/selection/measurement tests | 18 passed |
| Actual browser/CLI artifact checks | Passed via local `qualify.py` |
| Git whitespace/diff checks | Passed in both repositories |

The solution also visits Aetheris.FrictionLab.Tests, which currently reports no
discovered tests; it is not counted as a passing test project. The production AOT
lane was not run. Browser tabs and the task-owned Vite host were closed after
qualification; .NET lanes used disabled node reuse/shared compilation.
Logs, STEP files, source downloads, inspection JSON and screenshots remain local
under `Aetheris/artifacts/local/graph-authoring/`.

Reproduction lanes:

```powershell
# Aetheris; serial .NET lanes
dotnet build Aetheris.slnx -c Release -m:1 -nr:false -p:UseSharedCompilation=false
dotnet test Aetheris.Kernel.Core.Tests -c Release --no-build --filter "Category!=SlowCorpus" -m:1 -nr:false -- RunConfiguration.MaxCpuCount=1
dotnet test Aetheris.slnx -c Release --no-build -m:1 -nr:false -- RunConfiguration.MaxCpuCount=1

# HeliosCAD; development SDK plus typecheck/Vite build
node scripts/install-local-sdk.mjs
npm test
npm run build:fast
```

The ordinary production build deliberately refuses a development/interpreted SDK;
this pass qualifies `build:fast`, not a production AOT publish. Shared Telos and
SDK transport suites run separately. The new `GraphAuthoring/profile.firmament`
is deliberately unfinished editor input, classified in its fixture README;
its edited output, rather than its initial state, must build.

## Remaining bounded limits / next usability findings

1. Pattern action is a rectangular grid of field-based Hole declarations with
   authored Point2(x,y) centers. Other feature/center families retain source
   authoring. Counts include the seed; copies have row/column identities.
2. Pocket conversion accepts qualified plain Box/Extrude stock or existing
   Compose. Extra base requirements are refused rather than discarded. It does
   not expand the kernel's Pocket/Boolean capabilities.
3. Support picking requires published compiler correspondence. Unmapped faces
   stay disabled, including unsupported construction families. A screen hit is
   not a source reference or a promise of geometric admission.
4. Placement controls cover literal Origin-to-Parent translation and one-axis
   rotation (including legacy translation-only matrices). General matrices,
   named-frame placement and expressions remain source-driven.
5. Matching frames checks the existing assembly compiler; it does not add
   collision/clearance checking. The top-to-top retarget witness intentionally
   checks endpoint authority and transforms, not physical assembly feasibility.
6. Full page reloads of browser-local work still require saved source/checkpoints.
   Developer SDK replacement caused a full reload during dogfooding; this report
   does not claim reload persistence from the runtime lifecycle repair.
7. The deliberately unfinished Profile shows a stable `missing-solid` code, but
   its current document-anchor explanation is weak. A future compiler-owner
   diagnostic improvement should say directly that the Profile needs a body
   operation. This did not prevent graph selection and extrusion recovery.
8. Narrow graph panes still require Fit/pan for assembly cards and scrolling for
   long forms. Pending forms use the whole graph pane, keep the viewport usable,
   and keep Preview/Apply at the bottom; larger assemblies need another layout
   ergonomics pass.

The current public walkthrough and SDK contract were updated in place. No AI
provider, alternate persistence store, new constraint solver or hidden geometry
rewrite is needed for these workflows.

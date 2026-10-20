# Human workflow audit: import STEP, annotate, export

> Historical audit. The subsequent implementation and qualification are recorded
> in the companion Aetheris repository's
> `docs/release/IMPORTED-PART-PMI-2026-10-20.md`. The observations below describe
> the pre-implementation app and are retained as regression evidence.

## Verdict

**The requested human workflow is blocked end to end.** Helios cannot currently
import STEP in its browser workspace. Native Firmament PMI has a narrow working
UI path and geometry-preserving AP242 export; GLB drops that PMI. A separate
imported-part CLI control also exports numeric PMI without geometric face
associations. Correct numbers alone do not close the semantic-export gate.

This pass changes documentation only; it does not implement these capabilities.

## Method and scope

Exercised visible Helios controls, the ordinary native file picker, viewport
picking, graph editing and real downloads. Initial exploration preceded source
inspection. Served current Helios source with its installed `@aetheris/cad`
2.0.0-preview.3 dependency; the SDK was not repackaged for this audit. Native
inspection used the existing Release Aetheris CLI. Targeted source inspection
corroborates the ownership gaps. This is an agent-simulated human journey, not
a study with human participants.

Primary input, in Aetheris:
`fixtures/Compatibility/Firmasm/LegacyAssembly/examples/occt-l-bracket/_part_003_l_bracket.step`.
The CLI reads one enclosed-manifold body, 16 faces, 42 edges and 28 vertices, with
bounds [0,0,0] to [50,60,100] mm. The UI failure does not indicate invalid STEP.

The extension's file-upload API required extra file-URL permission. The ordinary
OS picker worked without changing permissions. A download-event automation wait
also timed out although the file downloaded. These are harness limitations,
excluded from product defect counts.

## Actual UI journey

| Attempt | Observed behavior |
| --- | --- |
| Find Import STEP | No dedicated toolbar, Files or palette action. Open file filters Firmament/firmasm/text. |
| Explicitly enter a STEP pathname | File becomes a source root and fails with `HELIOS-WORKER`: “The project root must be a Firmament document. Arg_ParamName_Name, rootDocument.” Header still says Firmament. |
| Understand failure | Last-good mounting plate remains visible with an out-of-date warning. Export is blocked, which is a useful safeguard. Primary error is generic/internal. |
| Recover using Examples | Gallery is disabled: “A project operation is running.” Restart worker repeats the invalid-root failure; reload restores the default part. |
| Annotate a native control | Pick the mounting plate hole wall. Inspector supplies `face(CenterMount.Wall)` and “Reference hole wall in source.” This creates a Pmi/HoleDiameter graph node. |
| Add tolerance | Select the PMI node, choose `+ Field…`, type `Tolerance` and `PlusMinus(0.1mm, 0.1mm)`. Rebuild succeeds. This required public PMI documentation, rather than a dedicated engineering editor. |
| Inspect in 3D | No dimension/tolerance label, leader or datum display appears. The PMI card exists; the viewport still shows the plain part. |
| Export | STEP plus GLB downloads in a real ZIP. STEP retains the native size requirement; GLB contains no PMI values or annotation geometry. |
| Save | Save source downloads the native control. Imported-asset save/reopen could not be exercised because import is blocked. |

The graph calls Box, Modify and Pmi “3 parts” although there is one physical body.
The PMI card is disconnected from its target. Left graph inspection can show PMI
while the right inspector still shows the Hole. The plate's selected planar face
returned `RuntimeOnly`, with no source selector; its cylindrical Hole wall had a
stable selector. Datum creation is therefore not universally available even on
this small native control.

## Independent export evidence

### Native part, authored through UI

The built-in 50 x 40 x 8 mm plate has an 8 mm through hole. The graph action and
generic field input produced:

```firmament
Pmi {
    HoleDiameter SelectedWall1 {
        Target: face(CenterMount.Wall)
        Value: 8mm
        Tolerance: PlusMinus(0.1mm, 0.1mm)
    }
}
```

CLI readback recovers nominal 8 mm, both allowances 0.1 mm, authored name
`SelectedWall1` and geometric face entity #139. STEP contains a
`GEOMETRIC_ITEM_SPECIFIC_USAGE` for the target. The tolerance was an explicitly
entered projection-test requirement, not a conclusion about process capability.

All **154 pre-existing STEP entities remain identical at the entity-record
level** before/after PMI. Analyzer summaries, face/edge/vertex records and bounds
are identical: one body, 7 faces, 15 edges, 12 vertices. This native annotation
operation did not mutate engineering geometry.

The downloaded GLB has one mesh and two nodes: the part and unit/axis conversion
root. Asset/mesh/node extras contain identity/provenance only. There are no PMI
records, tolerances, annotation meshes or annotation extensions. Geometry export
succeeded, but annotated glTF delivery did not.

### Imported canonical part, separate CLI control

Adapted the existing InlineStep record/recognition/PMI witness to
`testdata/firmament/inline-step/canonical-through-hole.step`. Its cylinder radius
is 1 mm; the control uses the correct **2 mm nominal**, explicit +/-0.1 mm
allowances and datum A. Used relative resource paths as the frontend requires.
This is a backend probe, not a completed Helios workflow.

Baseline and PMI-bearing builds both succeed. All **154 pre-existing STEP entities
remain identical**, as do independent analyzer geometry/topology records. Readback
finds datum A, diameter 2 mm and both 0.1 mm allowances.

However, **both PMI records have empty `geometricFaceEntityIds`**, and the exported
file has no `GEOMETRIC_ITEM_SPECIFIC_USAGE`. Imported target references survive
as description strings; they are not exported geometric associations. This case
remains unqualified for topology-associated semantic PMI.

## Confirmed gaps and owners

| Priority | Gap | Existing owner / repair direction |
| --- | --- | --- |
| P0 | Imported PMI lacks exported face associations | `FirmamentBuildAndExport.BuildV2SemanticPmi` resolves imported targets to strings, then derives `GeometricFaceIds` from native correspondence or axis-plane resolution. Carry the existing imported topology-map result into exporter face identities. Verify association after reimport. |
| P1 | Browser imported-part admission/resource seam missing | Runtime explicitly reports `externalStepImport: false`. Part compilation receives source; inline STEP currently reads files from disk. Expose supported bytes/resources through the existing SDK/compiler owner, with import qualification and provenance. A file-input extension change alone is insufficient. |
| P1 | No human Import -> Annotate path | Present an Imported Part node, immutable source asset and read-only geometry. Create PMI from supported picked targets through compiler-authoritative transactions. |
| P1 | GLB drops required annotation data/presentation | `AssemblyGlbExporter` exports body meshes and identity extras without PMI projection. Add separate text/leader/symbol nodes and structured records with target references; reuse shared PMI presentation ownership. |
| P1 | Imported asset persistence unqualified | Browser project documents/checkpoints currently carry source text. Define asset bytes/hash/reference lifetime and portable local save/reopen before claiming saved imported workspaces. This was inspected, not exercised. |
| P2 | Unsupported input traps recovery | Classify files before changing roots, preserve the previous project, explain support, and allow opening another project after failure. |
| P2 | PMI intent is difficult to discover/edit | Add purpose-facing Add diameter / Add datum actions and nominal, upper/lower allowance and unit fields. Preserve an explicit unset state; retain raw expressions as an advanced option. |
| P2 | Annotation navigation/picking inconsistent | Link PMI cards to targets, synchronize inspection, distinguish annotations/operations from physical parts, and explain unavailable selectors. |

## Proposed next bounded slice

Implement **Imported Part + PMI**, starting with the AP242 association repair as
its first gate. Reuse the existing importer, semantic model and exporter. Retain
input bytes and fingerprint. Annotation edits must not implicitly invoke healing,
recognition-driven replacement or native reconstruction.

The human journey should be:

1. **Import STEP**: inspect qualification, units and imported bodies.
2. Pick a supported face/feature: **Add datum** or **Add dimension**.
3. Enter requirement and explicit tolerances: see a linked node and readable
   callout. Distinguish measured geometry from the authored requirement.
4. Save/reopen the workspace with its imported asset and annotations.
5. Export **STEP AP242** or **GLB with annotations**, with explicit limits for
   unsupported target and requirement types.

Imported geometry stays immutable; a source-backed annotation layer references
stable topology, and UI/exporters project compiler-authoritative requirements.
An LLM must not be required for this basic workflow.

Acceptance compares geometry before/after annotation and save/reopen; verifies
AP242 nominal, allowances **and geometric association**; and opens GLB in an
independent viewer to verify readable, correctly scaled labels and structured
values. Preserve body vertex/index buffers while adding distinct annotation
geometry. Arbitrary vendor inputs, assemblies and unsupported GD&T remain scoped
until qualified. Export success must not imply omitted requirements survived.

## Artifacts and documentation

Local evidence is in the companion Aetheris checkout's ignored
`artifacts/local/helios-pmi-dogfood/`: screenshots, UI-authored source, actual STEP
and GLB downloads, GLB JSON, CLI controls and `qualification-summary.json`.
Screenshots: `01-step-open-fails.png`, `02-native-pmi-node.png`. Original STEP files
were not edited.

Updated public export/showcase text and Aetheris's STEP-import guide to distinguish
browser support, native import and absent GLB PMI. No product code changed and no
build/test regression suite was run for these Markdown edits. Evidence comes
from the real UI, downloads, CLI analysis, entity comparisons and source inspection.

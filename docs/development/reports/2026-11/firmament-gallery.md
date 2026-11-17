# Firmament gallery authoring notes

The gallery teaches compact construction in Basic and relationships between
features or components in Advanced. Mirrored examples retain their Aetheris
project structure. Local adaptations share placement dimensions, preserve names
used by PMI, and use final-body assertions where measurement is admitted.

## Design intent

Simple bracket now traces the two leg envelopes through their shared heel.
The original polygon also lived in Concept, but its independent vertex
coordinates repeated the constraints. With the traced profile, changing wall
thickness updates both legs and their intersection together. Named spans keep
downstream selections readable. Use `Round(r)` when an arc belongs to the
section itself and a 3D finish when the operation belongs to a material edge.

The checked plate uses `Assert.Near` for the design envelope and analytically
calculated stock-minus-bore volume. The rounded tray checks exterior-minus-cavity
volume derived from both rounded rectangles. Machined block and Bearing mount check
that their additions and removals leave one shell. Keep an expected value tied
to a design requirement or independent calculation. Copying a new measured
value over an assertion after a failure can bless the error. Assertion
tolerances are verification bounds. PMI carries the manufacturing tolerance.
Use a positive length tolerance for bounds and a positive cubic length tolerance
for volume. If a bounded volume estimate is the measurement authority, its
entire interval must fit the tolerance. A viewport mesh does not supply the
assertion value.

## Reproduced friction and proposed syntax

| Case | Evidence from Aetheris CLI | Proposal and acceptance |
| --- | --- | --- |
| Add a counterbore to the parametric traced bracket | With a hole, Extrude enters the Compose adapter. That adapter lost the bound guide dimensions and reported `firmament-pipeline-unknown-guide:foot.Bottom`. | Fixed by sharing the existing compiler value environment with the profile and span binders. The nominal and resized parts must build with the same named bore and finish, and export enclosed STEP with the independently calculated volume. |
| Reference the named side from a feature | `face(bracket.Side("profile:section.Outer.FootSeat"))` builds. `face(bracket.Side(section.Outer.FootSeat))` reports `compose-hole-support-invalid`. | Admit the second form as a typed profile-edge reference. Resolve it to the same side identity as the current quoted selector, keep old files readable, and report the source segment when the edge is missing or ambiguous. |
| Put four counterbores and their shared PMI on keyed sites | Replacing mountA–D with `Pattern mounts over mountSites` builds without the two group PMI records. `target: [mounts.A, mounts.B, mounts.C, mounts.D]` rejects with `firmament-v2-pmi-name-list-invalid` and invalid hole targets. | Admit qualified references in hole lists, then resolve and deduplicate them by feature identity. Keep the four-site callout and position control through STEP and retain keys across site reorder. The gallery shares the pitch and recess dimensions across named holes so their existing PMI survives. |
| Express a volume check as an independent calculation | Checked plate rejects `expected: (9600mm^3 - 402.12386mm^3)` with `firmament-v2-assert-volume-expected-dimension-mismatch`. | `Assert.Near Volume` and `Assert.Near Bounds` now require a positive tolerance. A follow-up can let the volume fields take dimension-checked constant expressions while preserving the final-body check. Reject wrong units and a bore change that violates the independent requirement. |
| Check stock before and after a GUI feature edit | On the bare extrusion, `Assert Topology bracket { shells: 1 }` reports `firmament-v2-assert-target-unknown:bracket`. The plain profile route names its body for the profile, while the Compose route uses the extrude name. | Bind assertions to the authored material-body identity across both routes. Test unchanged source assertions before and after a hole, with explicit rejection of unknown names. The starter uses `Require proportions`; its body is checked by the browser's STEP round trip. |

The proposed syntax in this table is experimental. Reproduce each probe using
`aetheris validate <file> --json` on the named gallery source with the stated
change. Run `aetheris measure <file> --json` separately for authoritative
measurements. Machined block and Bearing mount currently report unsupported
final-body volume families and expose topology counts, so their assertions use
the admitted topology check.

The sheet-metal sensor bracket passed native validation but reported Build
failed in the production Worker. Basic uses the turned shaft to teach an
additional construction with a browser-qualified path.

# Label: native parts, every control, editing

## Change

- **Native parts.** Label accepts any face with a stable selector (`AuthoredStable`, `DerivedStable` as well as
  `ImportedStable`), writing the Inspector's selector. Native holes are named by construction (`face(mount.Wall)` is
  hole `mount`); Recognize and datum axes on hole walls are offered only on imported parts, where the compiler
  admits them. Needs Aetheris native-face PMI targets (same day).
- **Every control.** Added Angularity (plane, axis, two planes), Straightness (plane line elements, axis),
  Roundness, axis Parallelism, Surface and Line profile (optional datums), Circular and Total runout (about a datum
  axis square to a face, or a coaxial datum diameter). The relation the geometry has is offered first.
- **Zone and modifiers.** Axis controls choose Ø or between planes; features of size choose RFS, Ⓜ or Ⓛ; any control
  takes Free state and Statistical, and several holes a Common zone.
- **Unavailable records** are listed under a closed "Not available for this selection" disclosure with their
  reasons, so the list stays short.
- **Editing.** Each record in the list has Edit: rename, change written fields (value, tolerance, datum refs, zone,
  modifiers, text), Delete (with confirmation; refused for a datum other records reference).

## Evidence

- vitest 281 pass (label: native faces, native hole, zones/modifiers/optional datums, CommonZone check).
- e2e `label-native.spec.ts` (2): on the showcase bracket, select two faces, delete a scratch record, apply a
  27 mm Distance, apply Parallelism with a new datum and Free state (previewed clean), edit its tolerance, datum
  in use cannot be deleted; on a box plate, Position on hole `mount` with Ø zone and Ⓛ. `label.spec.ts` (3) and
  `pmi-styles.spec.ts` still pass.

## Verdict

Success for faces the compiler names. Projected sizes (`Dimension`, `Location`, `HoleCallout`), edges and angles
remain Source-only.

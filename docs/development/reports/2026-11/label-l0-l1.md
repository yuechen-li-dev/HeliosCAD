# Label L0–L1: ordered selection, measurement in the selection, Label tab

Implements phases L0 and L1 of [the Label design](label-tab-design.md).

## Delivered

- **Ordered multi-select.** Ctrl/Shift-click adds or removes; Esc clears. `picks` in `HeliosApp` is the ordered list;
  its first entry is still `selectedSelection`, so single-select callers are unchanged. Both renderers highlight every
  pick (`extraSelections`). The WebGL renderer now calls the latest `onSelect` (it held the first render's closure,
  which made additive selection impossible) and highlights a selected face instead of the whole body, as Telos does.
- **Auto picking in Label.** An edge within a few pixels, else the face; Alt forces the face. Entering Label shows
  edges. The Faces/Edges switch remains for Graph and Source.
- **Measurement in the selection card.** The modal `MeasurementTool` is removed from both renderers. The card lists
  the picks as chips and measures by their kinds: plane–plane (`planes`), axis–axis (`axes`), a cylinder's diameter.
  Picks for the query are synthesized at each face's representative point along its normal (`label/geometry.ts`), so
  any face named by a selector — including a datum's face read from source — can be measured. Witness lines are drawn
  from the result.
- **Label tab.** Record list from the outline's `Pmi` children, grouped; clicking a record selects its target. The
  context card comes from a pure table (`label/actions.ts`), tested without a browser:
  one plane → Datum / Flatness / Parallelism / Perpendicularity; one cylinder → Diameter / Position / axis
  Perpendicularity / Cylindricity; two planes → Parallelism / Perpendicularity of the first to the second (declaring
  the second a datum in the same edit when needed); cylinder + plane → axis Perpendicularity / Position.
  Orientation is classified from display normals (exact for planes) with a 0.5° window; the wrong relation is shown
  disabled with the measured angle. A second record of the same kind on the same target is refused.
- **Values.** Nominal proposed on the coarsest grid where the measurement is already nominal (within 2 % of the
  grid); H7/H8 fill allowances from ISO 286 IT7/IT8. Shaft fits are not offered: `PlusMinus` requires nonnegative
  allowances, so g6/f7 cannot be written. Out-of-band nominal warns and needs a second click. The datum picker offers
  only declared datums, without repeats. The exact declaration text is shown before Preview/Apply.
- `PmiAuthor` is deleted; the Inspector points to Label.

## Verification

- `vitest`: 270 passing (18 new in `src/label`).
- Playwright, Chromium + WebGL fallback: `tests/label.spec.ts` (datum, hole + datum face → axis perpendicularity,
  datum picker contents, preview, Esc, out-of-band warning with H7) and the SolidWorks round trip rewritten for the
  Label tab (datum + diameter → AP242 → `aetheris analyze`, GLB, workspace reopen) pass.
- `tests/solidworks.spec.ts` › "an altered STEP asset is refused…" fails before and after this change: the compiler
  now reports the pin mismatch at two locations, and the test's locator is strict.

## Not done

- Hole-as-unit picking (split half-cylinders from SolidWorks export) — labeled face by face for now.
- Edges, sizes between faces, angles, datum axes and imported `Location` need the L2 language work.
- Imported `Note` is offered but the compiler rejects it (`firmament-v2-imported-pmi-target-kind`); fixed in L2.

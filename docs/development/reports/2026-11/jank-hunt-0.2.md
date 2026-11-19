# 0.2 jank hunt: imported STEP, holes, edge finishes, labels

Scope: what a reasonable user expects to work when they put holes on a part, finish its edges, and label it, starting
from a STEP file from another system as well as from an authored part. Driven through the real UI with Playwright,
against the development runtime and against the CI-built Linux standalone (AOT).

## Fixed

- **A STEP file from another system did not import.** Import STEP wrote `InlineStep part { path: … }`, which
  admits only Aetheris's own exports. Every other file failed with `firmament-inline-step-requires-aetheris-
  canonical-step` and a CLI instruction the browser user cannot follow, while the viewport kept showing the previous
  part. Helios now pins a foreign STEP by the SHA-256 of its LF text (`textSha256`), which is how Firmament admits a
  part it did not write. The file stays verbatim; an Aetheris export is still bound unpinned.
- **Hole and finish tools were offered on imported parts and dead-ended.** Add hole showed "Body: None available";
  the rim finish refused with `firmament-inline-step-revision-required`. On a model whose only bodies are imported
  STEP parts, the workflow hint and the Graph actions now say what such a part takes (labels) and that holes and
  edge finishes on it are not supported yet.
- **Labels ignored the STEP file's own PMI.** The record list said "No labels on this part yet" beside datums A, B
  and C drawn in the viewport, and the next datum was offered as A, which the compiler refused with a raw
  `firmament-v2-pmi-source-name-conflict`. Label now lists the file's requirements under "From the STEP file"
  (read-only; a click selects their faces), the next datum skips their names, and the conflict reads as a sentence.
- **Boxy's datums were "not located on part".** Its datum features carry their faces as their own shape (a shape
  definition of the aspect), which the PMI reader did not follow; fixed in Aetheris (`Step242ForeignPmiReader`).
- **The standalone pin predated the edge-finish runtime**, and the bundled learning content was stale against the
  new pin. Both fixed; the standalone qualification passes on main.

## Measured

| Part (AOT standalone) | Open and build |
|---|---|
| STEP Tools Boxy, 80 faces | 5.1 s |
| NIST CTC-01 | 8.6 s |
| NIST FTC-08 | 32 s |

The development runtime is interpreted and 6 to 10 times slower (Boxy 44 s); it is not what users run.

## Still open (not fixed here)

- **No new holes or edge finishes on an imported part.** `Modify` requires a Box host; imported editing admits only
  moving or removing an existing round through-hole inside a proved envelope. Drilling a new hole into an imported
  body is a kernel feature (a cut through an arbitrary exact BRep), not a UI fix. It is the largest gap against the
  "edit any STEP" pitch.
- **Multi-solid STEP files** (the Raspberry Pi 4 board, 89 solids) are assembly-like and refused by single-part
  import; Helios has no browser assembly import. The Pi file is also 52 MB, over the 32 MB local import limit.
- **FTC-08 takes 32 s** in the AOT runtime against 4.4 s natively.

## Evidence

- New e2e: `label-human.spec.ts` › "a STEP file from another system imports and labels beside the datums it carries"
  (import, pinned source, imported-part note, file datums listed and located, next datum D applied).
- Label e2e (7, with the new one) and Helios unit tests (288) pass; the hole and edge-finish e2e are rerun below.

Verdict: meaningful progression. Foreign STEP files import and label; the dead-end tools on them are replaced by an
honest note. New holes and finishes on imported parts are isolated as the next kernel feature.

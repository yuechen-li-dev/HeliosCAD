# Can a frontier LLM author real parts in Zoo's KCL?

**Evaluated 2026-09-24.** Claude (session model `claude-opus-5-5`) wrote KCL 2.0; Yuechen pasted each snippet into Zoo
Design Studio (`app.zoo.dev`) and returned screenshots. No browser automation, on purpose: the point was to see
how a capable general model fares without training on Zoo's codebase. Claude could use the error text and public
docs on `zoo.dev/docs`, which is what any agent would have. It had no access to Zoo's source.

## Verdict

KCL itself was learnable in two or three turns. Sketching, booleans and patterns all worked. The run stopped at the
first edge-finishing feature on a real part, and it stopped for reasons no model can reason its way past:

- **The recommended way to name an edge doesn't survive a boolean.** Once a union or subtract has run, there's no
  stable reference left to that edge.
- **The GUI's fallback is positional edge indices.** Those are unauthorable by a model and fragile under any
  upstream edit.
- **Filleting the top boundary of a single extrusion of lines and arcs failed at every radius tried (4, 3 and 1 mm).**
  This happened with the book's own tagging pattern and no booleans involved.
- **Every geometric failure produced the same sentence:** "The Zoo engine cannot handle this 3D subtraction yet."

"AI-native" turns out to be a property of the kernel and its reference system, not of having a text syntax.

## Turn log

| Turn | Part and step | Result |
|---|---|---|
| 1 | Plate with bolt hole, legacy sketch API (stale training data) | Rejected. **The deprecation error was excellent**: it named the replacement API, gave the doc URL and included an example. |
| 2 | Same part in KCL 2.0 | Built. The syntax came from Zoo-GUI-generated KCL visible in an earlier screenshot, because the linked doc page covers only `line`, `var` and constraints: no `circle`, `region`, `extrude` or `subtract`. |
| 2b | Slide the hole toward the edge: x = 0, 12, 18, 18.9, 19, 19.1, 22 | **6/7.** It built the 0.1 mm sliver and the hairline breakout. It failed only at exact tangency (x = 19), with "cannot handle this 3D subtraction yet", giving no cause, location or remedy. Rejecting tangency is defensible; the message is not. |
| 3 | Flanged bearing housing: union, `patternCircular3d`, subtract with a nested pattern array | Everything built first try. The fillet `getOppositeEdge(bossSketch.rim)` gave a type error (Segment, not TaggedEdge). **This error was also good.** |
| — | Doc search for how to get a TaggedEdge | The stdlib `fillet` page calls `tags` "legacy", and says the new `edges` API is "Experimental… Do not use in generated or user-facing KCL yet". The `fillet` and `getOppositeEdge` pages showed no examples. The answer (`region.tags.<segment>`) turned up only after walking the book's table of contents to the Fillets chapter. That took four fetches. |
| 4 | Fillet with `getOppositeEdge(bossRegion.tags.rim)` after union and subtract | **"No such object exists."** The tag minted before the booleans can't be resolved on the result. |
| — | Human control: point-and-click fillet on the same edge | The GUI wrote `edgeId(housing, index = 4)`, a positional edge reference. One attempt filleted edges other than the ones selected. The other failed with "cannot handle this 3D subtraction yet. Edge cut failed." |
| 5 | "Chimera" plate: 17 lines and tangent arcs, one extrusion, top boundary filleted with the book's exact pattern | The geometry built exactly. **The fillet failed at R = 4, R = 3 and R = 1**, each time with "cannot handle this 3D subtraction yet. Edge cut failed." There are no booleans in this file. |

## The same parts in Aetheris

| Part | Aetheris |
|---|---|
| Edge-hole sweep | Before this session: 4/7. A breakout bug in the planar arrangement (`ArcParameter` wrapping) plus a scope limit on `Hole<Shaft>`. **Fixed the same day in commit `891c24dd`:** now 6/7, and the breakout cases match the analytic volume to ~1e-16. Tangency is rejected with the threshold in the author's own terms: "Put Center X below 19mm to keep a wall on that side, or above it to cut through the +X face." |
| Chimera, R = 4 | Builds: 914,217.5 mm³, 37 faces, enclosed, orientation-consistent. That includes the deliberately degenerate station, where fillet radius equals corner radius and the rolling-ball torus collapses to a sphere. |
| Bearing housing | Not attempted in this session. |

Firmament references edges semantically (`face(+Z)`, `Chimera.Outer On: Top`, segment names from the source
profile). They're carried through construction rather than looked up afterwards, so they survive the parameter edits
that renumber Zoo's `edgeId` indices.

## Findings

1. **The language wasn't the obstacle; the kernel was.** Every hard stop was a geometric operation. KCL's syntax, its
   good type errors and its deprecation messages got a model with stale knowledge to working booleans within two
   turns.
2. **There's no durable way to name an edge on a real part.** The same edge is spelled `sketch.rim` (a Segment),
   `region.tags.rim` (a TaggedEdge) or `extrude.sketch.tags.rim`. The tag form dies at the first boolean. The new face
   API is flagged do-not-generate. The GUI writes positional indices. For an AI, a reference it can't author or keep
   valid means it can't edit the part.
3. **One error sentence covers every geometric failure.** Tangency in a boolean, a fillet on a CSG result and a fillet
   on a plain extrusion all said "cannot handle this 3D subtraction yet". That gives an agent nothing to iterate on.
   By contrast, Zoo's syntax and type errors were among the best seen.
4. **The docs have the answers, just not where the errors point.** The book's Fillets chapter is excellent. The error
   didn't link to it, and the reference pages for the functions involved showed no examples.

## Caveats

- Turn 1 failed on stale training data, not on Zoo.
- Turn 2 leaned on GUI-generated KCL from a screenshot. A model without that would probably have taken longer.
- The doc fetcher reads server-rendered HTML. Reference-page examples may render client-side and would then be
  invisible to it, though not to a human.
- Rejecting exact tangency (turn 2b) is defensible, and SolidWorks does too. Only the message is criticized.
- "Arcs can't be filleted" was **not** isolated. What was shown is that a 17-edge line-and-arc chain fails at every
  radius tried. The check below would separate a single arc edge from a single straight edge.
- No FreeCAD or OCCT comparison was run. OCCT is known to struggle when fillet radius equals an adjacent convex
  radius, so no claim is made about it.
- This was one session with a human in the loop, not a benchmark.

## Open check

Append this to the turn 5 file. Each line fillets one edge of the same unmodified extrusion:

```kcl
oneArc = fillet(body, radius = 1, tags = [getOppositeEdge(chimeraRegion.tags.ConvexLargeArc)])
oneLine = fillet(body, radius = 1, tags = [getOppositeEdge(chimeraRegion.tags.Bottom)])
```

If `oneLine` builds and `oneArc` fails, the headline becomes "Zoo can't fillet an arc edge." If both build, the
failure is in filleting a chain, and the report should say that instead.

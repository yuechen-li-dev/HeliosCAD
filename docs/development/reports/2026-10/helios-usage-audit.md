# Helios usage audit — 2026-10-31

The decisions below were implemented in the
[group movement, guide inspector and mates follow-up](../2026-11/group-guides-mates-usage.md).

## Method

Used the local application through installed Edge as a user: welcome screen,
New part, the base chooser, IntelliDraft canvas gestures, keyboard tools,
selection, tracing, extrusion, graph fields, Source navigation and an assembly
frame connection. Started with a clean Helios checkout. Changes are confined
to Helios; geometry edits continue through the public Aetheris runtime.

The manual draft contained a dragged rectangle, a center/radius circle, and an
arc created by center/start/end clicks. Moved the arc, snapped a chord onto its
endpoints, clicked the enclosed region to trace it, extruded and built the
result. Also edited a block through graph controls. In a separate New assembly,
dragged Fixed.Top onto Moving.Bottom, chose Fixed, previewed and applied the
mate; the assembly reported one joint and a successful build.

## Jank found and fixed

| Finding | Reproduction | Result |
|---|---|---|
| Unapplied graph values disappeared on navigation | Edit extrusion `to` from 6 to 10, switch to Source, return to Graph: the field silently returns to 6. | FieldSet now reports pending state to the workspace. Source/Parameters/assembly-view changes and selection/operation paths retain the draft until Apply or Discard. Save is unavailable while field edits are pending. Header actions and keyboard save/history use the same guard. |
| An obsolete drag error followed the user into another stage | Move the chord of an arc with shared endpoints, receive the radius refusal, then choose Trace: the old drag error still appears below a usable trace. | Choosing a different tool/stage clears the previous operation's refusal. Compiler construction diagnostics still come from the current projection. |
| Extrusion controls disappeared after the first extrusion | Trace an outline, Extrude Profile, then try to change its height in Extrude. Only a paragraph remains; the value is buried in Advanced/Draw or the graph. | Extrude now shows the compiler-projected start and editable end height, Update extrusion and Discard. It works after reopening too. Pending height changes block building/navigation; failed updates retain the staged value. Driven ends remain read-only. |

The final manual pass repeated protected graph editing and applying an 80 mm
block width, then drew/traced/extruded another rectangle and changed its end
height from 6 to 12 inside IntelliDraft. The field remained available and build
became available again after Update.

## Findings needing a product decision

1. **Dragging connected guides.** A snapped chord reuses the arc's named
   endpoints. Dragging only the chord can put the endpoints at unequal distances
   from the arc center, so the compiler refuses it. Dragging the entire arc
   moves its points together. This is a real interruption to the expectation
   that every draft element can move, but silently detaching points or moving
   connected neighbors would choose new modeling semantics. Recommend explicit
   multi-select/group translation that preserves shared points, with a visible
   indication of those shared points.
2. **Reshaping guides after drawing.** Selecting a circle/rectangle gives a
   dimensional inspector; selecting an arc/line gives a separate guide row and
   movement, while its defining point edits live under Advanced. Creation is
   much easier than subsequent radius/endpoint editing. Recommend a guide
   inspector, after deciding which points/angles remain fixed when an arc's
   radius changes. Do not substitute numeric positions for authored expressions.
3. **Feature graph versus general visual programming.** Parts is currently a
   source dependency graph edited by fields and Add operations; it has no
   draggable wire ports. Assembly frame-to-frame wiring did work through joint
   selection, preview and Apply. A LabVIEW/ComfyUI style dataflow editor would
   need explicit value/geometry ports, type/unit rules and compiler-owned
   connection semantics. Exposing React Flow handles alone would misrepresent
   that capability. Keep the current distinction unless that larger authoring
   model is intended.

## Confirmed existing behavior

Circle center/radius and arc center/start/end worked through actual canvas
clicks. Direct arc dragging worked in Draw. Trace and Extrude advertised and
enforced locked construction; returning to Draw made editing available again.
Clicking an enclosed arc/chord area produced a two-edge closed trace and a
successful solid. These earlier fixes were present in the starting checkout.

## Qualification

Run from the Helios root:

```powershell
npm test -- --reporter=dot
npm run build:fast
npx playwright test --config playwright.graph.config.ts
npx playwright test --config playwright.intellidraft.config.ts
```

The new graph regression repeats the original lost-edit case, source navigation,
discard and apply, and downloads the resulting source. The new extrusion
regression changes 6 to 10, exercises discard, applies, builds, reopens and
exports STEP. Independent Aetheris CLI reimport reports exact volume
24,000 mm³ for its 60 × 40 × 10 mm rectangle.

An additional final regression stages an invalid -1 mm extrusion end. The
construction projection accepts that source edit; full Build and use part
rejects the solid and retains the open draft. Restoring 10 mm then builds and
exports the expected exact volume. The UI and documentation retain this
distinction between construction staging and final solid admission.

Generated logs, screenshots, source and STEP stay under ignored
`artifacts/local/`. Relevant images are
`graph-authoring/unapplied-fields-protected.png` and
`intellidraft/editable-extrusion.png`.

Results: all 211 unit tests passed; `build:fast` passed; all 11 graph browser
tests and all 21 IntelliDraft browser tests passed. Final focused reruns passed
the graph-navigation regression and the expanded extrusion failure/recovery
regression. `git diff --check` passed. The final focused runs refreshed the
screenshots linked above.

This is a local anonymous authoring pass, not qualification of cloud persistence,
authentication, AI connections, manufacturing beyond the exported witnesses or
arbitrary models. Development hot reload was followed by a fresh load before
the final manual check; no recovery/persistence claim is made for a code update.

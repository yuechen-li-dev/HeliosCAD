# Production AOT qualification - 2026-11-03

## Result

**Passed for the Windows x64 candidate below.** The curved IntelliDraft AOT
blocker is fixed. The freshly extracted self-contained package passes all 62
browser usage cases, including both previously crashing workflows and 128 fresh
traces alternating pick order. The production SDK remains stock .NET WASM AOT.
This report records pre-release qualification. Publication of 0.1.0 is covered
by the [release notes](../../../release/0.1.0.md) and its attached qualification.

## Cause and fix

A clockwise canvas pick order is valid user input. IntelliDraft first validates
its generated Profile, sees that the outer winding needs reversing, then retries
with the picks reversed. The retry used a C# exception filter with a pattern-bound
pick list. On Mono browser-wasm 10.0.13, the filtered-catch handoff loses method
arguments. The retry then passes invalid source/document arguments into the
syntax cache, which aborts in virtual dispatch while hashing the tuple key.

The cache was where the corruption surfaced. Earlier comparer/cache experiments
were reverted. Using the retained failing AOT binary, the original pick order
aborted while the reversed and explicitly directed orders succeeded. The same
fixture/protocol also passed 128 times in the interpreted control.

[dotnet/runtime#136780](https://github.com/dotnet/runtime/issues/136780) independently
reports argument corruption after a filtered catch on this runtime, including the
same `class-accessors.c:72` assertion. It documents that a plain catch preserves
arguments. Aetheris commit `0bb73989` moves only the winding retry condition into
the ordinary catch handler and rethrows unrelated failures. Geometry, winding
validation, error messages and the syntax cache retain their existing owners.
No runtime fork or new compiler/cache implementation was added.

The worker regression alternates both pick orders and asserts that document
identity, revision and the generated Profile survive the retry. The door UI test
now clicks the named endpoint exactly; its previous 1 mm offset legitimately
created a different endpoint name and failed an outdated source-name expectation.
The first fixed-package run retained that negative evidence (61/62); the final
archive and test inputs pass all 62.

## Qualified artifacts

Windows archive:
`artifacts/local/standalone/0.1.0-preview.1-win-x64-1793725890815/Helios-0.1.0-preview.1-win-x64.zip`

SHA256: `f7438353394f2eefe74b54cc30d3eae9b0ab2f65b1d797c80ae6319e316a902f`.

The clean-source manifest pins Helios `f2d3294`, Aetheris `0bb73989`,
Leviathan `ff1a508` and Dominatus `7b52df3`. The host source is the isolated
`artifacts/local/0.1-qualification/Leviathan` checkout; the user's active
Leviathan checkout remains unchanged. The later documentation commit does not
change the tested frontend/runtime.

Production SDK:
`../Aetheris/artifacts/local/helios-sdk/aetheris-cad-2.0.0.tgz`, also retained as
`artifacts/local/aot-investigation/aetheris-cad-2.0.0-0bb73989.tgz`.

SDK SHA256: `f2317be6c4a9c042d15ebd30abd0cb25757a0d83af9fd9206445884826018e6b`.
The AOT native WASM is 58,535,895 bytes, SHA256
`f42958a8e2f4651e2c3db4c70a92c456762b2dc26c95231b85e7c79e5f92fd70`.
The installed SDK and built frontend are production AOT builds.

## Verification

- `npm run sdk:install:production`, production frontend build, SDK pack and
  clean-source standalone Windows packaging pass with .NET SDK 10.0.401 / runtime 10.0.13.
- `node scripts/qualify-standalone.mjs --usage`: **62 passed, 0 failed, 0 skipped**.
  The extracted host runs with Node and installed .NET removed from its child PATH.
  Inventory hashes, authentication/CSRF/origin guards, single instance, real AOT
  worker build, STEP bounds/topology/reopening, GLB/PDF export, persistence/restart,
  checkpoints, native MCP pairing/revocation/stdio bridge and Quit/process exit pass.
- Usage includes gallery groups, graph/feature/mate editing, draft/group/radius
  editing, language intelligence, all six canonical lessons, documentation,
  multi-file project loading and the SolidWorks AP214 -> annotations -> AP242/GLB path.
- Full Aetheris Release build: zero errors. Core fast lane: 1184 passed.
  Full solution: **6404 passed, 2 skipped, 0 failed across 21 projects**.
  The existing skips are DrawingNotes external-renderer/crop tests; they are not
  counted as passes. Native IntelliDraft focused lane: 21 passed.
- Helios unit suite: **244 passed across 48 files**. Bundled documentation check
  passes as part of the production build. SDK installation audit reports zero advisories.
- Manual use of the extracted package drew three lines and a center-first arc,
  traced them in the formerly failing order, extruded 6 mm, built and exported
  AP242. Current CLI validation accepts the saved source. Its exported STEP is
  one enclosed body/shell, 6 faces (5 planes, 1 cylinder), 12 edges, 8 vertices;
  bounds [-20,0,0] to [20,40,6]. The visually inspected built-part screenshot is
  `artifacts/local/intellidraft/line-arc-door-built.png`.

## Evidence and boundaries

Generated logs, JSON and the manual source/STEP are under
`artifacts/local/aot-investigation/`. Principal files:
`filter-fix-sdk-build.log`, `fixed-aot-regression.log`, `full-build.log`,
`core-fast.log`, `full-tests.log`, `full-trx/`, `full-test-summary.json`,
`helios-unit.log`, `final-package-build.log`, `final-production-usage.log`,
`final-usage-results.json`, `manual-curved-validation.json`,
`manual-curved-analysis.json`, `trace-orders.log` and `RESULT.json`.
Earlier failing binary probes and package traces remain retained.

Extracted-package qualification and browser evidence:
`artifacts/local/standalone/Extracted smoke 1793725936627/QUALIFICATION.json`
and its `usage-tests/` directory. `latest-qualification.json` identifies the
verified archive and checksum. The default qualifier continues to require the
curved AOT worker regression even without `--usage`.

Qualification is local Windows x64 / Chrome. Linux/macOS native packaging,
live external AI provider accounts and a fresh SolidWorks add-in UI session were
not rerun. The operating-system default-browser launch remains a manual check:
automatic approval review previously rejected that Windows launch command with
only "blocked by policy"; it was not retried through another tool. Native startup
was tested with `--no-browser`, then the authenticated package UI was tested in
Chrome and manually in Edge. The candidate recorded here is `0.1.0-preview.1`;
the 0.1.0 Windows release is built and qualified separately.

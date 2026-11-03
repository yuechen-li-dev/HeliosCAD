# Production AOT qualification - 2026-11-03

## Verdict

**Blocked for release.** The production SDK and self-contained Windows archive
build, and most extracted-package usage works, but tracing certain valid curved
IntelliDraft outlines terminates the Mono WASM AOT worker. No release was
published, pushed, tagged, or promoted to 0.1.

## Qualified work

- Production AOT SDK built with .NET SDK 10.0.401 / browser-wasm runtime 10.0.13;
  `npm pack` produced `Aetheris/artifacts/local/helios-sdk/aetheris-cad-2.0.0.tgz`.
- Extracted archive tested from a directory containing spaces, with Node and
  installed .NET removed from its child PATH. Native launch used `--no-browser`.
  Authentication, CSRF/origin checks, single instance, native MCP pairing/revocation
  and stdio bridge, persistence/restart, checkpoints, exports and shutdown passed.
- Fixed the pinned host's missing GLB/glTF MIME mappings. The actual gold knot
  now loads and rotates; reduced-motion and failed-asset fallback tests pass.
  Host fix lives on isolated `codex/helios-production-media` at `ff1a508`;
  the user's active Leviathan checkout was left unchanged.
- Fixed qualification assumptions about semantic model names vs filenames and
  the developer-only terminal. Long suites drain host output asynchronously.
- Full production browser usage: **59 passed / 3 failed / 0 skipped**. Passed
  gallery groups, graph authoring, mates, supported draft workflows, editor
  intelligence, all six tutorial lessons, documentation navigation, multi-file
  project loading, and SolidWorks AP214 import with annotations and AP242/GLB export.
- Manual browser use created an 80 x 50 x 10 mm plate with an offset diameter
  12 mm through-hole. Its UI-exported STEP reimports as one enclosed body with
  bounds [-40,-25,0] to [40,25,10] and exact volume 38869.02664470767 mm^3.
- Helios unit suite: 244 passed; host suite: 78 passed. Full Aetheris solution:
  6404 passed, 2 skipped, 0 failed across 21 test projects. NIST qualification now
  retains strict Windows x64 export hashes separately; only 9 platform hash
  deltas changed, with all statuses, diagnostics and topology unchanged.
- Production npm audit: zero advisories. Bundled manual check: 150 pages and
  166 resources match the current source snapshot.

## Release blocker and reproduction

The failures are:

1. `intellidraft.spec.ts`: line/arc door outline, Use this outline.
2. `intellidraft.spec.ts`: group movement and circular arc inspector, then trace.
3. `worker-aot-cache.spec.ts`: the same curved draft through the served SDK
   Worker's public language protocol. It fails on revision 0, before completing
   the intended 128 fresh-source iterations.

The default standalone qualification now runs this worker regression even without
`--usage`. It discovers the Worker from the served app, not this checkout's
`dist` assets. The negative default gate was verified against the extracted archive.

Reproduce with the retained candidate:

```powershell
$env:HELIOS_BROWSER_CHANNEL = 'chrome'
node scripts/qualify-standalone.mjs --usage
# Or omit --usage for native smoke plus the small AOT regression.
```

Candidate archive:
`artifacts/local/standalone/0.1.0-preview.1-win-x64-1793721075035/Helios-0.1.0-preview.1-win-x64.zip`

SHA256: `a6ebf032675eb3cb2ac2fc3295754db5a0ab264b8204e602a8a8f099b2a8187d`.
Its manifest pins Helios `afaac7f`, Aetheris `e9bc949a`, host `ff1a508`,
and Dominatus `7b52df3`. This is a failing diagnostic candidate, not a shippable package.

Mono asserts at `class-accessors.c:72` while resolving a virtual call from
`ValueTuple<string,string>.GetHashCode`, reached from the syntax parse cache and
`FirmamentIntelliDraft.EditOnce`. A symbol-map rebuild produced byte-identical
native WASM, so the symbolicated stack corresponds to the tested binary.
An explicit ordinal tuple comparer still aborts in its string-hashing call.
A bounded nested-string cache avoids the abort but incorrectly reports that the
valid source has no authored Model, in both the micro repro and the real UI.
Both experimental changes were reverted; no ineffective cache workaround remains.
The final Aetheris source tree is identical to the fully qualified `e9bc949a`
tree, with the revert history retained.

An interpreted-worker control using the same fixture and protocol passed all
128 fresh-source traces in 34.1 seconds. AOT fails on the first trace. This
is a browser execution control, not an inference from native tests.

The responsible next investigation is the WASM AOT compiler/runtime boundary:
reduce the parse/cache failure and qualify a supported runtime fix or toolchain
change. Native tests
alone do not qualify this path. Similar upstream symptoms are recorded in
[dotnet/runtime#130592](https://github.com/dotnet/runtime/issues/130592); this is
context, not proof that our failure has the same root cause. A custom runtime fork,
arbitrary GC changes, or a silent interpreter fallback would exceed this package
qualification and were not introduced.

## Evidence and limits

Generated evidence is under `artifacts/local/0.1-qualification/`:

- `package-tests-complete.log` and `package-complete-usage-results.json`: all 62 cases.
- `default-gate-negative.log`: retained candidate rejected by the new default gate.
- `interpreted-control.log` and `interpreted-control/worker-control.spec.ts`: same
  fixture/protocol, explicitly selecting the interpreted runtime; 128 traces pass.
- `aot-repro.log`, `aot-last-requests.json`, `aot-symbolicated-stack.txt`: original abort.
- `parser-fix-stack.txt`: symbolicated failed explicit-comparer experiment.
- `aot-string-cache-result.log`, `string-cache-iteration.log`, and
  `string-cache-ui-result.log`: failed nested-string experiment; native WASM
  retained as `string-cache-failed.native.wasm`.
- `aetheris-full-final.log`, `aetheris-summary.json`, `unit-tests.log`,
  `host-tests-media.log`, `npm-audit.json`, and `manual-part-*.json`.
- Full UI traces: `artifacts/local/standalone/Extracted smoke 1793723524338/usage-tests/`.

The linked SDK was restored to a development build after reverting the experiments;
production assets in the retained archive/tarball remain available for investigation.
The restored development frontend build and 244 unit tests pass again.
Rebuild with `npm run sdk:install:production` before a future production frontend
build. Source pins and qualification guards remain strict; do not bypass them to ship.

Windows x64 and Chrome were exercised here. Linux/macOS native packaging was not
rerun locally. The operating-system default-browser launch remains unqualified:
automatic approval review rejected that Windows launch command with only
"blocked by policy"; it was not retried through another tool. Existing test hosts
were exercised through their authenticated browser URLs instead. Live external AI
provider accounts and a fresh SolidWorks UI session were not part of this pass.

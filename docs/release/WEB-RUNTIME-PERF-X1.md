# WEB-RUNTIME-PERF-X1 — production WASM AOT and tessellation reuse

## Verdict: Meaningful progression

Helios's production Vite bundle now routes heavy geometry through the packaged **browser WASM AOT Worker**. Page-thread LX continues to use the standard non-AOT SDK runtime. The unchanged one-turn Helix builds in **2.056 s warm median** (five final, uncontended runs) in the AOT Worker, versus **3.496 s** in WEB-PERF-X0's AOT baseline and **41.355 s** in its original SDK-build WASM Worker. An earlier isolated five-run set measured **2.004 s** median. The production browser ran the AOT asset, and geometry/STEP outputs matched the reference fixture.

The three prior full face-tessellation calls are now **two**. This is intentionally **Meaningful progression**, not Accepted: the remaining STEP-orientation tessellation and final display tessellation use different tolerances and have different consumers. Reusing either patch set for the other would change the qualified orientation or display policy. The requested one-face-tessellation total and removal of all three known calls therefore remain unmet. No cross-policy cache or alternative orientation algorithm was inserted to make a call-count target look green.

## Runtime ownership and commands

`npm run sdk:install` builds and installs the fast Release non-AOT SDK for development. `npm run dev` uses that SDK for both page and Worker. `npm run build:fast` builds a development-mode bundle using the same runtime, without AOT. `npm run sdk:install:production` invokes the SDK's `build:production`: a normal Release `dotnet build` for the page-thread runtime plus a supported `dotnet publish -c Release -p:RunAOTCompilation=true -p:WasmStripILAfterAOT=false` for the Worker. `npm run build` then builds the production Vite bundle and requires `runtime-aot/` in the installed SDK package. The package installer synchronizes the exact `dist/` output after `npm install`, removing stale fingerprinted assets retained by npm for the unchanged preview version.

The SDK Vite plugin selects `/aetheris-runtime/` for direct page-thread calls and `/aetheris-runtime-aot/` for `Aetheris.create({ worker: true })` in production mode. It copies both runtime trees to the production bundle. Explicit `wasmUrl` remains an override. The production Worker request was observed fetching `aetheris-runtime-aot/_framework/dotnet.native.*.wasm`; the AOT native asset is **62,444,979 bytes**, versus **3,964,206 bytes** for the packaged non-AOT build. Vite preview and the Helios Caddy configuration mark fingerprinted framework assets immutable for one year and boot files cacheable for five minutes. The preview header passed a browser qualification check; Caddy syntax was checked against [official Caddy request-matcher](https://caddyserver.com/docs/caddyfile/matchers) and [header](https://caddyserver.com/docs/caddyfile/directives/header) documentation, but a local Caddy validation run was unavailable because the Docker daemon was stopped. No cloud deployment was part of X1.

The Web Runtime retains default publish trimming plus `TrimmerRootAssembly` for the Web Runtime and Firmament reflection paths. IL stripping after AOT remains off because it was not qualified. The supported Microsoft `wasm-tools` and `RunAOTCompilation` pipeline supplies AOT; there is no custom compiler or runtime. The clean AOT publish baseline from X0 was **356.2 s**, versus **33.9 s** for non-AOT publish; X1 did not attempt to reduce publish time.

| Manifest-referenced package runtime | Files | Raw | Brotli files | Gzip files |
| --- | ---: | ---: | ---: | ---: |
| Page/development non-AOT runtime | 216 | 44.11 MB | not emitted | 16.18 MB |
| Production AOT Worker runtime | 73 | 81.56 MB | 16.93 MB | 25.22 MB |

These are local file sums, not measured network transfer. The production package includes **both** runtimes: its npm tarball is **100.1 MB** compressed and **186.4 MB** unpacked, including precompressed sidecars. The page runtime is loaded only when LX needs it; the Worker runtime is separate. The localhost AOT Worker initialization in the final X1 Helix run was about **400 ms**, with about **285 ms** in runtime creation. The first model build took **2.380 s** after initialization.

## Tessellation ownership and exact limit

Before X1, `FirmamentBuildAndExport` exported the WireForm BRep to STEP, reimported it for manifold validation, and the STEP orientation resolver tessellated the imported body using `DisplayTessellationOptions.Default` (`π/12`, `0.05 mm`, `12`, `256`). `WebModelSession.CompilePart` then reimported the same STEP text a second time for display; orientation resolution repeated the same default-policy face tessellation. Finally `WebMeshBuilder` tessellated the display body at Helios's policy (`π/16`, `0.3 mm`, `6`, `64`) and attached source-map/picking ranges.

The WireForm result now retains the **already validated imported body** in its in-process-only `RuntimeBody` field. `CompilePart` consumes that body directly, eliminating the second STEP import and its duplicate orientation tessellation. A new compile creates a new result/body; no process-global mesh cache exists, and old revisions cannot be retrieved through this reference. STEP export remains BRep-driven and unchanged. The orientation resolver still needs its default-policy signed-volume mesh to derive canonical face orientation. The final display mesh still needs its own policy, BRep edge polylines, face identity, source-map ranges, normals, and winding. Inspector queries use the stored model snapshot and do not tessellate again.

The opt-in `BuildPerfTrace` call-count gate requires **two** `tessellation.faces` spans and no `web.display-step-reimport` for the reference Helix. This is one call per **distinct body/policy purpose**, with no stale cross-revision cache. It does not satisfy the requested one-call total because the two policies are not equivalent. A later bounded orientation/display design would have to prove a policy-compatible shared result or replace the STEP orientation volume calculation without weakening its qualification; X1 does not assume either is safe.

| One-turn Helix | X0 current SDK WASM | X0 AOT baseline | X1 production AOT |
| --- | ---: | ---: | ---: |
| Warm median model build | 41.355 s | 3.496 s | **2.056 s** (2.040–2.113 s) |
| Cold first model build, after Worker init | 41.349 s | 3.884 s | **2.380 s** |
| Full face-tessellation calls | 3 | 3 | **2** |
| Orientation tessellation (representative warm) | two calls, ~32.36 s combined | two calls, ~2.73 s combined | **1.371 s** |
| Final display tessellation (representative warm) | ~5.61 s | ~0.514 s | **0.499 s** |

The X1 warm AOT improvement over its prior AOT baseline is **1.440 s (41.2%)**. The remaining two tessellations consume about **1.870 s (91.0%)** of a representative **2.056 s** warm build. This localizes the remaining cost without claiming an unqualified cache hit. A freshly rebuilt Native RyuJIT benchmark measured **0.284 s** warm median after the same duplicate-reimport removal.

The same AOT Worker built the Box and Box + Hole controls with unchanged topology and STEP output. After one first-use build each, the second Box took **16 ms** and the second Hole **19 ms**, with `face(+Z)` and `face(H.Wall)` present. Their first-use builds were **275 ms** and **113 ms** in that run. These are small bounded controls, not hard budgets.

## Correctness and browser evidence

The X1 AOT one-turn Helix retained **130 faces, 260 BRep/display edges, 9,276 display triangles**, six projected fields, and the same STEP SHA-256 (`c2776d40f4e3e47aae404f4189a2d526cc57b19ccad6d3b85f282a8fb02db988`) as X0. Six repeated AOT builds passed the phase call-count assertion and disposed their sessions; no unbounded cache was introduced. Aetheris CLI `verify` reported an enclosed, orientation-consistent imported STEP with 130 derived-qualified faces; its external-inspection admission remained pending, so no external-viewer claim is made.

The actual production Vite bundle was built and served in Chrome. Its AOT Worker initialized, compiled and transferred a Box mesh, exposed `face(+Z)`, and fetched the AOT native WASM. Six production browser workflows passed: Hole Diameter Inspector source rewrite/rebuild, save during a stale Worker build, Telos save/reopen/build/STEP export, production Worker bundle, Helix Worker responsiveness, and Monaco LX completion/selector/diagnostic flow. Follow-up assertions observed the **app's** AOT runtime request for heavy geometry and the standard non-AOT runtime request for page-thread LX. The Helix UI test observed a ~**2.36 s** current rebuild, **30 ms** command-palette response, **52 ms** typing response, **64 ms** maximum heartbeat gap, and continued newest-wins/last-valid behavior. The benchmark's source-map and field-projection gates passed. The normal Helios unit suite passed **29/29** tests.

The Aetheris Release solution build passed with zero errors (two WASM SQLite varargs warnings); the serial full solution test passed **3,872 tests** across 20 populated suites, with `Aetheris.FrictionLab.Tests` reporting no discoverable tests. The production Vite bundle test uses `playwright.production.config.ts` and `npm run build` output, while normal tests and development do not force an AOT publish.

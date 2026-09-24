# WEB-PERF-X0 — Helix build profiling and browser WASM AOT qualification

## Executive verdict

**Runtime-dominated, with a measurable repeated-tessellation cost.** The representative one-turn Helix takes **0.476 s** warm on Native RyuJIT, **41.36 s** in the current Helios SDK `dotnet build -c Release` browser runtime, and **3.496 s** in a Release browser WASM AOT publish. AOT makes the actual current path **11.83× faster** and a separately tested non-AOT Release publish **3.44× faster**. The output geometry, selectors, source maps, field projection, STEP export, and Worker path passed the qualification checks below. AOT still takes **7.34×** the native time: three full face tessellations consume **3.25 s (92.8%)** of its warm build. The current ~40 s symptom is chiefly execution mode; repeated work remains the dominant residual cost after AOT.

**One next primary action:** package and ship the qualified **browser WASM AOT publish** as Helios's production `@aetheris/cad` Worker runtime, preserving the measured reflection roots and correctness gates. This milestone deliberately does not change geometry, tessellation, tolerances, validation, or the production package selection. Warm editor interaction is the priority over the larger first download. The three tessellations are documented here for a later bounded investigation, not a second action for this milestone.

## Identical workload and method

The committed fixture is [`Aetheris/fixtures/firmament/web-perf-helix-1.firmament`](../../../Aetheris/fixtures/firmament/web-perf-helix-1.firmament): `Helix` with radius **6 mm**, pitch **5 mm**, **1 turn**, wire diameter **2 mm**, stainless material, and start frame. The circular wire section is represented by **4 quadrant patches**. The 2-, 5-, and 10-turn variants change only the turn count. The same `Aetheris.Web.Runtime/Program.cs` request handler, Firmament source, geometry tolerances, normal STEP roundtrip, display options, and JSON result path execute in all three runtimes. The native host compiles this same program source into a normal .NET 10 Release process; the browser variants invoke it through the same SDK Worker. The fixture yields 33 coil stations, 130 BRep faces, 260 edges, 6,336 display vertices, 9,276 triangles, 130 mesh ranges, and 260 display edge polylines. No distinct production section-profile authority exists for this Helix materializer, so a second profile would invent a different workload.

Machine: Windows 11 Pro build 26200, AMD Ryzen 7 7700X (8 cores/16 threads), 31.1 GiB RAM, .NET SDK 10.0.401 with `wasm-tools`, Chrome **153.0.8010.53**. Native phases use `Stopwatch`; browser/Worker spans use `performance.now()`. All variants are Release. Browser runs used a fresh Chrome context per variant with `Cache-Control: no-store`, then reused the loaded Worker for warm runs. Each Helix variant has one cold first execution and five warm repetitions. Scaling points and Box/Hole controls are one run each. Timings are elapsed wall time; they are machine-specific qualification evidence, not CI thresholds. LX completion is excluded from geometry build time.

The **actual current Helios package** is `dotnet build -c Release` output (called **WASM current / SDK build** below). We also measured a **non-AOT Release publish** to isolate publish-time runtime optimization. The SDK build does not have publish-time Jiterpreter preparation; the published non-AOT comparison can use Jiterpreter and is much faster. Published browser WASM AOT is the third required runtime. These are browser WASM modes, not .NET NativeAOT executables. [The .NET runtime Jiterpreter design notes](https://github.com/dotnet/runtime/blob/main/docs/design/mono/jiterpreter.md) describe this publish/build distinction; our measured mode labels are based on the actual build and publish commands, rather than an assertion about which individual methods Jiterpreted during a run.

## End-to-end runtime matrix

All times below are model build time **after Worker initialization**, including compile, normal export/reimport/display, SDK bridge serialization, and Worker return. Cold means first model execution in the loaded Worker; warm is the median of five subsequent executions. Ranges are warm min–max. Box and Hole are controls after the Helix repetitions, so they are warm-runtime single samples. No Loft control was needed to distinguish this Helix path.

| Runtime | Helix cold | Helix warm median (range) | Box | Box + Hole | Dominant warm phase |
| --- | ---: | ---: | ---: | ---: | --- |
| Native RyuJIT | 1,520 ms | 476 ms (456–575) | 73.5 ms | 84.0 ms | Three face tessellations, ~325 ms |
| WASM current / SDK build | 41,349 ms | 41,355 ms (41,287–41,630) | 178.9 ms | 223.7 ms | Three face tessellations, ~37,965 ms |
| WASM current / Release publish | 13,608 ms | 12,040 ms (11,976–13,045) | 109.4 ms | 97.8 ms | Three face tessellations, ~11,429 ms |
| WASM AOT / Release publish | 3,884 ms | 3,496 ms (3,480–3,512) | 58.6 ms | 72.2 ms | Three face tessellations, ~3,245 ms |

The native first use is a real cold outlier. Published current and AOT also show first-use effects; current SDK build remains near 41 s across all six runs. Controls take tens to hundreds of milliseconds, showing that fixed Worker/JSON overhead cannot explain the Helix time.

| Control model | BRep faces | BRep edges / display edges | Triangles | STEP bytes |
| --- | ---: | ---: | ---: | ---: |
| Box | 6 | 12 | 12 | 5,870 |
| Box + Hole | 7 | 15 | 144 | 7,307 |

## Phase breakdown and duplicate work

The opt-in `performance` request flag enables `BuildPerfTrace`. It records **inclusive and exclusive** milliseconds, allocated bytes, GC counts, and geometry counts. Child spans are nested in parents; **do not add** parent and child inclusive times. The table uses one representative warm run near each variant's median, with disjoint top-level spans and the principal child shown in parentheses.

| Phase, ms | Native RyuJIT | WASM current / SDK build | WASM current / publish | WASM AOT |
| --- | ---: | ---: | ---: | ---: |
| Compile + STEP export + first reimport (inclusive) | 224.2 | 17,412.8 | 5,179.6 | 1,492.9 |
| ↳ First STEP reimport (inclusive) | 185.1 | 16,755.0 | 5,049.8 | 1,425.8 |
| ↳ First face tessellation (exclusive) | 145.8 | 16,071.9 | 4,891.0 | 1,366.4 |
| Second STEP reimport for Web display (inclusive) | 176.7 | 16,976.4 | 5,084.7 | 1,422.6 |
| ↳ Second face tessellation (exclusive) | 138.3 | 16,283.9 | 4,914.3 | 1,365.2 |
| Final mesh build (inclusive) | 45.1 | 5,643.3 | 1,639.8 | 527.3 |
| ↳ Final face tessellation (exclusive) | 41.3 | 5,609.6 | 1,623.5 | 513.5 |
| Sum of three disjoint face tessellations | **325.4** | **37,965.4** | **11,428.8** | **3,245.1** |
| Face tessellation / warm wall time | **68.3%** | **91.8%** | **94.9%** | **92.8%** |

The first STEP reimport occurs in `FirmamentBuildAndExport` for the WireForm manifold report. `WebModelSession.CompilePart` reimports again because that result has no `RuntimeBody`. Both orientation-resolution paths invoke face tessellation; the Web mesh build invokes it a third time. The separate STEP export itself takes **382 ms** in SDK-build WASM, and source projection **127 ms**; they are secondary. The Helix path samples/frames take **~0.5 ms** in SDK-build WASM, sweep surfaces/topology **~14 ms**, BRep binding validation **~7.5 ms**, and WireForm report validation **~2.5 ms**. Parse/bind takes **~3.2 ms** there, so schema source generation/static lookup is not a runtime cause. Display edge extraction is ~13 ms per tessellation in that mode. The materializer does not expose a separate trim/pcurve generation phase; STEP import/orientation validation is included in the reimport spans. These are measured architecture boundaries, not invented subdivisions of a profiler trace.

The SDK bridge also is not the bottleneck: representative warm SDK-build `bridge.invoke` is **41,336 ms**, response parsing **3.1 ms**, Worker transport **2.3 ms**, and transferred mesh payload **415,440 bytes**. AOT response parsing and Worker transport remain about **2.8 ms** and **2.3 ms**. Exact lower-level hot-function inventory was not required to resolve the dominant phase; the nested spans isolate it directly.

Managed allocations remain large in AOT: about **354 MiB** in compile/export, **345 MiB** in the second reimport, and **130 MiB** in final mesh build, about **0.83 GiB** over those disjoint stages. Published current has essentially the same allocation. Inclusive allocation counters for nested spans must not be added. The cumulative SDK-build GC counters increase by about **258 Gen0** and **6 each Gen1/Gen2** between warm Helix runs. Thus AOT speeds the same high-allocation work; it does not remove it. The test did not establish a reliable browser peak working-set value or individual temporary-array attribution.

## Scaling and representation

Single samples for each larger turn count, with radius/pitch/section/tolerances fixed. The one-turn column is the warm median above. Display edge polylines equal BRep edge counts. The STEP sizes shown are browser current/AOT bytes.

| Turns | Coil stations | Section quadrants | BRep faces | BRep edges / display edges | Triangles | STEP bytes | Native RyuJIT | WASM current / publish | WASM AOT |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 33 | 4 | 130 | 260 | 9,276 | 357,557 | 0.476 s | 12.040 s | 3.496 s |
| 2 | 65 | 4 | 258 | 516 | 18,492 | 714,174 | 0.941 s | 25.126 s | 7.083 s |
| 5 | 161 | 4 | 642 | 1,284 | 46,140 | 1,822,610 | 2.145 s | 64.928 s | 18.509 s |
| 10 | 321 | 4 | 1,282 | 2,564 | 92,220 | 3,670,027 | 4.074 s | 131.044 s | 39.601 s |

Counts are essentially linear in turns, as are the observed native and browser times; AOT's ten-turn point is somewhat above a strict 10× extrapolation. One spring-like object already produces **9,276 triangles** and **130 faces** at one turn; this warrants visual-density review before claiming the count necessary. Web display tessellation uses fixed world-space `DisplayTessellationOptions(π/16, 0.3 mm, 6, 64)`, not screen-space error. The STEP orientation resolver uses `DisplayTessellationOptions.Default` (`π/12`, `0.05 mm`, `12`, `256`) on each reimport. The denser resolver tolerance contributes to the duplicated cost; no policy change was made here.

The expensive SDK-build WASM variant was measured for the reference Helix and controls, but not the larger scaling points. The scaling comparison uses native, non-AOT Release publish, and AOT Release publish with the same request path and geometry settings.

## AOT startup, publish, and download cost

The AOT publish used the supported .NET 10 browser-WASM toolchain and `-p:RunAOTCompilation=true -p:WasmStripILAfterAOT=false`; the current publish used `RunAOTCompilation=false`. Both used Release, default publish trimming plus explicit `TrimmerRootAssembly` entries for `Aetheris.Web.Runtime` and `Aetheris.Kernel.Firmament`. Those roots preserve JSON bridge and Firmament reflection metadata: an earlier default-trim publish failed at `info`/Firmament values. Disabling trimming altogether caused a runtime/CoreLib mismatch, so the qualified configuration retains trimming and the explicit roots. IL stripping after AOT remains **off** because it was not correctness-qualified. See [Microsoft's WebAssembly AOT guidance](https://learn.microsoft.com/en-us/aspnet/core/blazor/webassembly-build-tools-and-aot?view=aspnetcore-10.0) and [WASM runtime performance guidance](https://learn.microsoft.com/en-us/aspnet/core/blazor/performance/webassembly-runtime-performance?view=aspnetcore-10.0).

| Published runtime | Manifest-referenced assets | Raw runtime assets | Brotli sum | Gzip sum | Native `.wasm` | Worker init smoke |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| WASM current / Release publish | 73 | 21.49 MB | 6.10 MB | 7.73 MB | 2.39 MB | 237 ms |
| WASM AOT / Release publish | 73 | 81.56 MB | 16.91 MB | 25.22 MB | 62.44 MB | 416 ms |

AOT costs **3.79× raw**, **2.77× Brotli**, and **3.26× gzip** runtime bytes; these are sums of the 73 boot-manifest-referenced files, excluding stale fingerprinted publish files. Brotli/gzip are local compression estimates, **not observed network transfer**; a remote CDN latency/cache study was not run. The localhost no-store smoke showed 73 framework requests and fetch spans of **121 ms current** and **113 ms AOT**; init includes module import, runtime creation, and assembly exports, but not a model build. AOT runtime creation itself was **293 ms** versus **124 ms** current. A clean current Release publish took **33.9 s** and a clean AOT Release publish took **356.2 s** (**10.5×** longer), both timed with `Stopwatch` and a serial `dotnet publish`. Browser caching should amortize the larger first download for warm editor sessions; that product assumption is separate from the measured local build times.

## Correctness and Worker qualification

The browser harness ran all models through the SDK Worker, not a main-thread-only shortcut. Current published and AOT builds produced **byte-identical STEP SHA-256** for Box, Hole, and all four Helix turn counts, with equal vertices, triangles, face ranges, edge counts, and source-map counts. Native and browser hashes match for the one- and two-turn Helix and controls. At five turns, native STEP differs from the browser by exactly **four coordinate lines** of 24,401, with maximum numeric delta **1.000033×10⁻¹³ mm**; current published and AOT remain byte-identical. Native and browser ten-turn hashes also differ, without a full numeric diff. Thus semantic/topology equivalence is qualified, but exact cross-runtime STEP-byte determinism is **not** claimed for longer variants.

Box `face(+Z)` and Hole `face(H.Wall)` selectors, Helix's six-field projection, source maps, no diagnostics, valid STEP, and mesh counts passed in each browser variant. A temporary Helios production Vite build using the AOT assets passed `npm run build` and the actual production-bundle Worker Playwright test (one pass); the installed package was restored to the normal SDK build afterward. A concurrent language-service request returned revision `perf-lx`, `Helix` context, and six fields in **32.6 ms** while AOT Worker Helix took **3,953 ms**. The sampled main-thread heartbeat max gap was **154.7 ms** during that concurrent test and **64.5 ms** in the SDK-build benchmark. This verifies continued interaction, without interpreting heartbeat as geometry time.

## Repeatability and gates

The opt-in source instrumentation is in `BuildPerfTrace`, the Firmament materializer/exporter, tessellator, Web request handler, and SDK Worker bridge. `HeliosCAD/scripts/Test-WebPerf.ps1` is the repeatable native + SDK-build + current-publish + AOT-publish + Chrome Worker + asset-accounting driver. Individual stages were executed for this report; the combined wrapper was not run end-to-end after its final assembly. The benchmark writes raw JSONL/logs under ignored `Aetheris/artifacts/local/web-perf*`; key files are `web-perf-native.jsonl`, `web-perf-build.jsonl`, `web-perf-browser.jsonl`, `web-perf-assets.json`, and `web-perf-lx.jsonl`. `node scripts/test-web-perf.mjs --smoke-aot` and `--lx` reproduce the AOT Worker and concurrent LX checks. Performance is intentionally outside normal strict wall-time unit tests.

The Aetheris Release solution build passed with zero warnings/errors. The serial full solution test passed: **3,872 tests across 19 populated suites**, with `Aetheris.FrictionLab.Tests` reporting no discoverable tests. Helios `npm run build` and `npm test -- --run` passed (29 unit tests) after restoring the normal SDK package. The temporary AOT production Vite build and its Worker test passed. A fresh agent given only this report identified the current WASM execution mode as the primary bottleneck and the AOT Worker package as the next action. No geometry optimization was made in X0.

# WEB-RUNTIME-WORKER-X1 — nonblocking Aetheris builds

## Verdict

**Accepted in local Chrome.** A representative Helix took about 39 seconds in the Worker while the editor, palette, viewport controls, Inspector, project navigation, and save path remained responsive. No cloud service or WebAssembly threading is involved.

## Ownership and protocol

Helios keeps Monaco, Three.js display and picking, source revisions, Inspector rewrites, project state, and Telos persistence on the page thread. A page-thread Aetheris runtime serves only lightweight Firmament language completion and schema queries, so completion does not sit behind a long build. A separate `Aetheris.create({ worker: true })` runtime executes compilation, BRep construction, tessellation, construct projection, and STEP export. This duplicates the WebAssembly runtime in two realms to preserve independent language response during heavy geometry work; it does not reload the Worker runtime per build.

`AetherisWorkerClient` accepts version 1 `BuildRequest` records with request ID, source revision, source text, and source name. It runs one request at a time and retains only the newest pending request. The SDK Worker transport sends version 1 messages with a transport ID, source revision, and operation. The Worker echoes both IDs in results or typed errors, and the SDK checks the revision before accepting a reply. Mesh positions, normals, and indices cross as transferable buffers. STEP export returns transferred bytes; it is decoded from the runtime's base64 response inside the Worker. Worker execution duration, transport delay, and transferred buffer bytes are observable through `ModelSession.workerTiming`.

Every source edit advances Helios's source revision. A completed build is displayed only if its revision still matches the current source revision. A stale result is ignored, and the previous immutable model snapshot stays visible. Source and display revisions and **MODEL OUT OF DATE** are shown in the status bar. A build failure keeps previous geometry and returns diagnostics. The Worker can be terminated and recreated from **Restart Worker** after a transport failure. Cancellation is logical: the running .NET call is not preempted; the newest pending build starts afterward.

The Worker uses a message event listener instead of assigning `onmessage`. A truthy `onmessage` causes runtime initialization to hang in this Worker setup, matching [dotnet/runtime issue #114918](https://github.com/dotnet/runtime/issues/114918). The SDK's module Worker is resolved through Vite; production output contains separate Aetheris and Monaco Worker bundles.

## Qualification

- `npm run build` and `npm test` pass (29 unit tests at closeout). The Aetheris Release solution builds, and its full .NET suite passes with serial scheduling (`dotnet test Aetheris.slnx -c Release --no-build -m:1`). An earlier parallel run failed two NIST display corpus cases; those cases and the full serial suite passed on rerun.
- Chrome Worker SDK test builds Box and Hole sequentially in one runtime, retains `face(+Z)` and `face(H.Wall)`, transfers typed geometry, returns field projection, exports STEP, and recovers after forced Worker termination. A bounded eight-build loop reused one Worker and disposed each session. A separate Chrome test loaded the production Vite Worker bundle and built a Box from its copied WebAssembly assets.
- Browser app tests pass for Box/Hole picking and source correspondence, Inspector Hole Diameter rewrite, Telos save/reopen, STEP export, and language completion. Invalid source returns a diagnostic while retaining the last valid definition and displaying the out-of-date label.
- In a real Helix build, Monaco accepted an edit in 54 ms, the command palette opened in 28 ms, and a 50 ms page-thread heartbeat had a maximum observed gap of 64 ms. The source edit made the 38,940 ms in-flight result stale; a subsequent 38,758 ms explicit rebuild displayed the new Helix. Save remained usable during the first build.
- A fresh UI-only pass in Edge changed Helix radius during a roughly 41-second build, opened the palette and Inspector, navigated Projects, and saved. It found a Monaco model reuse bug on reopen; a per-mount document path fixed it, and a save/reopen regression plus the fresh UI retest confirmed the saved radius reappears.

## Performance evidence

The direct SDK benchmark used the same one-turn Helix source in a fresh Chrome page. Times below are wall time unless noted.

| Measure | Result |
| --- | ---: |
| Worker WebAssembly initialization | 463 ms |
| First Helix Worker build | 38,901 ms |
| Repeat Helix Worker build | 38,700 ms |
| Page-thread Helix build baseline | 40,304 ms |
| Worker compile/export phase, first build | 16,496 ms |
| Worker mesh/display preparation phase, first build | 5,484 ms |
| Transferred mesh buffers | 415,440 bytes |
| Worker message transport delay, first/repeat | 4.7 / 3.5 ms |
| Main-thread Helix display update | 3.1 ms |
| Largest page-thread heartbeat gap during Worker builds | 64 ms |
| Largest page-thread heartbeat gap during page-thread build | 40,307 ms |

The SDK's compile phase includes several internal steps; the difference between its phase timers and Worker execution includes runtime orchestration and JSON snapshot serialization. It is not attributed to the kernel without further profiling. The Worker keeps the 39-second geometry cost but removes the observed 40-second page-thread stall.

## Limits

There is no preemptive cancellation, Worker pool, WebAssembly threading, or kernel optimization. The page-thread language runtime costs extra memory but keeps completion independent of geometry. Transfer timing measures the Worker message boundary; it is not a full heap or lifetime memory profile. Browser acceptance was run in local Chrome, with an additional fresh UI pass in Edge. Firefox and cross-origin deployment were not qualified. STEP still originates as base64 inside the current .NET runtime before Worker-side byte conversion; this is outside the page thread.

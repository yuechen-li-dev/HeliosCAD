# Helios as a Claude artifact

## Change

`npm run build:artifact` (`scripts/build-artifact.mjs`, `vite.artifact.config.ts`) builds Helios to run as a
claude.ai artifact and writes `artifacts/local/helios-artifact/publish.json`, the Artifact publish arguments.
The README section "Run Helios as a Claude artifact" is the procedure another Claude follows.

- **Target flag.** `src/platform/target.ts` (`VITE_HELIOS_TARGET=artifact`). Off in every other build.
- **Routes.** `src/navigation.ts`: path routes normally; a plain `#name` in the artifact (the only address part the
  host passes), with query parameters carried in session storage across the reload. Call sites that used
  `location.assign`/`href="/…"` go through it.
- **Saves.** `src/platform/saveFile.ts`: anchor download normally; in the artifact, the viewer's `downloads`
  capability, with types it doesn't offer (`.step`, `.firmament`, `.stl`, …) inside a `.zip`.
- **No server UI.** Explore, My projects, the desktop host control, the AI Author and its reference library are
  hidden; nothing calls `/api` or `/__helios`.
- **Runtime.** Trimmed non-AOT `dotnet publish` of Aetheris.Web.Runtime (54 files, 21 MB) in place of the
  development runtime (198 assemblies, 53 MB). Public paths are made relative; `.glb` is served as
  `application/wasm` (artifacts don't serve `.glb`); literal U+FFFD in bundled JS is escaped (the host rejects it).

## Evidence

- Host check artifact: WebAssembly (streaming), module workers, dynamic import, IndexedDB and the Cache API all
  work in the artifact frame; `application/wasm` is served; not cross-origin isolated (the runtime doesn't need it).
- Local Chromium against the built site: showcase and `#local` load, the bracket example builds in 1.7 s on the
  trimmed WASM worker, no failed requests.
- Published: 159 files, 32 MB, one publish. `tsc -b` and 278 vitest tests pass.

## Verdict

Success. The artifact is a try-out surface, not a deployment: no accounts or AI, and the interpreter runtime is
slower than the AOT release on large models.

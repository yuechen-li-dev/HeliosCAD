# Developing Helios

For downloads and everyday use, start with the [README](README.md). This guide
covers source builds, application boundaries and checks for contributors.

## Build the local editor

Use Node.js 26, npm and .NET SDK 10.0.401 with the `wasm-tools` workload.
Clone Aetheris and HeliosCAD as sibling directories. Use the Aetheris revision
in `standalone-sources.json`; the default branch can contain newer, unqualified work.

```powershell
git clone https://github.com/yuechen-li-dev/Aetheris.git
git clone https://github.com/yuechen-li-dev/HeliosCAD.git
cd HeliosCAD
$pins = Get-Content standalone-sources.json | ConvertFrom-Json
git -C ../Aetheris checkout --detach $pins.aetheris
dotnet workload install wasm-tools
npm run sdk:link
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4173/` for the gallery or `/local` for the editor.
Local modeling works without a backend or account. The optional development
terminal runs through Vite on loopback; it is absent from production packages.

`sdk:link` builds the sibling browser SDK and Telos renderer before installing
Helios's npm dependencies. Run it before the first `npm install`. The SDK is a
local directory link, so rebuilding it updates the runtime in place. Use the
fast interpreted SDK for iteration; `sdk:install:production` builds the AOT SDK.
Keep `package-lock.json` and the SDK directory dependencies intact.

## Application boundaries

- **Aetheris owns CAD and language semantics.** Firmament source is the saved
  design. Its compiler owns validation, construction, geometry, source mapping
  and export. Use its existing services when adding editing capabilities.
- **Helios owns the workspace UI.** The graph and IntelliDraft perform source
  edits through the public SDK. Preview/apply, source revisions and recovery
  protect the accepted model when an edit is invalid or a build finishes late.
- **The browser SDK owns the runtime bridge.**
  [AetherisWorkerClient](src/sdk/AetherisWorkerClient.ts) serializes geometry
  work through a dedicated Worker. A separate language Worker serves the editor.
  [FirmamentLanguageClient](src/source/FirmamentLanguageClient.ts) adapts the
  language service to [SourcePanel](src/source/SourcePanel.tsx) and Monaco.
- **Leviathan owns the optional backend and native host.** It handles local
  identity, project storage, native AI connections and host lifetime. The
  standalone package uses the local profile. Hosted community/account features
  have separate deployment and authentication requirements.

See [graph editing](docs/public/graph-modeling.md), [IntelliDraft](docs/public/intellidraft.md),
[AI connections](docs/public/ai-connections.md) and [export contracts](docs/public/exports.md)
for behavior contributors should preserve. Historical implementation and
qualification reports live under `docs/development/reports` and `docs/release`.

## Run the optional backend

Leviathan and Dominatus must also be sibling checkouts. From HeliosCAD, use
the same source pins loaded above:

```powershell
git clone https://github.com/yuechen-li-dev/Leviathan.git ../Leviathan
git clone https://github.com/yuechen-li-dev/Dominatus.git ../Dominatus
git -C ../Leviathan checkout --detach $pins.leviathan
git -C ../Dominatus checkout --detach $pins.dominatus
cd ../Leviathan
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:LEVIATHAN_DATA_DIR = Join-Path $PWD 'data-local'
dotnet run --project src/Leviathan.Server --no-launch-profile --urls http://127.0.0.1:5189
```

In a second terminal, run `npm run dev` from HeliosCAD. Vite proxies `/api` to
port 5189. `/discover` and `/projects` exercise the backend. Development uses
isolated local data; hosted PostgreSQL/S3 deployment is a separate path.

## Documentation and assets

- `npm run docs:sync` refreshes the offline manual from the pinned Aetheris public
  guides, linked fixtures and Helios's `docs/public`. `docs:check` detects drift.
- `node scripts/sync-showcase.mts` refreshes canonical model sources; the manifest
  records origins and hashes. Requalify a changed example in the browser.
- `npm run branding:export` rebuilds the knot GLB from its Firmament source.
- `dotnet run --project scripts/wireframes -c Release -- .` regenerates gallery
  wireframes. See [showcase provenance](fixtures/showcase/README.md).
- Keep generated captures, downloads, logs and test outputs under ignored
  `artifacts/local/`. Curated documentation images belong under `docs/images/`.

## Checks

```powershell
npm test
npm run docs:check
npm run build:fast
npx playwright test --config playwright.showcase.config.ts
npm run test:learning
```

Use browser tests appropriate to the changed workflow. A native .NET test pass
alone does not qualify a change to the production WASM runtime.

## Package and qualify the desktop app

Packaging needs clean source checkouts at the revisions in `standalone-sources.json`.
Run from HeliosCAD with Aetheris, Leviathan and Dominatus beside it:

```powershell
npm run sdk:install:production
npm run build
npm run package:standalone -- win-x64
$env:HELIOS_BROWSER_CHANNEL = 'chrome'
node scripts/qualify-standalone.mjs --usage
```

Set `HELIOS_LEVIATHAN_SOURCE` to an isolated checkout of the pinned host when the
active sibling checkout is on another branch. The production build uses AOT for
geometry work and the standard runtime for page-thread language services. The
qualifier extracts the actual archive, checks its inventory, and exercises startup,
authentication, CAD exports, persistence, shutdown and the full UI usage suite.
Without `--usage`, it still requires the curved AOT trace regression. Credentials
and test data remain in ignored local artifacts. The standalone GitHub workflow
also exercises native platform packaging.

`compose.production.yaml` is the separate hosted deployment candidate, using
PostgreSQL, S3-compatible storage and Caddy. Its configuration has been parsed;
the desktop qualification does not establish a live hosted deployment.
See [deployment boundaries](docs/release/HELIOS-TELOS-X0.md) before using it.

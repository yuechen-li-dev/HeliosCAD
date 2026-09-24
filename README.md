# HeliosCAD

HeliosCAD is the code-first Firmament editor, using the public `@aetheris/cad` browser runtime. Leviathan owns sign-in, accounts, project ownership, revision metadata, and object storage. Firmament source is the saved project truth; the editor rebuilds geometry and exports STEP from that source.

## Discover and publication

The root page is a public model gallery. It renders checked-in PNG previews and asks Leviathan for recent Public publications; the Aetheris geometry Worker and editor code load only after entering an editor. Public detail pages show previews and Firmament source. An anonymous Fork keeps its intended model through Leviathan sign-in or registration, creates a separate private project, and opens that project directly in Helios. My Projects is available from the top navigation.

An owner can publish the current saved and built project from the editor. Leviathan pins the publication to an immutable Telos revision and stores the captured PNG in its object store. Public reads use that revision even as the owner saves later private edits. Project deletion hides its publication. The checked-in Cartesian lamp is a STEP-backed reference with two source files; its shade is the editable gallery example because the current project/editor contract is single-source. See [the Discovery X0 report](docs/release/HELIOS-DISCOVERY-X0.md) for routes, access boundaries, qualification, and the remaining full-assembly editing limit.

## Editor architecture

The single Firmament document is edited with Monaco in `src/source/SourcePanel.tsx`. Monaco owns cursor, selection, undo, indentation, and the visible markers. `src/source/FirmamentLanguageClient.ts` is the one adapter from the editor to the public Aetheris Web SDK LX contract. A page-thread runtime handles only completion and schema queries so completion does not wait behind a geometry build. `src/sdk/AetherisWorkerClient.ts` serializes heavy builds through one dedicated Aetheris WebAssembly Worker, retaining only the newest pending request. The SDK transfers mesh buffers and STEP bytes; the main thread keeps display, picking, project state, and save/reopen UI. Source and display revisions are shown separately, and late build results cannot replace newer source state. The selected model's source map still drives Go to Source and source cursor selection. Typing does not rebuild geometry. See [the Worker X1 report](docs/release/WEB-RUNTIME-WORKER-X1.md).

The current SDK exposes completion and compiled selector candidates. It does not expose hover, live language diagnostics, symbols, or definitions. Monaco markers and Problems currently show the same diagnostics returned by compile/rebuild; they are cleared when the source changes and refreshed on explicit rebuild. See [the LX X0 report](docs/release/HELIOS-LX-X0.md) for qualification and gaps.

## Local development

Keep `HeliosCAD`, `Leviathan`, and `Aetheris` as sibling checkouts. For local iteration, run `npm run sdk:install` to build the fast non-AOT Aetheris SDK tarball in `Aetheris/artifacts/local/helios-sdk`. The Vite dev server uses that runtime for both LX and the Worker. Then:

```powershell
cd ../Leviathan
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:LEVIATHAN_DATA_DIR = Join-Path $PWD 'data-local'
dotnet run --project src/Leviathan.Server --no-launch-profile --urls http://127.0.0.1:5189
```

In a second terminal:

```powershell
cd ../HeliosCAD
npm run dev
```

Open `http://127.0.0.1:4173`. Vite proxies `/api` to Leviathan on port 5189. Local development uses an isolated SQLite query database and filesystem object store under `LEVIATHAN_DATA_DIR`. Use a fresh local data directory after a schema change; PostgreSQL migrations are the production schema path.

## Qualification

```powershell
npm test
npm run build:fast
npm run test:e2e
```

The browser test launches Leviathan and Vite, then signs up, creates a project, edits and saves source, returns in a fresh Chrome profile, rebuilds, and exports STEP. It uses an isolated test database and requires installed Google Chrome. Server restart, account isolation, stale-save, and CSRF checks are in `Leviathan.Server.Tests`.

## Production deployment candidate

`compose.production.yaml` runs the ASP.NET server, PostgreSQL, and a Caddy HTTPS/static frontend. It requires an existing HTTPS S3-compatible bucket. Build the production frontend from the sibling Aetheris checkout with `npm run sdk:install:production` followed by `npm run build`; the install command creates the local SDK tarball before npm resolves Helios dependencies. The production bundle keeps standard WASM for page-thread LX and selects the .NET WASM AOT runtime for the geometry Worker. Run `npx playwright test --config playwright.production.config.ts` for local production-bundle qualification before publishing. Then set the required Compose variables in a private `.env` or secret source and run `docker compose -f compose.production.yaml up --build -d`. Configure the public DNS name in `HELIOS_HOST`. Keep the PostgreSQL, Leviathan data, and Caddy volumes durable and backed up. Caddy caches fingerprinted runtime assets as immutable and revalidates boot files after five minutes. Run `GET /health/ready` through the public hostname after startup. See [the runtime performance report](docs/release/WEB-RUNTIME-PERF-X1.md) for the measured AOT tradeoff and remaining tessellation limit.

The Compose file has passed configuration parsing, but no live production deployment or PostgreSQL/S3 integration test has run in this checkout. See [the X0 release report](docs/release/HELIOS-TELOS-X0.md) for the exact qualification boundary.

# HeliosCAD

HeliosCAD is the code-first Firmament editor, using the public `@aetheris/cad` browser runtime. Leviathan owns sign-in, accounts, project ownership, revision metadata, and object storage. Firmament source is the saved project truth; the editor rebuilds geometry and exports STEP from that source.

## Local development

Keep `HeliosCAD`, `Leviathan`, and `Aetheris` as sibling checkouts. Build the public Aetheris SDK tarball in `Aetheris/artifacts/local/helios-sdk` using `npm run sdk:install` here, or use the existing tarball from the Aetheris X1 checkout. Then:

```powershell
cd ../Leviathan
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:LEVIATHAN_DATA_DIR = Join-Path $PWD 'data-local'
dotnet run --project src/Leviathan.Server --no-launch-profile --urls http://127.0.0.1:5189
```

In a second terminal:

```powershell
cd ../HeliosCAD
npm ci
npm run dev
```

Open `http://127.0.0.1:4173`. Vite proxies `/api` to Leviathan on port 5189. Local development uses an isolated SQLite query database and filesystem object store under `LEVIATHAN_DATA_DIR`. Use a fresh local data directory after a schema change; PostgreSQL migrations are the production schema path.

## Qualification

```powershell
npm test
npm run build
npm run test:e2e
```

The browser test launches Leviathan and Vite, then signs up, creates a project, edits and saves source, returns in a fresh Chrome profile, rebuilds, and exports STEP. It uses an isolated test database and requires installed Google Chrome. Server restart, account isolation, stale-save, and CSRF checks are in `Leviathan.Server.Tests`.

## Production deployment candidate

`compose.production.yaml` runs the ASP.NET server, PostgreSQL, and a Caddy HTTPS/static frontend. It requires an existing HTTPS S3-compatible bucket. Build the frontend first with `npm ci && npm run build`, set the required Compose variables in a private `.env` or secret source, and run `docker compose -f compose.production.yaml up --build -d`. Configure the public DNS name in `HELIOS_HOST`. Keep the PostgreSQL, Leviathan data, and Caddy volumes durable and backed up. Run `GET /health/ready` through the public hostname after startup.

The Compose file has passed configuration parsing, but no live production deployment or PostgreSQL/S3 integration test has run in this checkout. See [the X0 release report](docs/release/HELIOS-TELOS-X0.md) for the exact qualification boundary.

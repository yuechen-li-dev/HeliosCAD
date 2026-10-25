# Standalone Helios preview qualification

## Change

The browser-first package combines the production Helios/Aetheris WebAssembly
frontend with the existing Leviathan host. An explicit desktop profile uses
loopback, local SQLite/filesystem storage and the normal Identity/CSRF contracts.
A launch capability signs the browser into a local identity; no development
identity bypass, cloud registration, PostgreSQL, S3, Node installation, bundled
browser or .NET SDK is required for modeling. Port 4180 stays stable for browser
checkpoint history. Reopening the launcher reuses one host; Quit stops it.

The release recipe pins Aetheris, Leviathan and Dominatus source revisions,
checks frontend provenance, inventories/hashes the payload and includes notices.
Native packaging targets Windows x64, Linux x64 and macOS ARM64. The production
frontend is built once and reused by the platform host jobs.

## Defects found and repaired

- The static host did not serve manifest-required PDB assets. It now admits
  those files from packaged `wwwroot`, keeping arbitrary host files private.
- Production trimming removed constructor names from kernel import reports and
  collaboration review records. Aetheris's Web runtime now preserves those
  contract assemblies alongside its existing reflection roots. This repairs
  actual compile/snapshot and GLB/PDF export failures, preserving provenance.
- The local cookie gate ran before native MCP capability admission. The
  capability owner now runs first; cookie-free native requests still require a
  valid pairing, and revoked pairings fail.
- A clean checkout lacked the linked viewport's generated output. CI explicitly
  builds three-telos, including the checked-in WGSL assets.
- A regenerated local SDK tarball needs an explicit install to replace its old
  locator checksum. CI installs the source-built artifact and restores the
  committed locator; source revisions and package inventories identify the
  actual binaries. The expensive SDK cache is saved before application tests.
- The offline-agent test harness could select an executable without its DLL.
  It now requires the companion DLL when selecting a flat test output.
- Hosted Windows also exposed temporary executable locks during fixture
  deletion. Fixture disposal now uses a short bounded asynchronous retry;
  process-exit assertions remain in place and persistent failures still fail.
- Browser dependency advisories were closed. DOMPurify 3.4.17 also replaces
  Monaco's internally vendored sanitizer through one bounded build resolution;
  the build rejects the obsolete module. fflate, Vite, source-map-js and test
  dependencies receive their available patches. No modeling algorithm changes.

## Evidence

- Aetheris fast lane: 1,110 pass. Final full solution build and full lane pass:
  6,038 pass, two existing external Drawing Notes renderer tests skipped.
- Leviathan full suite: 78 pass. Helios frontend: 149 pass. Final npm audit:
  zero advisories, including development dependencies.
- All six offline AI browser/protocol scenarios pass after the dependency
  updates, including real geometry edits, recovery checkpoints and cancellation.
- Local clean-source Windows candidate: `dd9e0fa`, Aetheris `155195761`,
  Leviathan runtime `1a06f411`, Dominatus `7b52df302`. Hosted qualification pins
  Leviathan `1745b8e4`, which adds the fixture-cleanup correction without changing
  production code.
- Its extracted executable passes with SDK/Node absent from the child PATH:
  authenticated bootstrap, foreign-origin/CSRF rejection, single-host behavior,
  actual production AOT build and viewport, STEP/GLB/PDF export, STEP reopening,
  local project persistence, browser checkpoint restore across restart, native
  MCP pairing/revocation and packaged stdio initialization/tools/EOF exit.
- Independent Aetheris CLI analysis of exported Box: one enclosed manifold body,
  six planar faces, twelve line edges, eight vertices; bounds
  `[-10,10] × [-7.5,7.5] × [0,8] mm`. The test normalizes IEEE negative zero.
- Payload inspection finds no Skia, PDFium, WebView2, Edge or Chromium binaries.
  The local Windows archive is approximately 166 MiB and includes .NET/ASP.NET.
- Hosted [qualification run 40238936309](https://github.com/yuechen-li-dev/HeliosCAD/actions/runs/40238936309)
  passes the frontend job and all three native extracted-package jobs. Every
  archive records clean source revisions at Helios `48c1483f` and the pinned
  dependencies. Downloaded archives match their native-job SHA-256 receipts.
- [Preview release v0.1.0-preview.1](https://github.com/yuechen-li-dev/HeliosCAD/releases/tag/v0.1.0-preview.1)
  is public, with Windows x64 (166.3 MiB), Linux x64 (162.0 MiB), and macOS ARM64
  (158.5 MiB), `SHA256SUMS`, and per-platform qualification JSON.
- The unauthenticated public Windows download matches
  `9d41e895ec7025b2200eefff7044e580b63c7d2424453315956692d1a1ef3cd6`
  and passes the complete extracted-host/browser qualification again. Both Unix
  public download endpoints return HTTP 200. The release tag resolves to the
  exact qualified Helios commit `48c1483f4334f49878f952e56aae8f02d3d2a74e`.

## Qualification boundary

Automatic approval review rejected the separate default-browser launch smoke
command with only “blocked by policy.” It was not retried through another tool.
The normal OS shell/browser association check remains manual; the extracted
host and actual fragment/bootstrap/browser workflow are automatically qualified.
Unsigned-download prompts and live vendor-account/subscription entitlement are
also manual checks. No provider credentials or user agent applications were
modified for these tests.

All local qualification hosts and stdio helpers exit after the checks. Generated
archives, traces and private test data stay under ignored `artifacts/local/`.
`artifacts/local/standalone/cleanup-drafts.ps1` is review-only by default and
retains the latest package and successful qualification when explicitly run.

Verdict: **Meaningful progression**. The preview is published and its automated
native, CAD, persistence, export and native-agent protocol gates pass on all
three platforms. The remaining bounded check is an actual OS default-browser
launch from the downloaded launcher; automatic approval review blocked that
command. A human launch also qualifies unsigned-download prompts on their OS.

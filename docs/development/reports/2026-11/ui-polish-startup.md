# Aetheris Helios UI polish and development startup

Date: 2026-11-01

## Product presentation

- Product-facing home, editor, discovery, authentication and browser title now use
  **Aetheris Helios**. The home and editor use the boxed H placeholder, with a
  matching square favicon. The supplied glowing torus-knot reference remains the
  future logo direction; no final knot logo was generated or substituted.
- Controls and work surfaces use the shared `--radius-control` and `--radius-card`
  tokens, both zero. The sweep covers IntelliDraft, graph cards/labels/menus,
  counters/chips, discovery, model detail and authentication. Circle-shaped
  geometric/status symbols, spinner, mate ports and stage markers retain their
  meaning. Native platform menus and editor internals retain their own rendering.
- IntelliDraft's heavy gray cross is replaced by thin chain centerlines, an
  origin mark and positive direction arrows. Labels derive from compiler-projected
  frame axes; the XZ specimen displays X/Z. Viewport aspect ratio is included when
  sizing grid/axis annotations, so labels keep their screen size and reference
  graphics fill the visible canvas through its SVG letterboxed area. Geometry
  coordinates and source edits remain on the existing paths.

## Startup failure and fix

The earlier failure trace contains the injected HTML React-refresh preamble,
followed by `@vitejs/plugin-react can't detect preamble` while evaluating
`LocalHostControl.tsx`. React never mounts, so New part is unavailable. This is a
module initialization failure before the component error boundary can run.

The new startup regression makes that ordering deterministic: it delays the
HTML preamble's injection by 1.5 seconds and allows the application graph to
evaluate first. Before the fix, the page remains blank and the test fails.
`src/main.tsx` now imports the installed plugin's supported
`@vitejs/plugin-react/preamble` entry before application imports. Initialization
is a dependency of the module graph rather than relying solely on HTML-script
ordering. The delayed case now opens a working editor. Hot reload remains enabled;
the plugin makes this import empty for builds. No hand-written refresh globals,
startup retries or disabled HMR were introduced.

## Verification

- `npm test`: 220 passed in 46 files.
- `npm run build:fast`: passed; existing large-chunk advisory remains.
- `npx playwright test --config playwright.ui-polish.config.ts`: 2 passed.
  Covers delayed HTML initialization, five normal reloads, working CAD startup,
  XZ construction, zoom and both Apollonia/Bronze Age themes. Captures home,
  workspace and draft screenshots.
- The reload/editor/draft smoke also passed against the built app using preview
  on port 4176 (`HELIOS_TEST_PRODUCTION=1`, `--grep 'reloads open'`).
- Graph browser regression: 12 passed.
- IntelliDraft browser regression: 22 passed, including shared-point group
  movement, circular guide edits, tracing/building and qualified STEP exports.
- Manual Edge use verified the renamed editor, square controls, axes, and a
  canvas-drawn rectangle. No account, cloud write or AI host was needed.
- `git diff --check`: passed.

The two full browser regressions use the development server with HMR enabled.
This qualifies the motivating startup path as well as the built bundle check;
it does not assert that every possible Vite/plugin failure is eliminated.
Optional AI-host proxy requests still report connection refused when that host
is absent. That is independent of browser CAD startup.

The first draft rerun exposed a polish regression: using the aspect-corrected
display scale for authoring snap increments shifted the vertical-slot witness's
minimum X from -5 to -4 mm and a line from Y=25 to Y=26 mm. Display sizing now has
its own scale while authoring retains its preceding calculation. The two focused
golden-geometry regressions passed after correction, followed by the full draft
rerun. The original failures and traces remain in the initial regression output.

Evidence is ignored under `artifacts/local/`:

- `ui-polish-startup-before.log` and
  `ui-polish/browser-tests/ui-polish-entrypoint-initi-32d8d-n-the-HTML-preamble-is-late/trace.zip`
  retain the deliberately reproduced failure.
- `ui-polish-startup-after.log`, `ui-polish-browser.log`, `ui-polish-built-browser.log`, `ui-polish-unit.log`,
  `ui-polish-build.log`, `ui-polish-graph-regression.log`,
  `ui-polish-snap-correction.log`, `ui-polish-draft-final.log` record corrected runs.
- `ui-polish-draft-regression.log` and the two failing case directories under
  `intellidraft/browser-tests/` retain the display/snap regression before correction.
- `ui-polish/home.png`, `ui-polish/workspace-apollonia.png`,
  `ui-polish/workspace-bronze-age.png`, `ui-polish/draft-apollonia.png` and
  `ui-polish/draft-bronze-age.png` show the resulting presentation.

Changes are confined to HeliosCAD and preserve the preceding group/guide/mate
work already present in the working tree. No sibling repository was modified.

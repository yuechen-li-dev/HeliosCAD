# HELIOS-MVP-UX-X0 — local IDE shell

The editor now opens as a code-first workbench: Monaco on the left, the current successful 3D build on the right, a tabbed utility dock on the far right, and a bottom pane. The split is authored with MachinaLayout.JS 0.7.0 and resolved to stable pane dimensions. Build and Export STEP remain in the top bar. The existing editor, Inspector, viewport, Worker build, and STEP exporter are reused.

The utility dock contains Files (the current single-source project explorer), Inspector (semantic selection, source navigation, and existing field projection), Git, and LLM Author. Git and LLM Author are intentional placeholders. Git points local developers to the Terminal. The bottom pane contains a local PowerShell terminal, Output with current build/revision state, and Error List with clickable build diagnostics. The terminal is available only on a loopback Vite dev connection. It is line-oriented rather than a full PTY emulator.

## Local UX review

From this checkout, run `npm run dev -- --host 127.0.0.1`, then open `http://127.0.0.1:4173/local`. This development-only route opens the single-file local editor directly and does not need Leviathan. The normal gallery and saved-project flow still uses Leviathan as described in the README.

## Evidence

- [2560 × 1440 Chrome screenshot](HELIOS-MVP-UX-X0-2560x1440.png)
- `npm run build:fast` — passed.
- `npm test -- --reporter=dot` — 29 passed.
- `npx playwright test --config playwright.mvp.config.ts` — passed in Chrome at 2560 × 1440. It checked pane positions and usable widths, local PowerShell output, Files/Inspector tabs, Monaco edit, Build, downloaded STEP, and last-valid geometry plus Error List after a failed build.

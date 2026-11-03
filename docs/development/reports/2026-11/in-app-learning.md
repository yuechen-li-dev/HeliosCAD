# Firmament learning in Helios — 2026-11-02

## Result

Learn in the welcome/editor header, F1, the command palette and `/learn` expose
the current Firmament manual inside Helios. The GitHub Pages implementation was
inspected: its Preview 2 snapshot references retired documentation paths. This
implementation imports the current Aetheris public manual instead of restoring
that obsolete snapshot. The website checkout and Aetheris sources were not edited.

- 150 offline pages: the full current public manual, Helios workflow guides and
  linked cookbook indexes; 166 bundled source/illustration files. Search combines
  terms across titles and bodies, with section filtering. Internal links and
  heading navigation stay in the reader; external/source-repository links are
  explicit. Markdown is sanitized with the existing patched DOMPurify dependency.
- Six canonical lessons open complete, self-contained source in separate practice
  tabs. The source editor and normal compiler/runtime produce the geometry.
  A utility panel provides the instructions and checklist. The build checkpoint
  requires a successful build of the current source; the other steps are explicit
  self-checks, not automated geometry assessment. Progress syncs across tabs and
  survives reloads; edited source still needs Save source, as documented.
- Native modal focus containment/Escape/return focus, browser deep links,
  responsive navigation, light/dark themes, copyable code and source downloads.
  Help preserves an edited workspace. F1 opens documentation; Ctrl+Shift+P keeps
  the command palette. Starting a different project leaves the lesson checklist.
- MachinaLayout resolves the reading/navigation/contents regions. Its text view
  renders course guidance and its text utility owns heading slugs.
- `npm run docs:sync` refreshes the deterministic snapshot. `docs:check` detects
  drift before frontend builds; `test:learning` runs browser qualification.

## Verification

- All six canonical lessons validated using the current checkout's CLI:
  `dotnet ../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll validate <lesson> --json`.
  The globally installed `aetheris` tool was older and rejected lesson 2's Extrude;
  retained negative evidence and current successful reports are under
  `artifacts/local/learning/cli/`.
- All six lessons built through the actual Helios browser runtime, with compiled
  geometry and enabled exports. Browser tests also exercise a changed hole
  diameter, source preservation through Help, cross-tab progress, focus return,
  F1 from Monaco, search/copy/source navigation/deep links, and mobile/offline reading.
- `npm run test:learning`: 9 passed. Screenshots, traces on failure, and viewport
  captures are under `artifacts/local/learning/`.
- `npm test`: 244 passed across 48 files; the learning library tests cover exact
  fixture parity, rendering every shipped page, unique heading anchors, search,
  link resolution, sanitization, responsive region geometry and corrupt progress.
- `npm run build:fast`: passed TypeScript and the Vite browser bundle.
- `npm run build`: stopped at the existing SDK guard:
  `Production requires the AOT SDK package. Run npm run sdk:install:production.`
  This pass does not rebuild or replace the sibling compiler/runtime package.
  No .NET source changed; the .NET solution suite was not rerun for this UI/docs work.

## Boundaries

CLI workflows in the manual remain CLI workflows and are labeled in lessons.
Experimental material retains a banner and separate section. Practice tabs start
from canonical source; checklist persistence does not imply source autosave.
Non-tutorial source downloads may require companion files or imported assets;
the source viewer explains that boundary. The manual is a bundled snapshot,
updated explicitly from the canonical documentation rather than fetched at runtime.

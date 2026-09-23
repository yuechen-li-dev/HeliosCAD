# Helios DFH-X1 — Visual Studio for 3D objects

**Verdict: Meaningful progression.** Helios now has a source-first shell, a project/file explorer for its actual active source, a command palette, and source/geometry navigation where the SDK supplies provenance. The release does not meet the mission's success criteria for IntelliSense, multi-file projects, or copyable Firmament selectors.

## Before and after

| Area | Before | Now |
| --- | --- | --- |
| Left navigation | Default CAD model/feature tree | One source document in a project explorer; the displayed filename is derived from project name |
| Top bar | SOLID/SURFACE/ASSEMBLY tabs and mixed modeling toolbar | Explicit Open File, Edit Source, Fit View, Rebuild, Export STEP actions and searchable command palette |
| Source | 31% lower center region | 47% lower center region, with file name and dirty mark |
| Inspector | Parameter controls alongside identity | Semantic ID, face ID, clickable source and source action first; overrides collapsed and explicitly temporary |
| Commands | Visible Hole/Rebuild/Export buttons | Ctrl+Shift+P/F1 palette for valid Box/Hole source insertion, rebuild, save, export, views, opening and source navigation |

## Compiler and project boundaries

The installed `@aetheris/cad` browser contract (`dist/index.d.ts`) accepts one source string in `Aetheris.compile(source, { sourceName })` and `ModelSession.setSource(source, { sourceName })`. It exposes a model tree, source references, diagnostics, mesh ranges, selection resolution, and STEP export. It does **not** expose multi-file project compilation, a parser/binder service, completion metadata, signature help, hover, go-to-definition, or reference lookup. The cloud `Project` API also stores one `source` string. The explorer therefore shows exactly one real file and says so; `*.firmasm` and multi-file actions are deferred until source storage and compilation support them. No synthetic language metadata or second compiler was added.

## Source and geometry link

- Clicking geometry resolves an SDK semantic entity and face ID; the inspector shows both. In the fresh UI pass, the selected face mapped to `Body` and the model-level line 1, although the Box declaration was on line 3. Exact feature provenance needs upstream data.
- If the selected entity has `SourceReference`, Go to Source focuses its range. Missing provenance is shown as “No Firmament source.”
- Moving the source cursor within a compiled entity's range selects that entity and highlights its occurrence through `selectionForEntity`. This is occurrence-level highlighting, not precise face highlighting.
- Copy Semantic ID copies the raw SDK identity. The SDK does not provide a verified Firmament selector expression, so this is deliberately **not** labeled Copy Selector.
- Build diagnostics remain in Problems and navigate to their SDK source range.

## IntelliSense and authoring

The editor is still a textarea. It has no parser-backed completion, hover, signature help, inline diagnostics, semantic selector completion, or reference navigation. The palette offers two verified source commands: a Box template inside a Model block and the existing centered Hole authoring command. Other constructs such as Helix, Feature, Concept, Loft and Assembly are not advertised as insertions because valid context-aware templates cannot be verified through the current SDK contract. The assembly sample remains available as an openable example.

## Qualification

- `npm run build`: pass.
- `npm test -- --run --reporter=dot`: 24 pass.
- `npm run test:e2e`: pass. In Chrome the authenticated flow created a project, inserted and rebuilt a Box using the palette with zero diagnostics, edited source, saved, reopened in a fresh browser context, selected a face, navigated to source, and exported a STEP file with the expected header. Observed development-machine times: create plus initial build 1710 ms, save 109 ms, sign-in plus list 131 ms, reopen plus build 1055 ms.
- No idle rebuild loop was added. The existing viewport invalidation-driven render loop remains. Idle frame counts were not measured.

## Fresh UI-only agent friction

| Task | Result | Approx. time | Confusion / wrong turns | Remediation |
| --- | --- | --- | --- | --- |
| Create box | Success: edited starter source, rebuilt with 0 diagnostics | ~30 s | No wrong turn reported | Palette also offers a valid Box template; browser test verified its compile |
| Change height | Success: changed third Size value and rebuilt | ~15 s | No wrong turn reported | Source takes visual priority |
| Insert helix | Failed to discover syntax | ~45 s | Palette search “helix” returned no command; no in-product syntax help | Requires parser-backed language data and verified syntax |
| Fix error | Repaired source and returned to 0 Problems | ~45 s | Missing `]` on line 3 produced a generic Firmament V2 message located at line 1:1 | Requires more precise SDK diagnostics; Problems click did focus editor |
| Use selected face in source | Failed to form a valid selector | ~2 min | Inspector showed `face:5`; replacing generated Hole `On: +Z` with `On: face:5` failed with the same line 1 diagnostic | Requires verified selector formatting and semantic selector help from Aetheris |
| Find selected face's source | Partial: face ID shown and source link worked, but it selected model line 1 | ~30 s | Box declaration was line 3; provenance too coarse | Requires face-to-feature provenance from SDK |
| Export STEP | Command found and invoked; agent could not observe download | ~2 min | No completion UI; browser also showed no event for Download source | Added “STEP DOWNLOAD STARTED” status; Playwright independently verified STEP bytes and header |
| Save and reopen | Success: exact 30×20×40 source persisted; later valid Hole edit also persisted | ~30 s | No wrong turn reported | Existing Telos flow retained |

The agent registered a disposable account and created a project in about 45 seconds. It used only the running UI and in-product hints. It initially read the top “Build” label as a menu; the top actions now use explicit verbs. The agent's browser suppressed observable download events even for Download source, so its export result is inconclusive rather than an export failure.

## Remaining UX debt and next blocker

The next genuine blocker is a public Aetheris language-service/project contract: parser-backed syntax and field metadata, symbol/reference index, precise diagnostics, face-to-feature provenance, verified selector formatting, and multi-file compilation with file provenance. Implementing those in Helios alone would duplicate the compiler. Until that contract exists, the editor cannot meet the required IntelliSense and file/selector workflows. Source range matching also selects whole occurrences rather than exact faces, and inspector overrides have no reset action in the current browser contract.

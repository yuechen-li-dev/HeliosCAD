# Firmament editor polish — 2026-11-02

## Result

Improved the existing Aetheris-owned language service and Helios Monaco adapter.
In-app documentation remains a separate next task. Prior gallery, branding and
SolidWorks work in this checkout was preserved.

- Completion now understands syntax owners and value positions, suppresses strings
  and comments, filters construct families, and includes local values, parameters
  and reusable Feature/Function names. Model, Modify and six existing solid
  constructs have schema metadata. Field spellings follow the current convention.
- Complete identifiers are replaced, including the suffix after the cursor. An
  existing colon is retained. Entry snippets unwrap the appropriate declaration
  and provide a name tab stop; complete reference examples remain available.
- Semantic highlighting includes newer language keywords. Hover uses the owning
  field schema and shows local signatures. F12 navigates local declarations,
  scoped parameters and unique declarations in an explicit project snapshot.
- Thread field errors now explain the mistake and underline the unique field.
  Nested document identities and EOF markers are retained correctly.
- Format is available from the toolbar, palette and Shift+Alt+F, shares Monaco's
  undo history, and reports refusals. Find, comment, problem navigation, folding,
  snippets and bracket matching contributions are loaded. Formatting preserves
  specialization and number/unit adjacency; modules and assemblies use a
  conservative spelling pass rather than part layout rules.
- Language queries run in a separate WASM Worker. Providers reject stale,
  cancelled and foreign-editor responses. A revision-aware Monaco bridge prevents
  delayed React snapshots from overwriting rapid typing after snippet insertion.
  Line endings are normalized before builds and matched by Monaco, preserving
  compiler/editor offsets without invalidating a just-started import build.

## Evidence

All final verification used the development Web SDK rebuilt from current Aetheris
sources. Logs and screenshots are under ignored `artifacts/local/language-polish/`.

- Helios TypeScript and `npm run build:fast`: passed. Vite retains its existing
  large-chunk warning.
- Helios unit suite: 238 passed; final affected editor/app rerun: 22 passed.
- SDK language transport: 8 passed.
- Language browser suite: 6 passed. This covers templates and fast name typing,
  mid-word fields, live red squiggles and F8, comment suppression, format shortcut,
  idempotence and undo, find/comments, local F12 and project F12. Project navigation
  also asserts the imported assembly is current and has two definitions.
- Fast template workflow repeated three times: all passed.
- Graph and project-loading regressions: 13 passed, including undo/redo, STEP
  export, explicit assembly mates, module edits and missing-resource diagnostics
  (`regression-browser-final.log`).
- Manual Edge UI: typed a Cylinder, accepted radius completion, entered dimensions,
  formatted with the standard shortcut and built with Ctrl+Enter. The model reached
  Ready with no diagnostics (`manual-cylinder.png`).
- Aetheris full Release build: zero warnings/errors. Core fast: 1,168 passed.
  Full solution: 6,371 passed, zero failures, two existing drawing tests skipped.
  Firmament contributes 3,393 passing tests. Focused language/schema: 98 passed.
- The parameterized editor fixture validates through the real CLI. Executable solid
  templates compile through their existing geometry owners; formatting five Learn
  parts and the parameterized Feature part retains byte-identical STEP output.

Initial failed runs were retained. They exposed incomplete-colon recovery,
formatter specialization spacing, old global-completion expectations, stale source
synchronization, and old browser/mock assumptions. Final runs exercise their fixes.
The mock now emits Monaco model-content events; project-loading targets the banner's
source input rather than matching the separate STEP input too.

## Limits and isolated follow-up

This remains bounded editor intelligence, not a complete protocol server with
rename, references, or type-aware member resolution. Some producer diagnostics,
notably assembly errors, still have document-header anchors. Formatting is only
qualified for the tested owners and inputs; it does not prove a successful build.
Production AOT publishing was not rerun in this pass.

A separate compiler reproduction remains: take
`../Aetheris/fixtures/Language/Editor/parameterized-plate.firmament`, move the prefix
before `Model editorPart` into `parts/library.firmament`, and compile a root that
includes that file followed by the Model. The current SDK reports `internal-error`
with details `ArgumentOutOfRange_IndexLength Arg_ParamName_Name, length`. Keeping
Feature and Model in the same document works. The equivalent two-file Learn 06
assembly works and is the cross-file navigation witness. This pass does not expand
file-local Feature semantics or hide that compiler failure. The ignored
`project-audit.mjs` / `project-audit.json` retain the exact Web SDK reproduction.

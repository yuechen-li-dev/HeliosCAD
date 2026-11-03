# Sectioned example gallery

Date: 2026-11-01

The welcome gallery and both workspace Examples surfaces now use independently
scrolling named rows. Basic contains Simple bracket and Paperclip. All five
original examples remain in Advanced, including the mounting plate.

Rows use native overflow scrolling with end-aware arrow buttons, touch/trackpad,
and Left/Right/Home/End on the focused rail. Search matches model details or group
names. There is no autoplay, duplicated card or synthetic filler content.

Personal groups select references to the seven shipped examples. Names and
membership can be edited; removal has Undo. Saving or restoring a group focuses
its row. Organization survives reloads through local browser storage and updates
other gallery instances. Invalid saved records and retired model IDs are ignored;
storage failure is reported as temporary organization. No cloud persistence is
implied, and model sources are not copied or changed by grouping.

## Basic geometry

- Simple bracket: one L profile, 30 × 40 mm, 3 mm walls, extruded 20 mm.
- Paperclip: 1 mm WireForm, four straight lengths and three 180° bends. Aetheris
  reports 95.6991118431 mm stock, four cylindrical and three toroidal surfaces.
- Both thumbnails come from Aetheris compilation, exact STEP reimport and the
  existing native wireframe renderer. Source and preview receipts were verified:
  46 source documents and seven SVG assets.

The initial Model-wrapped canonical paperclip built in the current desktop CLI
but failed in the installed October 28 browser runtime with
`firmament-v2-phase3-edge-finish-syntax-invalid`. An explicit schema on that
wrapper did not resolve it. The starter now uses the existing standalone
`schema WireForm` entry point and the same wire operations. Browser builds and
STEP export succeed. The bundled language service emits the informational
`firmament-language-project-context-required` for this declaration document;
the geometry build returns zero diagnostics. No sibling runtime source was edited.

## Verification

- `npm test`: 224 tests, 46 files passed.
- `npm run build:fast`: TypeScript and optimized development bundle passed.
- Gallery browser suite: five passed on Vite, then five passed against the built
  development bundle served by preview. Covers independent scrolling, keyboard
  navigation, search, personal-group create/edit/remove/undo/reload, the Examples
  dialog, mobile overflow, and both Basic models opening and exporting STEP.
  Independent Aetheris CLI analysis confirms one enclosed-manifold body per export.
- Existing UI/branding browser suite: five passed, including delayed Vite refresh
  preamble, repeated reload, both themes, IntelliDraft axes, rotating knot,
  reduced motion and failed-logo fallback.
- Manual Edge use verified welcome rows, personal groups, opening Paperclip,
  its real shaded viewport, and narrow utility-dock carousel navigation.
- `git diff --check`: passed.

`npm run build` stops at the existing SDK gate because the local linked package
has no production AOT runtime. Production AOT packaging is unqualified here.
Optional AI-author backend requests were unavailable during preview tests; the
local examples and groups do not require that backend. Community discovery and
saved cloud projects retain their existing behavior.

Evidence remains under ignored `artifacts/local/gallery/`: section screenshots,
mobile and dialog captures, source/STEP downloads, workspace screenshots and
browser traces. Logs are adjacent `gallery-*.log` files under `artifacts/local/`.

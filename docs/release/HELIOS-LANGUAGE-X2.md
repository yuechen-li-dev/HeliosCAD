# Helios language intelligence X2

Helios now asks the Aetheris Web/WASM language service for completion, semantic tokens, diagnostics, hover, definition, and formatting. Monaco is the editing surface. The page-thread language runtime uses the installed local `@aetheris/cad` SDK; the Worker still owns geometry builds. Responses carry a source revision and stale results are discarded.

The editor uses a Helios Mars/Sirius Monaco theme with green and gold token colors, matching selection, scrollbar, hover, and diagnostic colors. Inter remains the shell, Inspector, Output, and Error List face. Monaco code and terminal retain Consolas for aligned text; no separate Inter monospace asset was available. Word-based suggestions are disabled so Aetheris suggestions take priority.

At model scope, `Thr` suggests Thread. Inside Thread, `Maj` suggests MajorDiameter; bounded values such as Hand: Right are schema-owned. The existing compiled selector candidate path is retained. Live parser diagnostics appear after a 300 ms edit debounce in Monaco markers and the Error List; Build diagnostics remain authoritative for materialization. Clicking an Error List item opens its source position. Output records build/export events.

Format Document is available from the command palette and Monaco's formatting provider. The Aetheris formatter preserves comments and is idempotent for the tested simple model. Format-on-build remains off because semantic equivalence has not been demonstrated across the full language. Definition is limited to unique current-source named constructs. Hover covers representative schema constructs/fields. Text and other constructs without current parser/schema support are not advertised as working completions.

On local Chromium runs, measured Aetheris round trips were completion 2–24 ms, warm analysis 12–15 ms (first analysis 370–517 ms), hover 5 ms, and format 26–31 ms. These are UX test samples, not a benchmark distribution. The test used the UI at 2560×1440 with no geometry build for language requests. A fresh human without Firmament documentation has not yet been tested.

Evidence: [2560×1440 screenshot](HELIOS-LANGUAGE-X2-2560x1440.png). The Playwright X2 test exercises completion, invalid-field diagnostics and clearing, Error List navigation, hover, semantic colors, formatting idempotence, and Build. The existing MVP test covers Build, last-valid-model, and STEP export. Run locally with `npm run dev`; use `npm run sdk:install` after Aetheris Web Runtime changes.

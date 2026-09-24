# HELIOS-LX-X0 — Monaco and Firmament language experience

## Executive verdict: Meaningful progression

Helios now uses Monaco and the public Aetheris Web SDK for revision-tagged Helix and Loft field completion. It also offers compiler-qualified Box and Hole wall selectors from the last built model. An unfamiliar user completed Box, Hole, and palette Helix tasks in the running product. The full requested IDE experience is not yet achieved: the current SDK has no hover or live diagnostic endpoint, and a fresh user could not discover a simple Loft or field help from bare `Helix H {` / `Loft L {` source.

## Editor and authority

`SourcePanel` replaces the textarea with Monaco. The editor remains editable while the WASM runtime starts; Monaco handles cursor, selection, undo, brackets, indentation, and Ctrl+Space. Ctrl+Enter calls the current explicit rebuild handler. The app continues to own Ctrl+S, Ctrl+Shift+P, dirty state, explicit save, project reopen, and STEP export. This remains a single-document explorer and compiler.

`FirmamentLanguageClient` is the sole editor adapter to `Aetheris.language.complete(source, offset, { sourceName, sourceRevision })`. It converts returned fields, types, required flags, choices, and meanings into Monaco suggestions. It sends monotonically increasing revisions and discards a result after any intervening source edit. SDK exceptions leave the editor usable. There are no Helios field tables or alternate parser. Existing palette snippets remain the previously qualified local commands; this milestone adds no new hardcoded syntax.

Selector suggestions come from `ModelSession.selectorCandidates('Face')` on the last successful build. The SDK qualifies each candidate, and the adapter excludes `RuntimeOnly` and mismatched build revisions. The small `face(` editor trigger only decides when to display those candidates; it does not create or validate a selector. The selected geometry's candidate sorts first. Inspector Copy Selector, Reference Face, and Reference Hole Wall remain available. Go to Source now focuses Monaco at the SDK source range; cursor changes continue to select source-backed geometry. Browser correspondence tests cover Box and Hole picking, source navigation, and reference insertion.

Monaco markers and Problems consume the same build diagnostic array. On edit, old build diagnostics are cleared; Ctrl+Enter refreshes both from Aetheris compile/rebuild. A Problems click reveals and focuses the SDK range in Monaco. No geometry rebuild runs for typing or completion.

## Fresh UI qualification

The fresh tester used only the running Helios UI, Monaco, Inspector, and command palette, without repository source or internal docs.

| Task | Result | Friction |
| --- | --- | --- |
| 30 × 20 × 10 mm Box | Built, visible | Palette Insert Box initially failed from an unfocused caret; corrected in this change. |
| 10 mm through Hole | Built with zero diagnostics | Palette's default Hole is 6 mm; user edited it to 10 mm. |
| Helix | Palette example built as visible formed wire with zero diagnostics | Fresh user did not obtain fields from bare `Helix H {`; the qualified `WireForm ... Helix ...` context does offer fields. Cold Helix build took about 44 s. |
| Simple Loft | Not completed | No Loft palette command; bare `Loft L {` produced generic editor words, not LX fields. `Loft<Hollow> ...` has real SDK field completion in the browser test. |
| Deliberate syntax error | Rebuild showed one Problem and kept prior geometry; correcting source cleared it | No live diagnostic. The missing-brace error was a generic `firmament-v2-source-required` at line 1:1, not the missing brace. |
| Box face selector | Inspector showed `face(+Z)` and copy/reference actions | Editor automation also showed six qualified axis-face candidates. |
| Hole wall selector | Inspector showed `face(HeliosHole1.Wall)` and copy/reference actions | Editor automation showed `face(H.Wall)` for a compiled `H` Hole. |

## Browser and test evidence

- `npm run build`: passed. Production assets include a local Monaco worker; main JS was about 3.6 MB before compression. No CDN editor load is required.
- `npm test`: 26 passed, including a late revision response test. DOM unit tests mock Monaco; browser tests cover the real editor.
- Five Chrome Playwright tests passed against local Leviathan and Vite: LX completion/selector/diagnostic navigation, Box correspondence, Hole correspondence, Helix palette, and Telos save/reopen plus STEP export. The STEP test checked an `ISO-10303-21;` download larger than 1 KB.
- One local browser run measured editor visibility 204 ms after Create project; Helix SDK completion 12.3 ms; Loft SDK completion 2.4 ms; Helix popup visible 34.4 ms after Ctrl+Space; Box/Hole selector popup visible 8.0 ms; explicit invalid rebuild through Problem click and editor focus 103 ms. These are local samples, not service-level guarantees. Hover latency cannot be measured because the SDK has no hover operation.
- The fresh tester's cold Helix geometry compile took roughly 44 s. This is a geometry cost and separate from the measured field completion path.

## Specific remaining gaps

### Helios UX

- The source panel offers no in-product guide or palette action for a simple Loft. The fresh tester could not construct one from the available hints.
- Selector completion uses a lexical `face(` trigger because the SDK does not report expected selector context. Inspector assistance is usable, but the product cannot yet place selectors only where the compiler expects them.

### Aetheris LX contract and diagnostics

- `language.complete` returns fields only for Helix and Loft owner contexts. It returns no construct candidates or snippets at Model scope, so `Lo` and bare `Loft L {` did not teach the user a legal Loft form. Bare `Helix H {` outside its required owner also returned no useful fields.
- No Box or Hole field metadata is returned by the current LX service. The palette provides their existing qualified snippets, but field discovery cannot come from LX yet.
- The Web SDK has no `hover`, `diagnose`, symbol, or definition operation. Build diagnostics therefore appear only after explicit rebuild. The observed missing-brace diagnostic lacked a useful source range.
- `selectorCandidates()` is tied to compiled geometry. The Web SDK has no source-context selector request for an incomplete draft. Helios displays candidates from the last build and labels them accordingly.
- The Web SDK's qualified transport executes WASM in the page. The measured LX calls were short, but the 44 s cold Helix build shows that long geometry operations can still stall interaction; Worker transport remains unavailable in this SDK.

The next upstream work should be bounded to the gaps observed here: discoverable legal Helix/Loft entry forms, Box/Hole field metadata needed for the fresh tasks, a light live diagnostic operation with accurate ranges, and selector-context metadata. Hover may follow when an authoring task demonstrates the missing information; no broader Feature/Concept schema expansion is justified by this test.

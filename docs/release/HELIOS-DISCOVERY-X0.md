# HELIOS-DISCOVERY-X0 — gallery first local release

## Verdict

**Meaningful progression.** An anonymous visitor can browse the root gallery, open a model, read Firmament source, sign in on Fork, and arrive in the real editor with an independent Telos project. Owners can publish a saved, built project; Leviathan serves its pinned revision, source, and precomputed PNG, and another account can fork it. The end-to-end browser and server tests prove those paths.

The full seven-part Cartesian lamp is a STEP-backed reference in Discover, with its two source files and exact AP242 artifact available anonymously. It is not offered as a one-click full-assembly fork. Its `LoftFile<"lamp-shade-loft.firmament">` depends on a second source document, while Telos projects and the Helios editor currently save one source string. The browser Aetheris assembly pipeline resolves `LoftFile` from a filesystem path, so pretending the pasted assembly is buildable as a single Helios project would be misleading. The shade itself builds in the browser and is forkable. This is the next product boundary for full-lamp editing.

## User flow and information architecture

- `/` — Discover. Public, searchable, responsive grid of precomputed previews. No authentication and no Aetheris geometry Worker.
- `/m/<id>` — model detail. Preview zoom, metadata, public Firmament source, Open in Helios/Fork on editable models. The Cartesian lamp detail exposes both source files and Download STEP, then links to its editable shade.
- `/projects` — My Projects. Requires Leviathan auth. New accounts return to a useful gallery after a Fork, and can reach this list from the top navigation.
- Editor — existing Helios Monaco/LX/Worker/Inspector/STEP path. Fork goes straight here. The back action returns to Discover; unsaved work still prompts before leaving.

For an anonymous Fork, the in-memory intent survives sign-in or registration in the same page and automatically creates the copy. Authentication is not requested for browsing or source inspection. An explicit new-project action remains in My Projects.

## Publication and security model

Leviathan's `HeliosPublications` query record stores a project ID, account ID, **published revision ID**, title, description, category, tags, creator display name, preview object key, visibility, and publication time. It does not duplicate source. The exact published source stays in Telos revision object storage, with SHA-256 checked on public reads and forks. PNGs are captured from the built Helios viewport at publication and stored through the existing object-store abstraction. A save creates a new private working revision; public reads continue using the published revision until explicit republish. Deleting the owning project hides its publication.

Public list/detail/preview routes return only Public publications. List responses omit project and account IDs and source. Detail returns source only for a Public publication. Project read and save routes remain account-scoped. Fork is authenticated and CSRF-protected, copies the pinned source into a new private project and revision in the caller's default Helios installation, and returns that project to open in the editor. Publish requires an Owner membership, an active Helios installation, a current saved revision, a readable source object, a PNG preview, and CSRF. The editor also requires a successful current build before it submits Publish. The server does not independently compile Firmament; a raw API client could submit a syntactically invalid saved source with a PNG. Server-side semantic qualification needs an Aetheris compilation boundary in Leviathan or a verifiable build artifact contract.

No public STEP is generated for user publications in X0. The canonical Cartesian lamp STEP is precomputed and downloadable. Editor STEP export remains available for forked/owned projects. The catalog is a deterministic checked-in starter collection; later publications come from the Leviathan API. Search filters loaded metadata locally; the grid reveals 12 cards at a time, while the current API returns the latest 100 publications.

## Aetheris asset provenance

- `src/discovery/sources/lamp-visible-intent.firmament` and `lamp-shade-loft.firmament` are copied from `Aetheris/fixtures/Canonical/ThreeDm/`.
- The lamp base, counterbore/chamfer, and rounded-opening sources are copied from `Aetheris/fixtures/Canonical/ThreeDm/` and `Aetheris/fixtures/Canonical/Features/` after zero-diagnostic browser builds.
- `public/models/lamp-visible-intent.step` is copied from `Aetheris/artifacts/local/`; SHA-256 is `1388CA985A1002E80A356F086B238A63FC9CD03FD7ED4C1755398BD7E9FCDCEF`, matching `Aetheris/docs/release/3DM-INTENT-X1.md`.
- `public/previews/lamp-visible-intent.png` is the user-provided Open Cascade screenshot of that STEP.
- The other seven PNG previews were captured from actual Helios browser Worker builds of Aetheris-owned Firmament sources. All seven had zero diagnostics. The shade took about 6.8 seconds cold in the local non-AOT browser run. The sensor-bracket source produced four diagnostics and the helix source exceeded 90 seconds, so neither was included as a gallery seed.

## Performance and visual review

In one local Chrome/Vite run, the eight-card gallery was visible 165 ms after navigation began. The development gallery JS bundle is about 249 kB before gzip (about 77.3 kB gzip); the editor is split into a separate lazy chunk. The gallery test observed no Worker, WASM, or Aetheris runtime requests before Fork. Cards use PNGs (about 39–98 kB each) and the browser loads them with native lazy loading. No per-card Firmament compilation occurs. The model detail uses a precomputed image with zoom; it does not yet provide independent orbit or a live engineering preview. Desktop, 390 px mobile, Mars, and Sirius were exercised locally; mobile had no horizontal overflow.

## Fresh-user friction observations

| Task | Result | Friction |
| --- | --- | --- |
| Find a model and see source | Anonymous Playwright path succeeded from `/` through model detail and View Source | One card click, one source click; no auth |
| Make a personal copy | Anonymous Fork prompted auth, then created a project and opened Monaco automatically | Registration fields are the only interruption |
| Publish a model | Saved Box built, preview captured, publication appeared in Discover | Owner must use the project-level Publish form |
| Full Cartesian lamp editing | Source and STEP are public; shade is editable | Full assembly needs multi-file Telos/editor and browser resource resolution |

These are automated browser paths, not independent fresh-human or fresh-agent timing studies. Their click path and visible states are recorded in `tests/discovery-x0.spec.ts`.

## Qualification

- `npm test`: 29/29 unit tests passed.
- `npm run build:fast`: passed. The editor remains a lazy chunk; Vite warns about its size.
- Leviathan server tests: 52/52 passed, including public/private visibility, pinned source, cross-account fork, and deletion hiding publication.
- Discovery browser tests: 4/4 passed, including the exact lamp STEP hash, anonymous auth-then-fork for both a bundled sample and a server publication, publish, and mobile Mars/Sirius.
- Full local Playwright run: 16/17 passed. The only failure was `worker-production-bundle.spec.ts`, which explicitly requires `dist/aetheris-runtime-aot/_framework`; this checkout had a development SDK bundle. Its separate production-bundle qualification remains required before public deployment. No public deployment was performed.

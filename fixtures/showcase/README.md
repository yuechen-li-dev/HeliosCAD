# Canonical showcase snapshots

These are intact Aetheris source documents, loaded lazily by `src/showcase/catalog.ts`. The Web SDK receives the project root and the complete source snapshot. Helios does not concatenate includes or parse Firmament.

Basic contains two Helios-owned starter sources: a 30 × 40 mm angle bracket with a 3 mm wall and 20 mm extrusion, and a 1 mm wire paperclip with four straights and three circular bends. The paperclip uses the same operations as Aetheris's canonical WireForm paperclip, authored through the standalone `schema WireForm` entry point supported by the bundled browser runtime. Both compile as exact solids and export enclosed STEP bodies. The original five showcase projects are grouped under Advanced. Personal groups store references to these examples, not copies of their source.

Refresh source with `node scripts/sync-showcase.mts` from HeliosCAD, with Aetheris in the sibling checkout. `provenance.json` records source-relative origins and byte hashes. Refresh and qualify the corresponding browser example after source changes; copying source is not compilation evidence.

The current gallery uses black-and-white SVG wireframes generated through the
existing Aetheris renderer. See `public/previews/showcase/wireframes/README.md`
for the regeneration command and `provenance.json` beside the SVGs for views,
cutaway boundaries, placed-body/edge counts and output hashes.

Earlier raster presentation assets remain available for documentation. Their
origins in the sibling Aetheris ignored artifact tree:

| Image | Real model render |
| --- | --- |
| atlas.png | artifacts/local/usd-industrial/atlas-hero.png |
| guitar.png | artifacts/local/guitar-x0/hero.png |
| house.png | artifacts/local/archviz-house-x0/hero.png |
| bolt.png | HeliosCAD artifacts/local/p4-03/bolt.png, cropped to its actual Telos viewport |
| bracket.png | HeliosCAD artifacts/local/p4-03/bracket-viewport.png |

Images are reduced to at most 960 × 640 pixels for shipping. Capture browser images with `npx playwright test --config playwright.showcase.config.ts tests/showcase-x0.spec.ts`, using the production AOT SDK for qualification. Browser captures take precedence as current display evidence. The ATLAS thumbnail shows its downstream USD presentation pose and finish; the source workspace opens the authored default assembly pose with neutral geometry. The guitar's Cycles sunburst presentation uses downstream shading; browser materials come from its authored appearance records. These thumbnails are real renders of the canonical models, not promises of identical browser lighting or procedural shading. No Blender projects, geometry dumps or per-run logs are shipped.

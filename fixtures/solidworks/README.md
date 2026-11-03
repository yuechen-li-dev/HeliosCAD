# SolidWorks part handoff specimen

This is a real SolidWorks 2026 SP4.0 AP214 export, produced through the local
agent bridge from a newly created annular extrusion. The initial 8 mm depth
was edited to 9 mm and rebuilt. Outer/inner diameters are 40/10 mm; SolidWorks
mass properties independently confirmed the volume recorded in provenance.

`solidworks-ap214.step` is the untouched vendor export. `part.step` is its
Aetheris `canon` result. `part.firmament` is the generated annotation-layer
root, pinned to the canonical asset. `provenance.json` records exact byte
hashes. These are test inputs; per-run exports and logs belong under
`artifacts/local/solidworks/`.

`node scripts/qualify-solidworks.mjs` exercises a running SolidWorks session
through the actual stdio MCP client and creates a separate test document.
`npx playwright test --config playwright.solidworks.config.ts` uses these
fixtures by default; set `HELIOS_SOLIDWORKS_ARCHIVE` to a fresh add-in export
to qualify its real generated workspace instead.

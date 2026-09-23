# SEMANTIC-CORRESPONDENCE-X1B — Hole identity and viewport trust

Verdict: **Meaningful progression**. Direct BRep display carries construction identity for Box faces and one simple through Hole wall, entry/exit loops, and rim edges. Browser picking and Go to Source use that identity. Hole Copy Selector is withheld because Firmament does not yet parse and resolve the corresponding source selector.

The viewport now uses actual tessellated BRep edge polylines, so triangle diagonals are not presented as semantic edges. TOP, FRONT, and RIGHT use orthographic cameras; ISO uses perspective. A placement resolver fix evaluates trimmed line endpoints at their true trim interval, restoring the full Box top face in native tessellation and browser display.

The Box browser witness picks `face(+Z)`, copies it, inserts it in PMI source, rebuilds, and checks named views and edge inspection. The Hole browser witness picks the inside wall, observes `Body.H` and `material:hole:Body.H:wall`, navigates to its compiler source span, selects the source declaration to recover its feature highlight, and repeats after diameter edit. Both browser tests pass. Native Box/Hole correspondence and STEP reimport tests pass.

The direct correspondence route is deliberately limited to a canonical Box and one simple through Hole. Multi-hole/composite and imported STEP routes do not claim source identity. Hole selector support requires a parser/binder/resolver round trip; no BRep or STEP index is formatted into authoring syntax.

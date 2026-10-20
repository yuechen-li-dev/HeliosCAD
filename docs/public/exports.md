# Export a model

Build your model, open **Export**, tick the formats you need, then choose
**Download**. One format downloads directly; several formats download together in
one ZIP. Files use the project root's name, including when a component source file
is open in the editor. The command palette's **Export model…** opens the same picker.

| Format | Part | Assembly | Scene |
| --- | --- | --- | --- |
| STEP AP242 | Yes | Yes | No |
| glTF / GLB | Yes | Yes | Yes |
| OpenUSD / USDA | Yes | Yes | Yes |
| STL | Qualified closed mesh | No | No |
| OBJ | Supported SurfaceMeshIR geometry | No | No |
| PDF, SVG, PPTX drawing | Supported dimensioned part families | No | No |

Unavailable formats remain visible with an explanation. A supported format can
still reject particular geometry; the compiler's message appears in Problems and
Output. If any selected export fails, no partial ZIP downloads. Uncheck that format
to download the others.

STEP contains the compiled exact engineering geometry and supported semantic PMI.
GLB and USDA contain static presentation geometry at the authored assembly pose,
with hierarchy and supported materials/cameras. They do not export the animation
currently playing, the viewport camera, Concept guides, edge overlays, or selection
highlights. GLB includes the existing millimetre/Z-up to metre/Y-up conversion;
USDA declares its units and axis. STL and OBJ use millimetres; STL has no unit field.

Automatic drawings currently cover rectangular plate/box stock with disjoint
circular Z-through holes. Other shapes fail with a precise drawing diagnostic.
The picker does not bypass this check or substitute reference-only sheets. Drawing
formats share the existing dimension plan and preserve supported AP242 PMI; missing
stock/position/angle tolerances, material and signoffs remain visibly unspecified.
A downloaded drawing is not manufacturing approval. To author those requirements,
use the [Aetheris drawing workflow](../../../Aetheris/docs/public/drawings.md).

If you edited the source, Export first rebuilds the project. A failed build prevents
exporting the retained last-good geometry as if it were the current source. Editing
while files are being prepared also discards that export; build and export again.

Exports run locally through `@aetheris/cad` in the browser's Aetheris worker. No
upload or server conversion is required. DXF and standalone JSON glTF are not
exposed; GLB is the supported glTF 2.0 download.

# Learn Firmament in Helios

Build a part while you learn. Open **Learn** in the header, or press **F1**, to browse this manual, the full Firmament language reference, and six guided lessons. Documentation is bundled with Helios and remains available without a documentation server.

## Your first part

1. Open [A first part](../../docs/public/learn/01-first-part.md) and choose **Practice in new tab**. Your current workspace stays open.
2. Helios opens the complete plate example in the Source editor and builds it with Aetheris. The **Tutorial** panel stays beside the viewport.
3. Drag in the viewport to orbit. Scroll to zoom. Press **F** outside the editor to fit the part, or use **Fit** above the viewport.
4. Change `diameter: 8mm` to `diameter: 12mm`. Press **Ctrl+Enter** (or **Cmd+Enter**) to build. Live red underlines check the source; a successful Build updates the geometry.
5. Use **Save source** to keep your work. Use **Export** to download the formats available for that model, including exact STEP AP242 and GLB where supported.

The guided checklist records your own progress on this device. Its build step is enabled only when the current source has a successful build. Other steps are self-checks: inspect the model and make the suggested edit before marking them complete. You can reset a lesson's checklist without changing its source.

## Six lessons

The [Firmament course](../../docs/public/learn/README.md) progresses from stock and holes through profiles, manufacturing features, reuse, PMI and checks, and assemblies with explicit interfaces. Each new practice workspace starts from the complete canonical example. Save your edited source before closing or reloading a practice tab; the checklist and the source are saved separately. Examples and reference pages follow Aetheris's current public manual.

The lessons also show CLI commands for validation, measurement and inspection. Run those commands in an installed Aetheris CLI. In Helios, use live diagnostics and **Build** for the editor loop. Code blocks labeled `sh` contain shell commands; blocks labeled `firmament` contain model source.

## Finding an answer

Search titles and page contents from **Learn**. Search terms are combined, so `hole counterbore` narrows the results. The contents rail jumps to headings within a page. Internal documentation links stay in the manual; source examples open in a source viewer where you can copy or download them. Examples that need companion files or imported geometry should be opened as a complete project, not pasted as isolated fragments.

Start with the [language reference](../../docs/public/reference/language/README.md) for syntax and fields, [modeling guides](../../docs/public/README.md#guides) for a particular feature, and [known issues](../../docs/public/reference/known-issues.md) for current boundaries. Experimental pages are marked as experimental. The compiler is the authority when it rejects a combination.

## Working in the editor

| Action | Shortcut |
|---|---|
| Learn and reference | F1 |
| Command palette | Ctrl+Shift+P / Cmd+Shift+P |
| Build | Ctrl+Enter / Cmd+Enter |
| Save | Ctrl+S / Cmd+S |
| Completion | Ctrl+Space |
| Format document | Shift+Alt+F |
| Next diagnostic | F8 |
| Go to definition | F12 |

Source is the model's authority. The graph is a structured editing view of that source, with explicit ports and Mates. See [graph modeling](graph-modeling.md), [IntelliDraft](intellidraft.md), [STEP and SolidWorks import](solidworks.md), and [export formats](exports.md) for the other Helios workflows.

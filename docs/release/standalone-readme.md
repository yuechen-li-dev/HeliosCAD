# Helios desktop preview

Helios is a CAD workspace for building parametric parts and assemblies with the
Aetheris kernel. Edit Firmament source or use the node graph, inspect the result
in 3D, and export engineering and presentation files. This preview runs locally
and opens your existing browser. It does not install another browser.

## Start

Extract the **entire** archive to a folder, then run `Helios.exe` on Windows or
`./Helios` from a terminal on Linux/macOS. A modern browser is required; Chrome
and Edge are the browser qualification targets for this preview. No .NET, Node,
database server, account registration, or API key is needed for modeling.

The launcher opens the example gallery at `http://127.0.0.1:4180`. Choose **New
part**, **New assembly**, or an example. **Open file** loads Firmament projects
and supported STEP parts. **Build** compiles source; a rejected edit keeps the
last valid model visible. **Save source** downloads your source or workspace.
**My projects** stores projects in this computer's local Helios database.
Saved projects currently support one source document. Use **Save workspace** to
retain projects containing includes or imported STEP assets.

**Export** offers STEP AP242, GLB, USDA, STL, OBJ, and PDF/SVG/PPTX drawings when
the compiled product supports them. Inspect dimensions and tolerances before
using an automatically generated drawing for manufacture.

## First part without code

1. Choose **New part**, keep **Box**, and enter its Size X/Y/Z. **Preview → Apply**.
2. Select the Body card and click **Add hole…**. Keep +Z for the top face, enter
   Center X/Y and Diameter, then **Preview → Apply**. Counterbored, countersunk
   and blind holes are beside the same action; blind termination has a depth input.
3. Select a hole row to edit its fields together with **Apply changes**. Choose
   **Chamfer…** or **Fillet…** to finish a supported boundary. **Field help**
   explains the compiler's fields. **+ Add** opens the full catalog.
4. Use **Export → STEP AP242 → Download selected format** and **Save source**.

**Discard edits** resets unapplied values. A rejected preview leaves source
unchanged. If applied fields fail to build, **Revert to last good** restores and
rebuilds the accepted source. Undo/Redo operate on complete edits. Some advanced
feature combinations remain unsupported; previews report their actual diagnostic.
Angular mold Draft is not currently a V2 graph feature.

## Save, stop, and restart

Use **Version Control** for browser-local checkpoints. Download working source
before quitting. Closing a browser tab does not stop the host: choose **Quit
Helios**, close the launcher window, or press Ctrl+C in its terminal. Opening
the launcher again reconnects to the existing host instead of starting another.
Quit the old host before switching to an updated bundle.

Local projects, host logs and identity keys live under:

- Windows: `%LOCALAPPDATA%\Aetheris\Helios`
- macOS: `~/Library/Application Support/Aetheris/Helios`
- Linux: `$XDG_DATA_HOME/Aetheris/Helios`, normally
  `~/.local/share/Aetheris/Helios`

The launcher prints the exact path. Checkpoints belong to the browser and
`http://127.0.0.1:4180` origin; changing browser, clearing site data, or changing
port does not migrate that history. Neither local projects nor checkpoints are
a cloud backup. Keep downloaded sources and your normal backups.

## Optional AI connections

AI Author is optional. Codex uses your installed Codex CLI and ChatGPT sign-in.
Claude Code, Claude Desktop Chat and Antigravity use explicit native MCP pairing
from the panel. Native-client setup and account access vary by client version;
they are not automatically installed or signed in by this bundle.

For provider API access, use **AI connection settings → Open configuration
folder** and edit `helios.toml`. Keys remain on this computer; API billing is
separate from chat subscriptions. See the public AI connections guide in the
HeliosCAD repository for configuration examples and native-client setup.

## Preview limits and troubleshooting

- This is an unsigned preview. Windows SmartScreen or macOS Gatekeeper may
  prompt or block execution. There is no installer or automatic updater.
- Browser-only presentation is intentional; there is no embedded native window
  and no bundled Chromium/WebView runtime. The launcher is a console process.
- The host binds only to IPv4 loopback. It is not a LAN server. AI credentials
  and modeling source stay local unless you explicitly send them to an AI
  provider/native agent or export/share files.
- Port 4180 must be free. To use another port, launch `Helios --port 4183`;
  keep using that port for the same browser history. `--data-dir <directory>`
  selects another local data directory. `--no-browser` is for automated testing;
  it does not grant an unauthenticated browser session.
- Keep every file beside the launcher. Do not run only the executable from
  inside an archive. If startup fails, consult `logs/helios.log` in the printed
  data directory. An occupied port is reported rather than silently changing
  your browser storage origin.
- Development terminal commands are not included in this production bundle.
  Native agent subscriptions and live provider accounts need separate setup;
  offline qualification does not certify those accounts.

Source and support: <https://github.com/yuechen-li-dev/HeliosCAD>.
`helios-bundle.json` records the exact source revisions; `FILES.json` inventories
the package. Helios is distributed under AGPL-3.0; dependency notices are in
`THIRD-PARTY-NOTICES.txt`.

# Helios standalone preview

Helios is a CAD workspace built on Aetheris. Make parametric parts and assemblies
with the node graph or Firmament source, inspect the result in 3D, and export
engineering files. This preview runs on your computer and opens your existing
browser. It does not install another Chromium runtime.

## Download and start

Choose the archive for **Windows x64**, **Linux x64**, or **macOS Apple Silicon**.
Extract the whole archive, then run `Helios.exe` on Windows or `./Helios` from a
terminal on Linux/macOS. No .NET SDK, Node, Docker, database server, registration,
or AI key is needed for local modeling.

The example gallery opens automatically. Choose **New part**, **New assembly**,
or an example; edit with the graph or source; select **Build**. **Open file**
loads source/workspaces and supported STEP parts. **Export** offers STEP AP242,
GLB, USDA, STL, OBJ and PDF/SVG/PPTX drawings according to the compiled model's
capabilities. Review generated drawings and their completeness notices before
using them for manufacture.

## Work locally

**My projects** saves projects on this computer. **Version Control** keeps
browser-local checkpoints, and **Save source** downloads portable source or a
workspace. Neither is an online backup. Download and back up your work.

The launcher keeps the browser address stable at `http://127.0.0.1:4180`, so the
same browser profile can find its checkpoints after a restart. Local projects
and diagnostic logs live outside the extracted installation. **Quit Helios**,
closing the launcher window, or Ctrl+C stops the host. Closing a browser tab
alone does not. Quit before starting an updated bundle.

AI Author is optional. It supports installed Codex, Claude Code, Claude Desktop
Chat and Antigravity connections, or provider API credentials in a local
`helios.toml`. Existing agents retain their own accounts and subscriptions.
Client setup, sign-in and account entitlement are separate from the package;
the preview does not install or sign into those clients for you.

## Known limits

- This is an unsigned preview, without an installer, native embedded window or
  automatic updater. SmartScreen or Gatekeeper may prompt or block execution.
- Modern Chrome/Edge is the primary browser qualification target. Other
  browsers and Linux musl/Alpine distributions are not covered by this preview.
- The host is loopback-only. Do not expose it as a LAN/public service. Port 4180
  must be free; an explicit `--port` override uses a different browser storage
  origin. There is no silent port change.
- Clearing browser storage removes checkpoints. Local projects do not sync
  with a hosted Helios account.
- Saved projects currently support one source document. Use **Save workspace**
  for multi-file projects and imported STEP assets.
- Live provider/subscription access depends on your native client and account;
  offline protocol tests do not certify a vendor account.
- Automated qualification drives the extracted executable with a test browser.
  OS default-browser association and download-security prompts remain manual
  checks; they are separate from the CAD and persistence qualification.

See [the local-use guide](../public/standalone.md),
[AI connection setup](../public/ai-connections.md), and the README inside the
archive. Packages include dependency notices, source-revision metadata, a file
inventory, and release checksums.

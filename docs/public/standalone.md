# Run Helios on your computer

The standalone preview combines Helios, its CAD browser runtime, and a local
Leviathan host. It opens your installed browser instead of installing another
Chromium runtime. No developer tools or cloud account are needed to model parts.

1. Download the archive for your platform from
   [Helios releases](https://github.com/yuechen-li-dev/HeliosCAD/releases).
2. Extract the whole archive. Run **Helios.exe** on Windows or `./Helios` from
   a terminal on Linux/macOS. Keep the companion files beside the launcher.
3. Choose **New part**, **New assembly**, or a gallery example. Use the graph or
   Firmament source, then **Build**. Open existing source/workspaces or supported
   STEP parts with **Open file**.
4. Use **Export** for the formats available on that model. **Save source**
   downloads source or a portable workspace. **My projects** stores projects in
   this computer's local database.
5. Save your work, then choose **Quit Helios**, close the launcher window, or
   press Ctrl+C. Closing a browser tab alone leaves the host running. Starting
   the launcher again opens the existing local host instead of duplicating it.

The host uses `http://127.0.0.1:4180` and is loopback-only. A launch capability
opens your local identity; there is no registration step. Keep this port stable:
browser checkpoints belong to that origin and browser profile. **Version
Control** checkpoints survive host restarts but are lost if browser site data is
cleared. Download source and maintain backups; checkpoints are not cloud saves.

The launcher prints its local data directory. Windows normally uses
`%LOCALAPPDATA%\Aetheris\Helios`; macOS uses
`~/Library/Application Support/Aetheris/Helios`; Linux uses
`$XDG_DATA_HOME/Aetheris/Helios` or `~/.local/share/Aetheris/Helios`.
These follow [.NET's platform application-data locations](https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/8.0/getfolderpath-unix).
The database, object storage,
identity keys, and `logs/helios.log` live there, outside the extracted package.
Updating the bundle does not erase them.

## Optional AI

Modeling works without AI. The local profile also enables **AI Author** with
installed native agent subscriptions or local provider keys in `helios.toml`.
Use **AI connection settings → Open configuration folder** to find that file.
See [AI connections](ai-connections.md) for the separate Codex, Claude Code,
Claude Desktop Chat, Antigravity and provider API setup paths. Helios does not
install those clients, sign in to them, or certify their account entitlements.

## Preview limits

The package is unsigned and has no installer or automatic updater. SmartScreen
or Gatekeeper may prompt. A modern Chrome/Edge browser is the primary browser
qualification target. There is no embedded native window, bundled browser, or
development terminal in this preview.

If port 4180 is occupied, Helios stops with a diagnostic instead of moving your
browser history to another origin. You can explicitly run `Helios --port 4183`
and keep that port for subsequent launches. `--data-dir <directory>` chooses a
different local data directory. `--no-browser` supports automated qualification;
an unauthenticated tab does not gain API access by visiting localhost.

The local server is not a LAN service. Keep the printed launch capability and
local data private; do not expose or proxy the host publicly. Provider requests
send the candidate project context to your chosen provider/native agent only
when you start an AI task. Local saved projects do not synchronize with a hosted
Helios account. Check the package README and release notes for platform-specific
qualification and limitations.

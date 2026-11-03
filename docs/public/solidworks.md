# SolidWorks → Aetheris Helios

Model a single solid part in SolidWorks, then use **Export to Aetheris Helios**
to open a local annotation workspace. The command uses the ordinary AP214
exporter. It does not call SolidWorks MBD, reconstruct feature history, or read
native files with a separate parser.

## Build and install

On Windows, install SolidWorks, the .NET SDK and .NET Framework 4.8 targeting
pack, and build the sibling Aetheris CLI. Start the local Helios application.
From this repository:

```powershell
./scripts/Build-SolidWorks.ps1 -HeliosUrl http://127.0.0.1:4173
```

The script locates the running SolidWorks installation's interop assemblies.
Alternatively pass `-SolidWorksInteropDir` pointing at its `api/redist` folder.
Use `-OutputDirectory` to stage an update in a separate directory when a running
SolidWorks session retains the previous managed DLL.
Use `-AetherisCli` to select an Aetheris executable or DLL. DLL execution needs
the corresponding .NET runtime. Output is under
`artifacts/local/solidworks/addin/`; keep that directory in place after registration.

1. As the normal SolidWorks user, run
   `./artifacts/local/solidworks/addin/Helios.SolidWorks.Cli.exe --register`.
2. Once, in an administrator PowerShell, run that executable with
   `--register-machine`. This installs this add-in's managed COM entries under
   `HKEY_LOCAL_MACHINE\Software\Classes` and its discovery entry under
   `HKEY_LOCAL_MACHINE\Software\SolidWorks\Addins`. It changes only Helios'
   CLSID/ProgID and discovery entries.
3. As the normal user, run the executable with `--load`. The **Aetheris Helios**
   command tab/menu contains **Export to Aetheris Helios**. Loading at Windows
   or SolidWorks startup is not configured.

The loader checks the actual connected add-in object; a zero `LoadAddIn` status
alone does not establish success. Full machine COM registration allowed loading
in the already-running SolidWorks session without a restart.
`addin.log` beside the DLL records construction, connection and connection errors.
Use `--registration-status` without administrator privileges to inspect the
machine discovery/COM entries and registered DLL paths. Builds before 0.1.7
installed only machine discovery; rerun the administrator step with a current
build to install the missing managed COM entry.

`helios-solidworks.json` beside the DLL contains `HeliosUrl`, `AetherisCli`, and
`ExportDirectory`. The default export directory is Documents/Aetheris Helios/Exports.
The Helios URL must be an HTTP origin at `127.0.0.1` with the port of your local
Helios application. Remote handoff targets are rejected. Start Helios before exporting.

Unload with `--unload` before updating the add-in. SolidWorks may retain managed
assemblies until it exits; save your work and restart SolidWorks before replacing
a loaded build. To uninstall, run `--unregister-machine` as administrator and
`--unregister` as the normal user. These remove only this add-in's registration.

## Export and annotate

Finish any sketch. The command requires exactly
one solid body. It exports the complete active configuration, restores the
previous selection and STEP export settings, and asks Aetheris to import and canonicalize the
geometry. Unsupported geometry is refused with the original AP214 retained for
inspection. No file is overwritten: each export gets its own directory.

The generated `.helios.zip` contains the untouched AP214, Aetheris's canonical
STEP, and a Firmament annotation root pinned to that canonical asset's SHA-256.
A two-minute, one-use loopback transfer opens it in Helios. The transfer accepts
only the configured Helios origin and an unpredictable capability URL; it closes
after delivery or timeout. There is no installed transfer service. If the browser
handoff fails, use **Open file** in Helios to open the saved workspace.

Pick a planar face and add a datum. Pick a cylindrical face to add a nominal
diameter and explicit upper/lower allowances. These requirements become part of
the Firmament layer; geometry stays unchanged. Choose **Export → STEP AP242**
and/or **GLB** to retain supported engineering semantics and 3D callouts. **Save
workspace** retains the original assets and annotations for reopening.
See [export formats and limits](exports.md).

Re-exporting after a SolidWorks geometry change creates a new workspace. Existing
face attachments are not guessed onto a new snapshot. Imported-geometry repair,
general dimension/GD&T authoring, assemblies and automatic PMI extraction from
SolidWorks are outside this initial command's scope. Supported geometry is
determined by Aetheris admission, not by the presence of a STEP file extension.

## Local tools for agents

The same executable provides a stdio MCP interface. It attaches to a running
SolidWorks session through its ordinary COM API. It also works without the
button's administrator registration. Example client configuration:

```json
{
  "mcpServers": {
    "solidworks-local": {
      "command": "C:\\path\\to\\Helios.SolidWorks.Cli.exe",
      "args": ["--stdio"]
    }
  }
}
```

| Tool | Behavior |
| --- | --- |
| `solidworks_inspect` | Active part/configuration, features, linear dimensions and volume |
| `solidworks_create_part` | New rectangle, circle or annulus sketch with a blind extrusion |
| `solidworks_set_dimension` | Edit an existing linear dimension and rebuild the current configuration |
| `solidworks_rebuild` | Rebuild without saving the native document |
| `solidworks_export` | Export the inspected part; optionally open local Helios |

Dimension edits require the document token and expected previous value returned
by inspection. A stale document/configuration or value is refused. A failed
rebuild attempts to restore the previous dimension and reports the failure.
The tools do not save over native documents, run arbitrary code, execute shell
commands, or offer a network command endpoint. Creation leaves a separate new
document open and preserves existing documents.

For command-line clients, `--call request.json` accepts the same operations:

```json
{"operation":"create_part","profile":"annulus","outerDiameterMm":40,"innerDiameterMm":10,"depthMm":8}
```

For interchange diagnostics, `--verify-step part.step` imports a STEP into a
separate temporary SolidWorks document, reports its solid count and volume, and
closes that test document without saving. It refuses a file already open by path.

The integration has no model-upload or telemetry path. Geometry conversion runs
locally. MCP results are supplied to the agent client you configure; a cloud AI
client may transmit those results according to its own settings. SolidWorks'
own cloud-connected behavior is independent of this add-in.

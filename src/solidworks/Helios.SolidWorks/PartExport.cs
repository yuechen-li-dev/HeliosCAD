using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Web.Script.Serialization;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace Helios.SolidWorks
{
    public sealed class PartExport
    {
        readonly ISldWorks sw;
        public PartExport(ISldWorks sw) { this.sw = sw; }
        public object Export(IModelDoc2 doc, Settings settings, bool open)
        {
            if (doc.GetType() != (int)swDocumentTypes_e.swDocPART) throw new InvalidOperationException("Only parts are supported.");
            var bodies = ((IPartDoc)doc).GetBodies2((int)swBodyType_e.swSolidBody, false) as object[];
            if (bodies == null || bodies.Length != 1) throw new InvalidOperationException("Export currently requires exactly one solid body.");
            if (doc.SketchManager.ActiveSketch != null) throw new InvalidOperationException("Finish the sketch before exporting the complete part.");
            if (!File.Exists(settings.AetherisCli)) throw new FileNotFoundException("Configure AetherisCli in helios-solidworks.json. The Aetheris importer is required for geometry qualification.", settings.AetherisCli);
            var directory = Path.Combine(settings.ExportDirectory, DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            var original = Path.Combine(directory, "solidworks-ap214.step"); var canonical = Path.Combine(directory, "part.step");
            var configuration = doc.ConfigurationManager.ActiveConfiguration.Name; var title = doc.GetTitle();
            int errors = 0, warnings = 0;
            var ap = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepAP);
            var geometry = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepExportPreference);
            var selections = (ISelectionMgr)doc.SelectionManager;
            selections.SuspendSelectionList(); // Export the complete part, then reinstate the user's selection.
            try
            {
                if (!sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepAP, 214)) throw new InvalidOperationException("SolidWorks refused AP214 export settings.");
                if (!sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepExportPreference, (int)swAcisOutputGeometryPreference_e.swAcisOutputAsSolidAndSurface)) throw new InvalidOperationException("SolidWorks refused solid/surface export settings.");
                if (!doc.Extension.SaveAs(original, 0, (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errors, ref warnings) || errors != 0)
                    throw new InvalidOperationException("SolidWorks STEP export failed: errors=" + errors + ", warnings=" + warnings);
            }
            finally
            {
                selections.ResumeSelectionList();
                sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepExportPreference, geometry);
                sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepAP, ap);
            }
            // Aetheris owns import/canonicalization. Never rewrite a vendor STEP header to bypass admission.
            var isDll = settings.AetherisCli.EndsWith(".dll", StringComparison.OrdinalIgnoreCase);
            var start = new ProcessStartInfo(isDll ? "dotnet" : settings.AetherisCli,
                (isDll ? Quote(settings.AetherisCli) + " " : "") + "canon " + Quote(original) + " --out " + Quote(canonical) + " --json")
                { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using (var child = Process.Start(start))
            {
                var output = child.StandardOutput.ReadToEndAsync(); var error = child.StandardError.ReadToEndAsync();
                if (!child.WaitForExit(120000)) { child.Kill(); throw new InvalidOperationException("Aetheris import timed out. Original AP214 is retained at " + original); }
                File.WriteAllText(Path.Combine(directory, "import-result.json"), output.GetAwaiter().GetResult(), new UTF8Encoding(false));
                if (child.ExitCode != 0) throw new InvalidOperationException("Aetheris refused this part. Original AP214 is retained at " + original + ". " + output.Result + " " + error.Result);
            }
            var text = File.ReadAllText(canonical); var source = "// Exported from SolidWorks; original geometry is retained in solidworks-ap214.step.\n"
                + "// Configuration: " + configuration.Replace("\r", " ").Replace("\n", " ") + "\n"
                + "Model SolidWorksPart {\n    units: mm\n    InlineStep part { path: \"part.step\" sha256: \"" + PartSession.Hash(text) + "\" }\n}\n";
            File.WriteAllText(Path.Combine(directory, "part.firmament"), source, new UTF8Encoding(false));
            var manifest = new JavaScriptSerializer().Serialize(new { schema = "helios/workspace/1", root = "part.firmament",
                source = new { application = "SolidWorks", version = sw.RevisionNumber(), configuration,
                    title, original = "solidworks-ap214.step", originalSha256 = PartSession.Hash(File.ReadAllBytes(original)), canonicalSha256 = PartSession.Hash(text), exportWarnings = warnings } });
            var archive = Path.Combine(directory, "part.helios.zip");
            using (var zip = ZipFile.Open(archive, ZipArchiveMode.Create))
            {
                using (var writer = new StreamWriter(zip.CreateEntry("helios-workspace.json").Open(), new UTF8Encoding(false))) writer.Write(manifest);
                foreach (var name in new[] { "part.firmament", "part.step", "solidworks-ap214.step" }) zip.CreateEntryFromFile(Path.Combine(directory, name), name);
            }
            string handoffUrl = null;
            if (open) { handoffUrl = LocalHandoff.Open(archive, settings.HeliosUrl); }
            return new { archive, original, canonical, source = Path.Combine(directory, "part.firmament"), handoffUrl, warnings, uploads = false };
        }
        static string Quote(string value) { if (value.Contains("\"")) throw new ArgumentException("Invalid path."); return "\"" + value + "\""; }
    }
}

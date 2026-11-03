using System;
using System.IO;
using System.Web.Script.Serialization;

namespace Helios.SolidWorks
{
    public sealed class Settings
    {
        public string HeliosUrl { get; set; } = "http://127.0.0.1:4173";
        public string AetherisCli { get; set; } = "aetheris/aetheris.exe";
        public string ExportDirectory { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Aetheris Helios", "Exports");

        public static Settings Load()
        {
            var directory = Path.GetDirectoryName(typeof(Settings).Assembly.Location);
            var path = Path.Combine(directory, "helios-solidworks.json");
            var settings = File.Exists(path) ? new JavaScriptSerializer().Deserialize<Settings>(File.ReadAllText(path)) : new Settings();
            Uri uri;
            if (!Uri.TryCreate(settings.HeliosUrl, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0)
                throw new InvalidOperationException("HeliosUrl must be a local http://127.0.0.1:PORT origin. Model handoffs to remote hosts are disabled.");
            settings.HeliosUrl = uri.GetLeftPart(UriPartial.Authority);
            settings.AetherisCli = Path.GetFullPath(Path.Combine(directory, settings.AetherisCli));
            settings.ExportDirectory = Path.GetFullPath(settings.ExportDirectory);
            return settings;
        }
    }
}

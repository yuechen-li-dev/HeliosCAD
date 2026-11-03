using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;

[assembly: ComVisible(false)]

namespace Helios.SolidWorks
{
    [ComVisible(true), Guid(Id), ProgId("Aetheris.Helios.SolidWorks"), ClassInterface(ClassInterfaceType.AutoDispatch)]
    public sealed class Addin : ISwAddin
    {
        public const string Id = "3B486C4A-7E2E-47A1-8FB9-4A4761094788";
        const int Group = 684201;
        ISldWorks sw; ICommandManager commands;
        public Addin() { Trace("COM instance created"); }
        static void Trace(string message)
        {
            try { File.AppendAllText(Path.Combine(Path.GetDirectoryName(typeof(Addin).Assembly.Location), "addin.log"), DateTime.UtcNow.ToString("O") + " " + message + System.Environment.NewLine); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        public bool ConnectToSW(object ThisSW, int Cookie)
        {
            try
            {
            Trace("ConnectToSW cookie=" + Cookie);
            sw = (ISldWorks)ThisSW; sw.SetAddinCallbackInfo2(0, this, Cookie); commands = sw.GetCommandManager(Cookie);
            var errors = 0;
            var group = commands.CreateCommandGroup2(Group, "Aetheris Helios", "Export a part locally to Aetheris Helios", "Aetheris Helios", -1, true, ref errors);
            group.AddCommandItem2("Export to Aetheris Helios", -1, "Export AP214 and open a local annotation workspace", "Export to Aetheris Helios", 0, nameof(ExportToHelios), nameof(EnableExport), 1,
                (int)(swCommandItemType_e.swMenuItem | swCommandItemType_e.swToolbarItem));
            group.HasMenu = true; group.HasToolbar = true; group.Activate();
            var existing = commands.GetCommandTab((int)swDocumentTypes_e.swDocPART, "Aetheris Helios");
            if (existing != null) commands.RemoveCommandTab(existing);
            var tab = commands.AddCommandTab((int)swDocumentTypes_e.swDocPART, "Aetheris Helios");
            var box = tab.AddCommandTabBox(); box.AddCommands(new[] { group.get_CommandID(0) }, new[] { (int)swCommandTabButtonTextDisplay_e.swCommandTabButton_TextBelow });
            Trace("Connected"); return true;
            }
            catch (Exception error)
            {
                Trace(error.ToString());
                return false;
            }
        }
        public bool DisconnectFromSW()
        {
            var tab = commands?.GetCommandTab((int)swDocumentTypes_e.swDocPART, "Aetheris Helios");
            if (tab != null) commands.RemoveCommandTab(tab);
            commands?.RemoveCommandGroup2(Group, true); commands = null; sw = null; return true;
        }
        public int EnableExport() => sw?.ActiveDoc is IModelDoc2 doc && doc.GetType() == (int)swDocumentTypes_e.swDocPART ? 1 : 0;
        public void ExportToHelios()
        {
            try { new PartExport(sw).Export(new PartSession(sw).Part(), Settings.Load(), true); }
            catch (Exception error) { MessageBox.Show(error.Message, "Export to Aetheris Helios", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
        public string Execute(string request) => new Automation(sw).Execute(request);
    }
}

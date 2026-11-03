using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using Helios.SolidWorks;

internal static class Program
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "--register") { Register(true); return 0; }
            if (args.Length == 1 && args[0] == "--unregister") { Register(false); return 0; }
            if (args.Length == 1 && args[0] == "--register-machine") { RegisterMachine(true); return 0; }
            if (args.Length == 1 && args[0] == "--unregister-machine") { RegisterMachine(false); return 0; }
            if (args.Length == 1 && args[0] == "--registration-status") { RegistrationStatus(); return 0; }
            if (args.Length == 1 && args[0] == "--stdio") { Mcp.Run(Invoke); LocalHandoff.WaitForPending(); return 0; }
            var sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
            if (args.Length == 2 && args[0] == "--verify-step")
            {
                var path = Path.GetFullPath(args[1]);
                if (sw.GetOpenDocumentByName(path) != null) throw new InvalidOperationException("The verification file is already open; leave the user's document untouched.");
                var errors = 0; var warnings = 0; IModelDoc2 imported = null;
                try
                {
                    imported = sw.LoadFile4(path, "r", sw.GetImportFileData(path), ref errors) as IModelDoc2;
                    if (imported == null || errors != 0) throw new InvalidOperationException("SolidWorks reimport failed: " + errors);
                    var bodies = ((IPartDoc)imported).GetBodies2((int)swBodyType_e.swSolidBody, false) as object[];
                    var mass = imported.Extension.CreateMassProperty() as IMassProperty;
                    if (mass == null || bodies?.Length != 1) throw new InvalidOperationException("The reimport is not one measurable solid body.");
                    Console.WriteLine(Json.Serialize(new { success = true, bodyCount = bodies.Length, volumeMm3 = mass.Volume * 1e9, warnings, consumer = "SolidWorks " + sw.RevisionNumber() }));
                    return 0;
                }
                finally { if (imported != null) sw.CloseDoc(imported.GetTitle()); }
            }
            if (args.Length == 1 && args[0] == "--unload") { Console.WriteLine(sw.UnloadAddIn(typeof(Addin).Assembly.Location)); return 0; }
            if (args.Length == 1 && args[0] == "--load")
            {
                var status = sw.LoadAddIn(typeof(Addin).Assembly.Location);
                if (sw.GetAddInObject("{" + Addin.Id + "}") == null)
                {
                    using (var discovery = Registry.LocalMachine.OpenSubKey("Software\\SolidWorks\\Addins\\{" + Addin.Id + "}"))
                    using (var machineCom = Registry.LocalMachine.OpenSubKey("Software\\Classes\\CLSID\\{" + Addin.Id + "}\\InprocServer32"))
                        throw new InvalidOperationException("SolidWorks did not connect the add-in (load status " + status + "). " +
                            (discovery == null || machineCom == null ? "Machine COM registration or discovery is incomplete. Run this build with --register-machine as administrator." :
                            "Both machine entries exist. Check registered DLL paths with --registration-status and inspect addin.log beside the DLL."));
                }
                Console.WriteLine(Json.Serialize(new { loadResult = status, connected = true })); return 0;
            }
            if (args.Length == 1 && args[0] == "--inspect-direct") { Console.WriteLine(Json.Serialize(new PartSession(sw).Inspect())); return 0; }
            if (args.Length == 2 && args[0] == "--call")
            {
                var response = Invoke(File.ReadAllText(args[1])); Console.WriteLine(response);
                LocalHandoff.WaitForPending();
                return Json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(response)["ok"] is bool ok && ok ? 0 : 1;
            }
            Console.Error.WriteLine("Helios.SolidWorks.Cli --register | --unregister | --register-machine | --unregister-machine | --registration-status | --load | --unload | --call request.json | --stdio\nAttach to a running SolidWorks session. No cloud connection or model upload is performed.");
            return 2;
        }
        catch (Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
    }
    static string Invoke(string request)
    {
        var sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
        return new Automation(sw).Execute(request);
    }
    static void Register(bool install)
    {
        RegisterCom(Registry.CurrentUser, install);
        if (!install) Registry.CurrentUser.DeleteSubKeyTree("Software\\SolidWorks\\Addins\\{" + Addin.Id + "}", false);
        else Console.WriteLine("COM registered for the current user. SolidWorks managed add-in loading also requires --register-machine as administrator. Startup loading is disabled.");
    }
    static void RegisterCom(RegistryKey hive, bool install)
    {
        var clsid = "{" + Addin.Id + "}"; const string progId = "Aetheris.Helios.SolidWorks";
        if (!install)
        {
            hive.DeleteSubKeyTree("Software\\Classes\\CLSID\\" + clsid, false);
            hive.DeleteSubKeyTree("Software\\Classes\\" + progId, false);
            return;
        }
        var type = typeof(Addin);
        using (var key = hive.CreateSubKey("Software\\Classes\\CLSID\\" + clsid))
        {
            key.SetValue("", "Aetheris Helios SolidWorks Add-in");
            using (var server = key.CreateSubKey("InprocServer32"))
            {
                server.SetValue("", "mscoree.dll"); server.SetValue("ThreadingModel", "Both");
                server.SetValue("Class", type.FullName); server.SetValue("Assembly", type.Assembly.FullName);
                server.SetValue("RuntimeVersion", "v4.0.30319"); server.SetValue("CodeBase", new Uri(type.Assembly.Location).AbsoluteUri);
                // Match RegAsm /codebase, including the versioned managed-server entry.
                using (var version = server.CreateSubKey(type.Assembly.GetName().Version.ToString()))
                {
                    version.SetValue("Class", type.FullName); version.SetValue("Assembly", type.Assembly.FullName);
                    version.SetValue("RuntimeVersion", "v4.0.30319"); version.SetValue("CodeBase", new Uri(type.Assembly.Location).AbsoluteUri);
                }
            }
            using (var prog = key.CreateSubKey("ProgId")) prog.SetValue("", progId);
            using (var categories = key.CreateSubKey("Implemented Categories\\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}")) { }
        }
        using (var key = hive.CreateSubKey("Software\\Classes\\" + progId + "\\CLSID")) key.SetValue("", clsid);
    }
    static void RegisterMachine(bool install)
    {
        var path = "Software\\SolidWorks\\Addins\\{" + Addin.Id + "}";
        RegisterCom(Registry.LocalMachine, install);
        if (!install) { Registry.LocalMachine.DeleteSubKeyTree(path, false); return; }
        using (var key = Registry.LocalMachine.CreateSubKey(path))
        {
            key.SetValue("", 0, RegistryValueKind.DWord); key.SetValue("Title", "Aetheris Helios");
            key.SetValue("Description", "Export parts locally to Aetheris Helios. No MBD or model upload.");
        }
        Console.WriteLine("SolidWorks machine COM registration and discovery installed. Run --load as the SolidWorks user. Startup loading is disabled.");
    }
    static void RegistrationStatus()
    {
        var clsid = "{" + Addin.Id + "}";
        using (var discovery = Registry.LocalMachine.OpenSubKey("Software\\SolidWorks\\Addins\\" + clsid))
        using (var machineCom = Registry.LocalMachine.OpenSubKey("Software\\Classes\\CLSID\\" + clsid + "\\InprocServer32"))
        using (var userCom = Registry.CurrentUser.OpenSubKey("Software\\Classes\\CLSID\\" + clsid + "\\InprocServer32"))
            Console.WriteLine(Json.Serialize(new { clsid, machineDiscovery = discovery != null, machineCom = machineCom != null,
                machineCodeBase = machineCom?.GetValue("CodeBase"), userCodeBase = userCom?.GetValue("CodeBase"),
                expectedCodeBase = new Uri(typeof(Addin).Assembly.Location).AbsoluteUri }));
    }
}

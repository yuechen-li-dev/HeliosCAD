using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using SolidWorks.Interop.sldworks;
namespace Helios.SolidWorks
{
    public sealed class Automation
    {
        readonly ISldWorks sw;
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
        public Automation(ISldWorks sw) { this.sw = sw; }
        public string Execute(string request)
        {
            try
            {
                var command = json.Deserialize<Dictionary<string, object>>(request);
                var session = new PartSession(sw); object result;
                switch (Text(command, "operation"))
                {
                    case "inspect": result = session.Inspect(); break;
                    case "create_part": result = session.Create(Text(command, "profile"), Number(command, "widthMm", 0), Number(command, "heightMm", 0), Number(command, "outerDiameterMm", 0), Number(command, "innerDiameterMm", 0), Number(command, "depthMm")); break;
                    case "set_dimension": result = session.SetDimension(Text(command, "documentToken"), Text(command, "name"), Number(command, "expectedValueMm"), Number(command, "valueMm")); break;
                    case "rebuild": if (!session.Require(Text(command, "documentToken")).EditRebuild3()) throw new InvalidOperationException("SolidWorks rebuild failed."); result = session.Inspect(); break;
                    case "export": result = new PartExport(sw).Export(session.Require(Text(command, "documentToken")), Settings.Load(), command.ContainsKey("openHelios") && command["openHelios"] is bool open && open); break;
                    default: throw new ArgumentException("Unknown operation. Allowed: inspect, create_part, set_dimension, rebuild, export.");
                }
                return json.Serialize(new { ok = true, result });
            }
            catch (Exception error) { return json.Serialize(new { ok = false, error = error.Message }); }
        }
        static string Text(Dictionary<string, object> fields, string name) => fields.TryGetValue(name, out var value) && value is string text && text.Length > 0 ? text : throw new ArgumentException("Missing " + name);
        static double Number(Dictionary<string, object> fields, string name, double? fallback = null) => fields.TryGetValue(name, out var value) && !(value is bool) && !(value is string) ? Convert.ToDouble(value) : fallback ?? throw new ArgumentException("Missing numeric " + name);
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace Helios.SolidWorks
{
    // All calls run synchronously on SolidWorks' COM apartment. No worker accesses a model.
    public sealed class PartSession
    {
        readonly ISldWorks sw;
        public PartSession(ISldWorks sw) { this.sw = sw; }
        public IModelDoc2 Part()
        {
            var doc = sw.ActiveDoc as IModelDoc2;
            if (doc == null || doc.GetType() != (int)swDocumentTypes_e.swDocPART) throw new InvalidOperationException("Open a SolidWorks part. Assemblies and drawings are not supported by this command.");
            return doc;
        }
        public static string Token(IModelDoc2 doc) => Hash(doc.GetTitle() + "\n" + doc.GetPathName() + "\n" + doc.ConfigurationManager.ActiveConfiguration.Name);
        public static string Hash(string text) => Hash(Encoding.UTF8.GetBytes(text));
        public static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2"))); }
        public IModelDoc2 Require(string token)
        {
            var doc = Part();
            if (Token(doc) != token) throw new InvalidOperationException("The active document/configuration changed. Inspect it again before editing or exporting.");
            return doc;
        }
        public object Inspect()
        {
            var doc = Part(); var features = new List<object>(); var dimensions = new List<object>();
            var names = new HashSet<string>();
            for (var feature = doc.FirstFeature() as IFeature; feature != null; feature = feature.GetNextFeature() as IFeature)
            {
                if (features.Count >= 1000) throw new InvalidOperationException("Feature inspection exceeds the 1,000-feature limit.");
                features.Add(new { name = feature.Name, kind = feature.GetTypeName2() });
                for (var display = feature.GetFirstDisplayDimension() as IDisplayDimension; display != null; display = display.GetNext5() as IDisplayDimension)
                {
                    var dimension = display.GetDimension2(0) as IDimension;
                    if (dimension == null || !names.Add(dimension.FullName)) continue;
                    dimensions.Add(new { name = dimension.FullName, type = dimension.GetType(), systemValue = dimension.SystemValue,
                        valueMm = dimension.GetType() == (int)swDimensionParamType_e.swDimensionParamTypeDoubleLinear ? (double?)(dimension.SystemValue * 1000) : null });
                }
            }
            var bodies = ((IPartDoc)doc).GetBodies2((int)swBodyType_e.swSolidBody, false) as object[];
            var mass = doc.Extension.CreateMassProperty() as IMassProperty;
            return new { documentToken = Token(doc), title = doc.GetTitle(), path = doc.GetPathName(), configuration = doc.ConfigurationManager.ActiveConfiguration.Name,
                modified = doc.GetSaveFlag(), selectedCount = ((ISelectionMgr)doc.SelectionManager).GetSelectedObjectCount2(-1), solidBodyCount = bodies?.Length ?? 0, volumeMm3 = mass == null ? (double?)null : mass.Volume * 1e9,
                features, dimensions, stepExport = new { protocol = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepAP), geometry = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepExportPreference) },
                solidWorksVersion = sw.RevisionNumber(), transport = "local-com", uploads = false };
        }
        public object Create(string profile, double width, double height, double outer, double inner, double depth)
        {
            if (!new[] { "rectangle", "circle", "annulus" }.Contains(profile)) throw new ArgumentException("Profile must be rectangle, circle or annulus.");
            Positive(depth, "depthMm");
            if (profile == "rectangle") { Positive(width, "widthMm"); Positive(height, "heightMm"); }
            else { Positive(outer, "outerDiameterMm"); if (profile == "annulus") { Positive(inner, "innerDiameterMm"); if (inner >= outer) throw new ArgumentException("Inner diameter must be smaller than outer diameter."); } }
            var doc = sw.NewPart() as IModelDoc2;
            if (doc == null) throw new InvalidOperationException("Set a default part template in SolidWorks before creating parts.");
            var plane = doc.FirstFeature() as IFeature;
            while (plane != null && plane.GetTypeName2() != "RefPlane") plane = plane.GetNextFeature() as IFeature;
            if (plane == null || !plane.Select2(false, 0)) throw new InvalidOperationException("The new part has no selectable reference plane.");
            doc.SketchManager.InsertSketch(true);
            if (profile == "rectangle") doc.SketchManager.CreateCornerRectangle(0, 0, 0, width / 1000, height / 1000, 0);
            else
            {
                doc.SketchManager.CreateCircleByRadius(0, 0, 0, outer / 2000);
                if (profile == "annulus") doc.SketchManager.CreateCircleByRadius(0, 0, 0, inner / 2000);
            }
            doc.SketchManager.InsertSketch(true);
            var feature = doc.FeatureManager.FeatureExtrusion2(true, false, false, 0, 0, depth / 1000, 0, false, false, false, false, 0, 0, false, false, false, false, true, true, true, 0, 0, false);
            if (feature == null) throw new InvalidOperationException("SolidWorks refused the extrusion. The new document remains open for inspection.");
            feature.Name = "HeliosExtrude";
            doc.ShowNamedView2("*Isometric", 7); doc.ViewZoomtofit2();
            return Inspect();
        }
        public object SetDimension(string token, string name, double expected, double value)
        {
            Positive(value, "valueMm");
            var doc = Require(token); var dimension = doc.Parameter(name) as IDimension;
            if (dimension == null || dimension.GetType() != (int)swDimensionParamType_e.swDimensionParamTypeDoubleLinear) throw new ArgumentException("Choose an existing linear dimension returned by inspect.");
            var previous = dimension.SystemValue;
            if (double.IsNaN(expected) || Math.Abs(previous * 1000 - expected) > 1e-6) throw new InvalidOperationException("The dimension changed. Inspect again before editing it.");
            var result = dimension.SetSystemValue3(value / 1000, (int)swSetValueInConfiguration_e.swSetValue_InThisConfiguration, null);
            if (result != (int)swSetValueReturnStatus_e.swSetValue_Successful) throw new InvalidOperationException("SolidWorks refused this dimension edit: " + result);
            if (!doc.EditRebuild3())
            {
                var restored = dimension.SetSystemValue3(previous, (int)swSetValueInConfiguration_e.swSetValue_InThisConfiguration, null) == (int)swSetValueReturnStatus_e.swSetValue_Successful;
                var rebuilt = doc.EditRebuild3();
                throw new InvalidOperationException(restored && rebuilt ? "Rebuild failed; the previous dimension value was restored. Inspect the model before continuing." : "Rebuild failed and restoring the previous state could not be confirmed. Inspect the model before continuing.");
            }
            return Inspect();
        }
        static void Positive(double value, string name) { if (double.IsNaN(value) || double.IsInfinity(value) || value <= 0 || value > 100000) throw new ArgumentException(name + " must be finite, positive and at most 100,000 mm."); }
    }
}

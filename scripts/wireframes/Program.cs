using System.Security.Cryptography;
using System.Text.Json;
using Aetheris.CLI;
using Aetheris.Kernel.Core.Math;
using Aetheris.Kernel.Core.Step242;
using Aetheris.Kernel.Core.Visualization;
using Aetheris.Kernel.Firmament.Assembly;
using Aetheris.Kernel.Firmament.Scene;

// Asset build only. Geometry, occurrence placement and SVG projection remain Aetheris-owned.
var helios = Path.GetFullPath(args.Length > 0 ? args[0] : ".");
var output = Path.Combine(helios, "public/previews/showcase/wireframes");
var evidence = Path.Combine(helios, "artifacts/local/showcase-wireframes");
Directory.CreateDirectory(output); Directory.CreateDirectory(evidence);
var records = new List<object>();
foreach (var (id, root, kind) in new[] {
    ("atlas", "atlas-industrial.firmament", "Assembly"),
    ("guitar", "guitar.firmasm", "Assembly"),
    ("house", "house.firmament", "Scene"),
    ("bracket", "bracket.firmament", "Part"),
    ("bolt", "hexbolt-showcase.firmament", "Part") })
{
    var source = Path.Combine(helios, "fixtures/showcase", id, root);
    var state = id == "atlas" ? new Dictionary<string, double> { ["Shoulder"] = -65, ["Elbow"] = 100, ["GripLeft"] = 4, ["GripRight"] = 4 } : new Dictionary<string, double>();
    var options = new BrepWireframeOptions(View: WireframeView.IsometricZUp, Density: 2, Width: 900, Height: 900, Background: "#f4f0e6",
        IsoLineColor: "#000000", BoundaryColor: "#000000", BoundaryWidth: 2.2, IsoLineWidth: 1.6, ShowLabel: false, Center: true);
    string svg; int edgeCount; int occurrences;
    if (kind == "Part")
    {
        var step = Path.Combine(evidence, id + ".step");
        if (CliRunner.Run(["build", source, "--output", step], Console.Out, Console.Error) != 0)
            throw new InvalidOperationException("Part compilation failed: " + id);
        var imported = Step242Importer.ImportBody(File.ReadAllText(step));
        if (!imported.IsSuccess || imported.Value is null) throw new InvalidOperationException("STEP reimport failed: " + id);
        var render = BrepWireframeSvgRenderer.Render(imported.Value, options);
        if (render.Evidence.UnsupportedCurveFamilies.Count > 0 || render.Evidence.UnsupportedSurfaceFamilies.Count > 0)
            throw new InvalidOperationException("Unsupported wireframe geometry: " + id);
        svg = render.Svg; edgeCount = render.Evidence.EdgeCount; occurrences = 1;
    }
    else
    {
        AssemblyDisplayMeshDocument display;
        if (kind == "Scene")
        {
            using var session = new FirmamentSceneSession();
            var result = session.CompileFile(source);
            if (!result.IsSuccess) throw new InvalidOperationException(string.Join("; ", result.Diagnostics.Select(d => d.Message)));
            // Explicit presentation cutaway; authored Room geometry is retained.
            display = SceneExport.Project(result.Scene!, ["main.ceiling", "main.southWall", "hall.ceiling"]);
        }
        else
        {
            var result = Path.GetExtension(root) == ".firmasm"
                ? new FirmamentAssemblyDocumentCompiler().CompileFile(source).Compilation
                : new AssemblyM1Pipeline().CompileFile(source);
            if (!result.IsSuccess) throw new InvalidOperationException(string.Join("; ", result.Diagnostics.Select(d => d.Message)));
            var pose = AssemblyKinematics.Evaluate(result.Ir!, state);
            if (!pose.IsSuccess) throw new InvalidOperationException(string.Join("; ", pose.Diagnostics.Select(d => d.Message)));
            display = AssemblyDisplayMeshExporter.Export(result, pose: pose);
        }
        var definitions = display.Definitions.ToDictionary(d => d.Id);
        var edges = new List<IReadOnlyList<Point3D>>();
        foreach (var occurrence in display.Occurrences.Where(o => o.DefinitionId is not null).OrderBy(o => o.Path, StringComparer.Ordinal))
        {
            var transform = Transform3D.FromRowMajor(occurrence.Transform);
            foreach (var edge in definitions[occurrence.DefinitionId!].Edges)
                edges.Add(edge.Points.Select(p => transform.Apply(new Point3D(p[0], p[1], p[2]))).ToArray());
        }
        svg = BrepWireframeSvgRenderer.RenderEdges(edges, options);
        edgeCount = edges.Count; occurrences = display.Occurrences.Count(o => o.DefinitionId is not null);
    }
    await File.WriteAllTextAsync(Path.Combine(output, id + ".svg"), svg);
    records.Add(new { id, source = "fixtures/showcase/" + id + "/" + root, kind,
        projection = kind == "Part" ? "exact-brep-edges-and-trimmed-isolines" : "placed-topology-edges",
        hiddenBoundaries = kind == "Scene" ? new[] { "main.ceiling", "main.southWall", "hall.ceiling" } : [],
        occurrences, edgeCount, state, background = options.Background, view = options.View.ToString(),
        sha256 = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(svg))).ToLowerInvariant() });
    Console.WriteLine($"{id}: {occurrences} placed bodies, {edgeCount} topology edges.");
}
await File.WriteAllTextAsync(Path.Combine(output, "provenance.json"), JsonSerializer.Serialize(records, new JsonSerializerOptions { WriteIndented = true }) + "\n");

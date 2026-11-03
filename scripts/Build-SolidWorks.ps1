param(
    [string]$SolidWorksInteropDir,
    [string]$AetherisCli,
    [string]$HeliosUrl = 'http://127.0.0.1:4173',
    [string]$ExportDirectory,
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
if (!$SolidWorksInteropDir) {
    $runningSolidWorks = Get-Process SLDWORKS -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($runningSolidWorks) { $SolidWorksInteropDir = Join-Path (Split-Path $runningSolidWorks.Path -Parent) 'api/redist' }
    else { $SolidWorksInteropDir = Join-Path $env:ProgramFiles 'SOLIDWORKS Corp/SOLIDWORKS/api/redist' }
}
if (!(Test-Path -LiteralPath (Join-Path $SolidWorksInteropDir 'SolidWorks.Interop.sldworks.dll'))) { throw 'Supply -SolidWorksInteropDir from the installed SolidWorks api/redist directory.' }
if (!$AetherisCli) { $AetherisCli = Join-Path (Split-Path $repository -Parent) 'Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll' }
$AetherisCli = (Resolve-Path -LiteralPath $AetherisCli).Path
$output = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $repository 'artifacts/local/solidworks/addin' }
& dotnet build (Join-Path $repository 'src/solidworks/Helios.SolidWorks.Cli') -c Release -m:1 -nr:false -p:UseSharedCompilation=false "-p:SolidWorksInteropDir=$SolidWorksInteropDir" -o $output
if ($LASTEXITCODE -ne 0) { throw 'SolidWorks add-in build failed.' }
if (!$ExportDirectory) { $ExportDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Aetheris Helios/Exports' }
@{ HeliosUrl = $HeliosUrl; AetherisCli = $AetherisCli; ExportDirectory = [IO.Path]::GetFullPath($ExportDirectory) } | ConvertTo-Json | Set-Content (Join-Path $output 'helios-solidworks.json') -Encoding utf8
Write-Output "Built add-in and local MCP/CLI client: $output"
Write-Output 'Run Helios.SolidWorks.Cli.exe --register as the SolidWorks user. The --register-machine COM/discovery step needs an administrator once. No startup hook is installed.'

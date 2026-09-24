param([switch]$SkipPublish)

$ErrorActionPreference = 'Stop'
$helios = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$aetheris = (Resolve-Path (Join-Path $helios '..\Aetheris')).Path
$localArtifacts = Join-Path $aetheris 'artifacts\local'
$perfArtifacts = Join-Path $localArtifacts 'web-perf'
New-Item -ItemType Directory -Force -Path $perfArtifacts | Out-Null

Push-Location $aetheris
try {
    dotnet build Aetheris.Web.Perf/Aetheris.Web.Perf.csproj -c Release --nologo -m:1
    if ($LASTEXITCODE -ne 0) { throw 'Native benchmark build failed.' }
    dotnet run --project Aetheris.Web.Perf/Aetheris.Web.Perf.csproj -c Release --no-build -- fixtures/firmament/web-perf-helix-1.firmament |
        Set-Content -LiteralPath (Join-Path $localArtifacts 'web-perf-native.jsonl')
    if ($LASTEXITCODE -ne 0) { throw 'Native benchmark failed.' }
    Push-Location Aetheris.Web.Runtime/sdk
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Current SDK build failed.' }
    } finally { Pop-Location }
    Push-Location $helios
    try {
        node scripts/test-web-perf.mjs --build
        if ($LASTEXITCODE -ne 0) { throw 'Current SDK Worker benchmark failed.' }
    } finally { Pop-Location }
    if (-not $SkipPublish) {
        foreach ($variant in @('current', 'aot')) {
            $aot = if ($variant -eq 'aot') { 'true' } else { 'false' }
            dotnet clean Aetheris.Web.Runtime/Aetheris.Web.Runtime.csproj -c Release --nologo -m:1 *> (Join-Path $perfArtifacts "$variant-clean.log")
            if ($LASTEXITCODE -ne 0) { throw "$variant clean failed." }
            $watch = [System.Diagnostics.Stopwatch]::StartNew()
            dotnet publish Aetheris.Web.Runtime/Aetheris.Web.Runtime.csproj -c Release "-p:RunAOTCompilation=$aot" -p:WasmStripILAfterAOT=false `
                -o (Join-Path $perfArtifacts "$variant-publish") --nologo -m:1 *> (Join-Path $perfArtifacts "$variant-publish.log")
            $watch.Stop()
            if ($LASTEXITCODE -ne 0) { throw "$variant publish failed; see $perfArtifacts/$variant-publish.log" }
            [pscustomobject]@{ variant = $variant; publishSeconds = $watch.Elapsed.TotalSeconds } |
                ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $perfArtifacts 'publish-times.jsonl')
        }
    }
} finally { Pop-Location }

Push-Location $helios
try {
    node scripts/measure-web-perf-assets.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Runtime asset accounting failed.' }
    node scripts/test-web-perf.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Browser benchmark failed.' }
} finally { Pop-Location }

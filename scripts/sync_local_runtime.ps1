param(
    [string]$RuntimeRoot = $(if ($env:PCAD_LOCAL_RUNTIME_ROOT) { $env:PCAD_LOCAL_RUNTIME_ROOT } else { "C:\dev\PCADLicenseServer-local" }),
    [switch]$InstallDependencies,
    [switch]$StartDevServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SourceRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)

if ($RuntimeRoot -like "$SourceRoot*") {
    throw "Runtime root must be outside the source workspace. Current source root: $SourceRoot"
}

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

$excludeDirectories = @(
    ".git",
    ".next",
    ".test-runtime",
    "node_modules",
    "web\\.next",
    "web\\node_modules",
    "web\\.test-dist",
    "web\\keys"
)

$excludeFiles = @(
    ".env.local",
    "web\\.env.local",
    "*.pem"
)

$robocopyArgs = @(
    $SourceRoot,
    $RuntimeRoot,
    "/MIR",
    "/R:2",
    "/W:2",
    "/XD"
) + $excludeDirectories + @(
    "/XF"
) + $excludeFiles

Write-Host "Syncing runtime copy to $RuntimeRoot"
& robocopy @robocopyArgs | Out-Host

if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed with exit code $LASTEXITCODE."
}

$webRuntimeRoot = Join-Path $RuntimeRoot "web"

if ($InstallDependencies) {
    Push-Location $webRuntimeRoot
    try {
        Write-Host "Installing web dependencies in $webRuntimeRoot"
        npm install
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "Runtime sync complete."
Write-Host "Next steps:"
Write-Host "  1. Add runtime-only files in the copy:"
Write-Host "     - $webRuntimeRoot\\.env.local"
Write-Host "     - $webRuntimeRoot\\keys\\access-snapshot.private.pem"
Write-Host "  2. Start the server from $webRuntimeRoot"
Write-Host "  3. Use the dashboard Dokaflex Control page for bootstrap and layout editing"

if ($StartDevServer) {
    Push-Location $webRuntimeRoot
    try {
        Write-Host "Starting Next.js dev server from $webRuntimeRoot"
        npm run dev
    } finally {
        Pop-Location
    }
}

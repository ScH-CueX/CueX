# Read-only discovery. No service, process, firewall, or package changes.
[CmdletBinding()]
param(
    [string]$LlamaServerPath,
    [string[]]$SearchRoot = @()
)
$ErrorActionPreference = 'Stop'

Write-Host 'Running llama.cpp / Worker candidates (inspect command lines before reuse):'
$processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(llama.*|.*worker.*)\.exe$' -or
    $_.CommandLine -match '(?i)llama-server|llama\.cpp|jev-score|\\Worker\\|/Worker/'
})
$processes | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine | Format-List | Out-Host

Write-Host 'Related Windows services (read-only):'
Get-CimInstance Win32_Service | Where-Object {
    $_.Name -match '(?i)llama|worker|cuex' -or $_.PathName -match '(?i)llama-server|jev-score|\\Worker\\'
} | Select-Object Name, State, ProcessId, PathName | Format-List | Out-Host

Write-Host 'TCP listeners (port ownership only; no probing or termination):'
Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess |
    Sort-Object LocalPort, OwningProcess | Format-Table -AutoSize | Out-Host

$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($LlamaServerPath)) {
    if (-not (Test-Path -LiteralPath $LlamaServerPath -PathType Leaf)) { throw "Missing executable: $LlamaServerPath" }
    $candidates += (Resolve-Path -LiteralPath $LlamaServerPath).Path
}
$candidates += @(Get-Command llama-server.exe -CommandType Application -ErrorAction SilentlyContinue | ForEach-Object Source)
$candidates += @($processes | Where-Object { $_.Name -ieq 'llama-server.exe' -and $_.ExecutablePath } | ForEach-Object ExecutablePath)
foreach ($directory in $SearchRoot) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Missing SearchRoot: $directory" }
    # Search only caller-selected roots. Do not assume an installation drive or crawl all disks.
    $candidates += @(Get-ChildItem -LiteralPath $directory -Filter 'llama-server.exe' -File -Recurse -ErrorAction Stop | ForEach-Object FullName)
}
$candidates = @($candidates | Sort-Object -Unique)
Write-Host 'Discovered llama-server executables:'
$candidates | ForEach-Object { Write-Host $_ }
if ($candidates.Count -eq 0) {
    Write-Host 'No executable discovered. Pass -SearchRoot for a known tools directory, or -LlamaServerPath.'
}
# Emit only paths on the success stream so Start-SystemOne.ps1 can consume discovery.
$candidates

# Read-only syntax and catalogue checks. Does not download models or launch an executable.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$failures = @()
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($parseError in $parseErrors) { $failures += "$($file.Name): $parseError" }
}
if ($failures.Count -gt 0) { throw ($failures -join [Environment]::NewLine) }
. (Join-Path $PSScriptRoot 'Common.ps1')
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'models.json') -Raw | ConvertFrom-Json
foreach ($key in $catalog.models.PSObject.Properties.Name) {
    $entry = Get-CueXModel -Model $key
    if ($entry.revision -notmatch '^[a-f0-9]{40}$' -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') {
        throw "Invalid pinned identifier for $key."
    }
    if ([long]$entry.bytes -le 0 -or $entry.file -notmatch '^[^\\/]+\.gguf$') { throw "Invalid file metadata for $key." }
    $expected = "https://huggingface.co/$($entry.repo)/resolve/$($entry.revision)/$($entry.file)"
    if ($entry.url -cne $expected) { throw "Unexpected source URL for $key." }
}
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$rejected = $false
try { Get-CueXCacheRoot -CacheRoot $repo | Out-Null } catch { $rejected = $true }
if (-not $rejected) { throw 'Repository cache path was not rejected.' }
Write-Host 'PASS: script syntax, pinned catalogue metadata and repository-cache guard. No network or process changes.'

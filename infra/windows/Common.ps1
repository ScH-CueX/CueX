# Shared path and catalogue helpers. Windows PowerShell 5.1 or PowerShell 7.
Set-StrictMode -Version Latest

function Get-CueXCacheRoot {
    param([string]$CacheRoot)
    if ([string]::IsNullOrWhiteSpace($CacheRoot)) {
        if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
            throw 'LOCALAPPDATA is unavailable. Supply -CacheRoot with a path outside the repository.'
        }
        $CacheRoot = Join-Path $env:LOCALAPPDATA 'CueX\cache'
    }
    $fullPath = [IO.Path]::GetFullPath($CacheRoot)
    $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd([char[]]"\/")
    if ($fullPath.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'CacheRoot must be outside the CueX repository.'
    }
    # Refuse redirected ancestors instead of allowing a junction to bypass the repository check.
    $ancestor = $fullPath
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "CacheRoot has a junction/symlink ancestor: $ancestor. Supply its real external path."
            }
        }
        $parent = [IO.Path]::GetDirectoryName($ancestor)
        if ($parent -eq $ancestor) { break }
        $ancestor = $parent
    }
    return $fullPath
}

function Get-CueXModel {
    param([Parameter(Mandatory = $true)][string]$Model)
    $catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'models.json') -Raw | ConvertFrom-Json
    $entry = $catalog.models.PSObject.Properties[$Model]
    if ($null -eq $entry) {
        throw "Unknown model '$Model'. Choose: $($catalog.models.PSObject.Properties.Name -join ', ')."
    }
    return $entry.Value
}

function Get-CueXModelPath {
    param([string]$CacheRoot, [Parameter(Mandatory = $true)]$Entry)
    $cache = Get-CueXCacheRoot -CacheRoot $CacheRoot
    $directory = Join-Path (Join-Path (Join-Path $cache 'models') ($Entry.repo.Replace('/', '--'))) $Entry.revision
    $directory = Get-CueXCacheRoot -CacheRoot $directory
    return Join-Path $directory $Entry.file
}

function Test-CueXModelFile {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)]$Entry)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    if ((Get-Item -LiteralPath $Path).Length -ne [long]$Entry.bytes) {
        throw "Unexpected model size: $Path. Move the file aside and download it again."
    }
    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if (-not $hash.Equals($Entry.sha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw "SHA256 mismatch: $Path. Move the file aside and download it again."
    }
    return $true
}

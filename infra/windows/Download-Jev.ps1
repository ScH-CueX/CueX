# Pinned Windows-only downloads. Does not change services or stop any process.
[CmdletBinding()]
param(
    [string]$Root = 'C:\cuex',
    [ValidateSet('q8','q4','adapter')][string]$Selection = 'adapter',
    [string]$Proxy,
    [ValidateSet('https://huggingface.co','https://hf-mirror.com')][string]$Mirror = 'https://huggingface.co'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Run this downloader on Windows. Do not download model files to the Mac.' }
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
New-Item -ItemType Directory -Path (Join-Path $rootFull 'logs') -Force | Out-Null
$manifest = Get-Content (Join-Path $PSScriptRoot 'jev-downloads.json') -Raw | ConvertFrom-Json
$items = @($manifest | Where-Object {
    if ($Selection -eq 'q8') { $_.file -eq 'Qwen3.5-9B-Q8_0.gguf' }
    elseif ($Selection -eq 'q4') { $_.file -eq 'Qwen3.5-9B-Q4_K_M.gguf' }
    else { $_.repo -ne 'unsloth/Qwen3.5-9B-GGUF' }
})
foreach ($entry in $items) {
    $destination = [IO.Path]::GetFullPath((Join-Path $rootFull $entry.target))
    if (-not $destination.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Target escaped Root.' }
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    $url = "$Mirror/$($entry.repo)/resolve/$($entry.revision)/$($entry.file)"
    $partial = "$destination.partial"
    if (-not (Test-Path -LiteralPath $destination)) {
        if ($entry.PSObject.Properties.Name -contains 'bytes') {
            $free = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($destination)).AvailableFreeSpace
            if ($free -lt [long]$entry.bytes + 64MB) { throw 'Insufficient free disk space.' }
        }
        Write-Output "Downloading $url"
        $proxyArgs = @()
        if (-not [string]::IsNullOrWhiteSpace($Proxy)) { $proxyArgs = @('--proxy',$Proxy) }
        & curl.exe @proxyArgs --disable --fail --location --proto '=https' --proto-redir '=https' --retry 5 --retry-delay 3 --continue-at - --output $partial $url
        if ($LASTEXITCODE -ne 0) { throw "curl failed: $LASTEXITCODE" }
    }
    $candidate = if(Test-Path -LiteralPath $destination){$destination}else{$partial}
    if ($entry.PSObject.Properties.Name -contains 'bytes') {
        if ((Get-Item $candidate).Length -ne [long]$entry.bytes) { throw "Size mismatch: $destination" }
    }
    $hash = (Get-FileHash $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($entry.PSObject.Properties.Name -contains 'sha256') {
        if ($hash -cne $entry.sha256) { throw "SHA256 mismatch: $destination" }
    }
    if ($candidate -ne $destination) { [IO.File]::Move($partial, $destination) }
    [pscustomobject]@{file=$destination;sha256=$hash;bytes=(Get-Item $destination).Length} | ConvertTo-Json -Compress
}
[IO.File]::WriteAllText((Join-Path $rootFull "logs\download-$Selection.done"), (Get-Date -Format o))

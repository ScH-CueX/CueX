[CmdletBinding()]
param(
    [ValidateSet('qwen35-4b-q4', 'qwen35-9b-q4', 'qwen35-9b-q8', 'jevstyle-v1-2b-q8')]
    [string]$Model = 'qwen35-9b-q4',
    [string]$CacheRoot,
    [switch]$AcceptLicense
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$entry = Get-CueXModel -Model $Model
$destination = Get-CueXModelPath -CacheRoot $CacheRoot -Entry $entry
Write-Host "Model card: $($entry.cardUrl)"
if (-not $AcceptLicense) {
    throw 'Review the model card, weight licence and training-data terms, then pass -AcceptLicense.'
}
if (Test-CueXModelFile -Path $destination -Entry $entry) {
    Write-Host 'Existing file matches the pinned size and SHA256.'
    $destination
    return
}
$directory = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$driveRoot = [IO.Path]::GetPathRoot($directory)
$drive = [IO.DriveInfo]::new($driveRoot)
$required = [long]$entry.bytes + 64MB
if ($drive.AvailableFreeSpace -lt $required) {
    throw "Insufficient space on $driveRoot. Need at least $required free bytes."
}
$partial = $destination + '.' + [guid]::NewGuid().ToString('N') + '.partial'
Write-Host "Downloading $($entry.bytes) bytes to $destination"
Write-Host "Pinned URL: $($entry.url)"
$oldProtocol = [Net.ServicePointManager]::SecurityProtocol
try {
    $curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($null -ne $curl) {
        & $curl.Source --disable --fail --location --proto '=https' --proto-redir '=https' --retry 2 --output $partial $entry.url
        if ($LASTEXITCODE -ne 0) { throw "curl failed with exit code $LASTEXITCODE." }
    } else {
        [Net.ServicePointManager]::SecurityProtocol = $oldProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $entry.url -OutFile $partial -UseBasicParsing
    }
    if (-not (Test-CueXModelFile -Path $partial -Entry $entry)) { throw 'No downloaded file.' }
    # Move without overwrite. A simultaneous download cannot replace an existing cache file.
    [IO.File]::Move($partial, $destination)
    Write-Host 'Size and SHA256 verified.'
    $destination
} finally {
    [Net.ServicePointManager]::SecurityProtocol = $oldProtocol
    # Only this invocation's uniquely named partial file may be removed.
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
}

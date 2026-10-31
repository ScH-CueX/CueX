[CmdletBinding()]
param(
    [string]$LlamaServerPath,
    [string[]]$SearchRoot = @(),
    [ValidateSet('qwen35-4b-q4', 'qwen35-9b-q4', 'qwen35-9b-q8', 'jevstyle-v1-2b-q8')]
    [string]$Model = 'qwen35-9b-q4',
    [string]$CacheRoot,
    [ValidateRange(0, 65535)][int]$Port = 0,
    [ValidateRange(512, 32768)][int]$ContextPerSlot = 4096,
    [ValidateRange(1, 999)][int]$GpuLayers = 99,
    [ValidatePattern('^Vulkan[0-9]+$')][string]$Device = 'Vulkan0'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')

# Discover existing Worker/llama.cpp processes and ports first. Never stop or reuse them implicitly.
$candidates = @(& (Join-Path $PSScriptRoot 'Inspect-SystemOne.ps1') -LlamaServerPath $LlamaServerPath -SearchRoot $SearchRoot)
if ([string]::IsNullOrWhiteSpace($LlamaServerPath)) {
    if ($candidates.Count -ne 1) { throw 'Select one discovered executable with -LlamaServerPath.' }
    $LlamaServerPath = $candidates[0]
}
$server = (Resolve-Path -LiteralPath $LlamaServerPath).Path
if ([IO.Path]::GetFileName($server) -ine 'llama-server.exe') { throw 'LlamaServerPath must name llama-server.exe.' }

$entry = Get-CueXModel -Model $Model
$modelPath = Get-CueXModelPath -CacheRoot $CacheRoot -Entry $entry
if (-not (Test-CueXModelFile -Path $modelPath -Entry $entry)) {
    throw "Model missing. Run Download-Model.ps1 -Model $Model first."
}
function Read-LlamaMetadata {
    param([Parameter(Mandatory = $true)][string]$Flag)
    # PowerShell 5.1 can wrap native stderr as an ErrorRecord, even for successful device reports.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $text = (& $server $Flag 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($code -ne 0) { throw "llama-server $Flag failed with exit code $code. $text" }
    return $text
}
Write-Host 'Existing executable version:'
Write-Host (Read-LlamaMetadata -Flag '--version')
$helpText = Read-LlamaMetadata -Flag '--help'
$requiredFlags = @('--host', '--port', '--model', '--parallel', '--cont-batching', '--ctx-size', '--device', '--list-devices', '--n-gpu-layers', '--alias', '--no-webui')
if ($entry.promptFormat -eq 'qwen35') { $requiredFlags += @('--jinja', '--reasoning-budget') }
foreach ($flag in $requiredFlags) {
    if (-not $helpText.Contains($flag)) { throw "This llama.cpp build lacks $flag. Select a current Vulkan build; no installation was changed." }
}
$deviceText = Read-LlamaMetadata -Flag '--list-devices'
Write-Host $deviceText
if ($deviceText -notmatch ('(?m)^\s*' + [regex]::Escape($Device) + ':')) {
    throw "Device $Device was not listed. Select a Vulkan build and an available Vulkan device."
}

# A loopback bind tests the explicit port or asks Windows for a free ephemeral port.
# The probe is released just before launch. If another process wins the race, llama-server fails; nobody is stopped.
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$probe.Server.ExclusiveAddressUse = $true
try {
    $probe.Start()
    $selectedPort = ([Net.IPEndPoint]$probe.LocalEndpoint).Port
} catch {
    throw "Port $Port cannot bind on localhost. Choose another port; existing listeners are unchanged. $($_.Exception.Message)"
} finally {
    $probe.Stop()
}
$contextTotal = $ContextPerSlot * 4
$serverArguments = @(
    '--model', $modelPath,
    '--host', '127.0.0.1', '--port', $selectedPort.ToString(),
    '--parallel', '4', '--cont-batching',
    '--ctx-size', $contextTotal.ToString(),
    '--device', $Device, '--n-gpu-layers', $GpuLayers.ToString(),
    '--alias', $Model, '--no-webui'
)
if ($entry.promptFormat -eq 'qwen35') { $serverArguments += @('--jinja', '--reasoning-budget', '0') }
Write-Host "System 1 URL: http://127.0.0.1:$selectedPort"
Write-Host "Health URL: http://127.0.0.1:$selectedPort/health"
Write-Host "Prompt format: $($entry.promptFormat). Context: $ContextPerSlot tokens per slot ($contextTotal total)."
Write-Host 'Starting a new foreground process. Ctrl+C stops this invocation; no other process is managed.'
& $server @serverArguments
if ($LASTEXITCODE -ne 0) { throw "llama-server exited with code $LASTEXITCODE." }

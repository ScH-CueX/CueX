# Start only a new, isolated CueX process. Never stop a listener or mutate a service.
[CmdletBinding()]
param(
    [string]$Root = 'C:\cuex',
    [ValidateSet('Q8_0','Q4_K_M')][string]$Quant = 'Q8_0',
    [ValidateRange(1,65535)][int]$Port = 18080,
    [ValidateRange(512,32768)][int]$ContextPerSlot = 4096
)
$ErrorActionPreference = 'Stop'
$server = Join-Path $Root 'runtime\llama-server.exe'
$model = Join-Path $Root "models\Qwen3.5-9B-$Quant.gguf"
$lora = Join-Path $Root 'adapter_vllm\JEV-9B-lora-f16.gguf'
foreach ($path in @($server,$model,$lora)) { if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw "Missing $path"} }
$metadata = Get-Content (Join-Path $PSScriptRoot 'jev-downloads.json') -Raw | ConvertFrom-Json
$entry = $metadata | Where-Object file -eq "Qwen3.5-9B-$Quant.gguf"
if ((Get-Item $model).Length -ne [long]$entry.bytes) { throw 'Model size mismatch.' }
if ((Get-FileHash $model -Algorithm SHA256).Hash -ine $entry.sha256) { throw 'Model SHA256 mismatch.' }
$helpText = (& $server --help 2>&1 | Out-String)
foreach ($flag in @('--lora-init-without-apply','--jinja','--parallel','--cont-batching')) { if(-not $helpText.Contains($flag)){throw "Runtime lacks $flag"} }
$devices = (& $server --list-devices 2>&1 | Out-String)
if($devices -notmatch '(?m)^\s*Vulkan0:'){throw 'Vulkan0 unavailable.'}
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
$probe.Server.ExclusiveAddressUse=$true
try { $probe.Start() } finally { $probe.Stop() }
$arguments = @('--model',$model,'--host','127.0.0.1','--port',"$Port",'--parallel','4','--cont-batching','--ctx-size',"$($ContextPerSlot*4)",'--device','Vulkan0','--n-gpu-layers','99','--lora',$lora,'--lora-init-without-apply','--jinja','--reasoning-budget','0','--alias',"qwen35-9b-$Quant-jev",'--no-webui')
# CIM Create launches outside the SSH child job. Redirect inside a dedicated shell.
$quoted = $arguments | ForEach-Object { "'" + $_.Replace("'","''") + "'" }
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$log=Join-Path $Root "logs\server-$Quant-$stamp.log"
$command = "& '$server' " + ($quoted -join ' ') + " *> '$log'"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="pwsh -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand $encoded";CurrentDirectory=$Root}
if($result.ReturnValue -ne 0){throw "Create failed: $($result.ReturnValue)"}
$record=[pscustomobject]@{launcherPid=$result.ProcessId;server=$server;model=$model;lora=$lora;arguments=$arguments;command=$command;log=$log;url="http://127.0.0.1:$Port";createdAt=(Get-Date -Format o)}
$record | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Root 'logs\server-current.json')
$record | ConvertTo-Json -Depth 5

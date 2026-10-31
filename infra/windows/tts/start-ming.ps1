param([string]$Root = 'E:\CueX-TTS')
$ErrorActionPreference = 'Stop'
$health = 'http://127.0.0.1:18666/health'
try {
  $status = Invoke-RestMethod $health -TimeoutSec 2
  if ($status.model -eq 'Ming-3.0-tts-0.5b' -and $status.ok) {
    Write-Output 'CueX Ming TTS is already ready.'
    exit 0
  }
  throw 'Port 18666 belongs to another service.'
} catch [System.Net.WebException] {}
if (Get-NetTCPConnection -LocalPort 18666 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 18666 is in use; no process was stopped.'
}
$pidFile = Join-Path $Root 'service.pid'
if (Test-Path $pidFile) {
  $existingId = [int](Get-Content $pidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$existingId"
  if ($existing -and $existing.CommandLine -like '*serve_ming.py*') {
    Write-Output 'CueX Ming TTS is still starting; inspect the logs.'
    exit 0
  }
}
if ($Root -match '["\r\n]') { throw 'Invalid deployment path.' }
# A WMI child survives the SSH session; Start-Process inherits its closing job.
$command = 'cmd.exe /d /s /c "set "CUEX_TTS_ROOT={0}" && "{0}\.venv\Scripts\python.exe" -u "{0}\serve_ming.py" 1>"{0}\logs\service.out.log" 2>"{0}\logs\service.err.log""' -f $Root
$process = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; CurrentDirectory = $Root }
if ($process.ReturnValue -ne 0) { throw "Service start failed: $($process.ReturnValue)" }
$process.ProcessId | Set-Content $pidFile
Write-Output "Started CueX Ming TTS pid $($process.ProcessId). It will listen only on localhost after model warmup."

# Stock sherpa-onnx 2.0.1 C++ streaming server, detached from the SSH session.
[CmdletBinding()]
param(
    [ValidateSet('xasr', 'zh')][string]$Model = 'zh',
    [int]$Threads = 4,
    [switch]$Hotwords,
    [switch]$Restart
)
$ErrorActionPreference = 'Stop'
$Root = 'C:\cuex\asr'
$exe = Join-Path $Root 'sherpa-onnx-v2.0.1-win-x64-static-MT-Release-no-tts\bin\sherpa-onnx-online-websocket-server.exe'
$models = @{
    xasr = 'sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05'
    zh = 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'
}
$modelDir = Join-Path $Root $models[$Model]
$statePath = Join-Path $Root 'server.json'
if (!(Test-Path $exe)) { throw 'Run install.ps1 first.' }
if ($Threads -lt 1 -or $Threads -gt 12) { throw 'Threads must be between 1 and 12.' }
if (Test-Path $statePath) {
    $state = Get-Content $statePath -Raw | ConvertFrom-Json -DateKind String
    $owned = Get-Process -Id $state.serverPid -ErrorAction SilentlyContinue
    if ($owned) {
        if ($owned.Path -ne $exe -or $owned.StartTime.ToUniversalTime().ToString('o') -ne $state.startedAt) {
            throw 'Recorded process identity changed. Refusing to stop it.'
        }
        if (!$Restart) {
            if ($state.model -ne $Model -or [bool]$state.hotwords -ne [bool]$Hotwords) { throw 'A different model or decoding mode is running. Pass -Restart to switch.' }
            Write-Output "Already running: PID $($owned.Id), model $Model"
            return
        }
        Stop-Process -Id $owned.Id
        $owned.WaitForExit()
    }
}
if (Get-NetTCPConnection -State Listen -LocalPort 6006 -ErrorAction SilentlyContinue) { throw 'Port 6006 is occupied. No process was changed.' }
function ModelFile([string]$Pattern) {
    $files = @(Get-ChildItem -Path $modelDir -Filter $Pattern | Sort-Object Name)
    $pick = @($files | Where-Object Name -Match 'int8')[0]
    if (!$pick) { $pick = $files[0] }
    if (!$pick) { throw "Missing $Pattern in $modelDir" }
    return $pick.FullName
}
$argsList = @(
    '--port=6006', '--provider=cpu', "--num-threads=$Threads", '--num-work-threads=1',
    '--max-batch-size=1', '--loop-interval-ms=10', '--decoding-method=greedy_search',
    '--enable-endpoint=true', '--rule1-min-trailing-silence=2.4', '--rule2-min-trailing-silence=0.7',
    '--rule3-min-utterance-length=20', "--encoder=$(ModelFile 'encoder*.onnx')",
    "--decoder=$(ModelFile 'decoder*.onnx')", "--joiner=$(ModelFile 'joiner*.onnx')",
    "--tokens=$(Join-Path $modelDir 'tokens.txt')", "--log-file=$(Join-Path $Root 'server.log')"
)
# The upstream binary binds 0.0.0.0. The Mac uses the SSH forward to 127.0.0.1:6006.
# Win32_Process.Create starts outside the SSH job, so closing the SSH connection does not stop ASR.
if ($Hotwords) {
    $argsList = @($argsList | Where-Object { $_ -notlike '--decoding-method=*' })
    $argsList += @('--decoding-method=modified_beam_search', '--max-active-paths=4', '--hotwords-score=1.5', "--hotwords-file=$(Join-Path $Root 'hotwords.txt')")
    if ($Model -eq 'xasr') {
        $vocab = Join-Path $modelDir 'bpe.vocab'
        if (!(Test-Path $vocab)) { throw 'Export bpe.vocab with the official export_bpe_vocab.py before using X-ASR hotwords.' }
        $argsList += @('--modeling-unit=bpe', "--bpe-vocab=$vocab")
    } else {
        $argsList += '--modeling-unit=cjkchar'
    }
}
$hotwordsLiteral = if ($Hotwords) { '$true' } else { '$false' }
$quotedArgs = ($argsList | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ','
$launcher = @"
`$ErrorActionPreference = 'Stop'
`$p = Start-Process -FilePath '$exe' -ArgumentList @($quotedArgs) -WorkingDirectory '$Root' -WindowStyle Hidden -PassThru -RedirectStandardOutput '$Root\stdout.log' -RedirectStandardError '$Root\stderr.log'
@{serverPid=`$p.Id; model='$Model'; threads=$Threads; hotwords=$hotwordsLiteral; startedAt=`$p.StartTime.ToUniversalTime().ToString('o'); executable='$exe'} | ConvertTo-Json | Set-Content '$statePath'
`$p.WaitForExit()
exit `$p.ExitCode
"@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcher))
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "pwsh -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand $encoded"
    CurrentDirectory = $Root
}
if ($result.ReturnValue -ne 0) { throw "Detached launch failed: $($result.ReturnValue)" }
Write-Output "Launch requested: launcher PID $($result.ProcessId), model $Model. Check server.json and port 6006."

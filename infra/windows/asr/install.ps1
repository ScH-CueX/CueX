# Run with pwsh 7 from C:\cuex\asr. Downloads stay on Windows.
[CmdletBinding()]
param([string]$Root = 'C:\cuex\asr')
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root).TrimEnd('\') -ne 'C:\cuex\asr') { throw 'Use C:\cuex\asr for this demo deployment.' }
New-Item -ItemType Directory -Force $Root | Out-Null
$downloads = @(
    @{
        Name = 'sherpa-onnx-v2.0.1-win-x64-static-MT-Release-no-tts'
        Tag = 'v2.0.1'
        SHA256 = '8E3A59FDE5BE843058F158CB166222A9722C44EC0EA20589768A459E39A24A9C'
    },
    @{
        Name = 'sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05'
        Tag = 'asr-models'
        SHA256 = '14919F03B74D9001FC8F2689C2AB1EA42C436DB269E8C809144492F41612BFFF'
    },
    @{
        Name = 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'
        Tag = 'asr-models'
        SHA256 = '5A2832047EA1F97DD0DC595B816C230C4BAFAD65CFC0341FA57517CADC50AFD0'
    }
)
foreach ($item in $downloads) {
    $archive = Join-Path $Root ($item.Name + '.tar.bz2')
    if (!(Test-Path $archive)) {
        & curl.exe -fL --retry 2 --connect-timeout 20 "https://github.com/k2-fsa/sherpa-onnx/releases/download/$($item.Tag)/$($item.Name).tar.bz2" -o ($archive + '.partial')
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($item.Name)" }
        Move-Item ($archive + '.partial') $archive
    }
    if ((Get-FileHash -Algorithm SHA256 $archive).Hash -ne $item.SHA256) { throw "SHA256 mismatch: $archive" }
    if (!(Test-Path (Join-Path $Root $item.Name))) {
        & tar.exe -xf $archive -C $Root
        if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $archive" }
    }
    Write-Output "Installed $($item.Name)"
}

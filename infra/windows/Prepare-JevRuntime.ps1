[CmdletBinding()]
param([string]$Root='C:\cuex',[ValidateSet('Vulkan','CUDA')][string]$Backend='Vulkan',[switch]$DownloadsOnly,[switch]$ConverterOnly,[ValidateSet('Direct','GhProxy')][string]$GitHubTransport='Direct')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$env:UV_CACHE_DIR=Join-Path $Root 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR=Join-Path $Root 'uv-python'
if($GitHubTransport -eq 'GhProxy'){$env:UV_PYTHON_INSTALL_MIRROR='https://gh-proxy.com/https://github.com/astral-sh/python-build-standalone/releases/download'}
$env:TEMP=Join-Path $Root 'tmp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path "$Root\runtime","$Root\runtime-vulkan","$Root\source","$Root\downloads","$Root\tools",$env:TEMP -Force | Out-Null
function Get-PinnedArchive([string]$Name,[string]$Url,[string]$Sha,[string]$Target) {
 if($GitHubTransport -eq 'GhProxy' -and $Url.StartsWith('https://github.com/')){$Url='https://gh-proxy.com/'+$Url}
 $archive=Join-Path "$Root\downloads" $Name
 if(-not(Test-Path $archive)) {
  & curl.exe --disable --fail --location --retry 4 --connect-timeout 20 --output "$archive.partial" $Url
  if($LASTEXITCODE -ne 0){throw "Download failed: $Name"}
  Move-Item -LiteralPath "$archive.partial" -Destination $archive
 }
 if((Get-FileHash $archive -Algorithm SHA256).Hash -ine $Sha){throw "SHA256 mismatch: $Name"}
 $marker=Join-Path "$Root\downloads" ($Name+'.extracted')
 if(-not(Test-Path $marker) -or (Get-Content $marker -Raw) -ne $Target) {
  Expand-Archive -LiteralPath $archive -DestinationPath $Target -Force
  [IO.File]::WriteAllText($marker,$Target)
 }
 Write-Output "Ready: $Name"
}
if(-not $ConverterOnly) {
if($Backend -eq 'CUDA') {
 Get-PinnedArchive 'llama-b12023-bin-win-cuda-13.4-x64.zip' 'https://github.com/ggml-org/llama.cpp/releases/download/b12023/llama-b12023-bin-win-cuda-13.4-x64.zip' '394ca33a4e7636dc732076c0ecef312761984df0bf9594b1076cfd5808d4df66' "$Root\runtime"
 Get-PinnedArchive 'cudart-llama-bin-win-cuda-13.4-x64.zip' 'https://github.com/ggml-org/llama.cpp/releases/download/b12023/cudart-llama-bin-win-cuda-13.4-x64.zip' '738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668' "$Root\runtime"
}
$vulkanTarget=if($Backend -eq 'Vulkan'){"$Root\runtime"}else{"$Root\runtime-vulkan"}
Get-PinnedArchive 'llama-b12023-bin-win-vulkan-x64.zip' 'https://github.com/ggml-org/llama.cpp/releases/download/b12023/llama-b12023-bin-win-vulkan-x64.zip' '99afa5556bbc0206ed1d4d0cc7ac56200c5080cc81e4a2f5a08367ae48b33625' $vulkanTarget
}
Get-PinnedArchive 'llama-b12023-source.zip' 'https://codeload.github.com/ggml-org/llama.cpp/zip/refs/tags/b12023' 'ae16e0ff793b13d0a047c07ff72f2b7c7bbcd9c7c175de5020d5ce2a811beed3' "$Root\source"
if($DownloadsOnly){return}
Get-PinnedArchive 'uv-0.9.13-windows-x64.zip' 'https://github.com/astral-sh/uv/releases/download/0.9.13/uv-x86_64-pc-windows-msvc.zip' 'cdfb04512c9184939f16eea02644a7133b4e41233ead69122d49847d29a45538' "$Root\tools"
function Invoke-JevNative {
    param([string]$Executable,[string[]]$Arguments)
    $priorPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try {
        & $Executable @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        if($LASTEXITCODE -ne 0){throw "Native command failed ($LASTEXITCODE): $Executable"}
    } finally { $ErrorActionPreference=$priorPreference }
}
$uv="$Root\tools\uv.exe"
if(-not(Test-Path "$Root\convert-env\Scripts\python.exe")) {
 Invoke-JevNative -Executable $uv -Arguments @('venv',"$Root\convert-env",'--python','3.12','--managed-python')
 if($LASTEXITCODE -ne 0){throw 'Portable Python venv creation failed.'}
}
Invoke-JevNative -Executable $uv -Arguments @('pip','install','--python',"$Root\convert-env\Scripts\python.exe",'torch==2.11.0+cpu','--index-url','https://download.pytorch.org/whl/cpu')
if($LASTEXITCODE -ne 0){throw 'CPU torch install failed.'}
Invoke-JevNative -Executable $uv -Arguments @('pip','install','--python',"$Root\convert-env\Scripts\python.exe",'-r',"$Root\source\llama.cpp-b12023\requirements\requirements-convert_lora_to_gguf.txt")
if($LASTEXITCODE -ne 0){throw 'Converter dependency install failed.'}
& "$Root\convert-env\Scripts\python.exe" -c "import torch; print(torch.__version__, 'cuda', torch.version.cuda); assert torch.version.cuda is None"
if($LASTEXITCODE -ne 0){throw 'CPU-only torch check failed.'}
if($ConverterOnly){return}
& cmd.exe /d /c "`"$Root\runtime\llama-server.exe`" --version 2>&1"
& cmd.exe /d /c "`"$Root\runtime\llama-server.exe`" --list-devices 2>&1"

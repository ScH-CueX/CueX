[CmdletBinding()]
param([string]$Root = 'C:\cuex')
$ErrorActionPreference = 'Stop'
$env:UV_CACHE_DIR = Join-Path $Root 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $Root 'uv-python'
New-Item -ItemType Directory -Path "$Root\runtime", "$Root\source", "$Root\downloads" -Force | Out-Null
$archive = "$Root\downloads\llama-b12023-bin-win-vulkan-x64.zip"
if (-not (Test-Path "$Root\runtime\llama-server.exe")) {
    & curl.exe --disable -fL --retry 4 -o $archive 'https://github.com/ggml-org/llama.cpp/releases/download/b12023/llama-b12023-bin-win-vulkan-x64.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Runtime download failed.' }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ine '99afa5556bbc0206ed1d4d0cc7ac56200c5080cc81e4a2f5a08367ae48b33625') { throw 'Runtime archive SHA256 mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath "$Root\runtime"
}
$sourceArchive = "$Root\downloads\llama-b12023-source.zip"
if (-not (Test-Path "$Root\source\llama.cpp-b12023\convert_lora_to_gguf.py")) {
    & curl.exe --disable -fL --retry 4 -o $sourceArchive 'https://codeload.github.com/ggml-org/llama.cpp/zip/refs/tags/b12023'
    if ($LASTEXITCODE -ne 0) { throw 'Source download failed.' }
    if ((Get-FileHash $sourceArchive -Algorithm SHA256).Hash -ine 'ae16e0ff793b13d0a047c07ff72f2b7c7bbcd9c7c175de5020d5ce2a811beed3') { throw 'Source archive SHA256 mismatch.' }
    Expand-Archive -LiteralPath $sourceArchive -DestinationPath "$Root\source"
}
if (-not (Test-Path "$Root\convert-env\Scripts\python.exe")) {
    & uv venv "$Root\convert-env" --python 3.12 --managed-python
    if ($LASTEXITCODE -ne 0) { throw 'uv venv failed.' }
}
& uv pip install --python "$Root\convert-env\Scripts\python.exe" -r "$Root\source\llama.cpp-b12023\requirements\requirements-convert_lora_to_gguf.txt"
if ($LASTEXITCODE -ne 0) { throw 'Converter dependency install failed.' }
& "$Root\convert-env\Scripts\python.exe" -c 'import torch; print(torch.__version__, "cuda", torch.version.cuda); assert torch.version.cuda is None'
if ($LASTEXITCODE -ne 0) { throw 'CPU-only torch check failed.' }
& "$Root\runtime\llama-server.exe" --version 2>&1
& "$Root\runtime\llama-server.exe" --list-devices 2>&1

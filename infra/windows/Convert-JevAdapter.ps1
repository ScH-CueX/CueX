[CmdletBinding()]
param([string]$Root = 'C:\cuex')
$ErrorActionPreference = 'Stop'
$env:HF_HOME = Join-Path $Root 'hf-cache'
$env:UV_CACHE_DIR = Join-Path $Root 'uv-cache'
$env:PYTHONPATH = "$Root\source\llama.cpp-b12023\gguf-py"
function Invoke-JevNative {
    param([string]$Executable,[string[]]$Arguments)
    $priorPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try {
        & $Executable @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        if($LASTEXITCODE -ne 0){throw "Native command failed ($LASTEXITCODE): $Executable"}
    } finally { $ErrorActionPreference=$priorPreference }
}
$python = "$Root\convert-env\Scripts\python.exe"
& $python "$PSScriptRoot\Inspect-JevAdapter.py" --root $Root
if ($LASTEXITCODE -ne 0) { throw 'Adapter inspection failed.' }
Invoke-JevNative -Executable $python -Arguments @("$Root\source\llama.cpp-b12023\convert_lora_to_gguf.py",'--base',"$Root\base-config",'--outfile',"$Root\adapter_vllm\JEV-9B-lora-f16.gguf",'--outtype','f16',"$Root\adapter_vllm")
if ($LASTEXITCODE -ne 0) { throw 'LoRA conversion failed.' }
& $python -c "import gguf, sys; from pathlib import Path; p=Path(sys.argv[1]); r=gguf.GGUFReader(p); names=[t.name for t in r.tensors]; print('tensor_count', len(names)); print('output', [n for n in names if 'output' in n]); assert len(names)==402; assert 'output.weight.lora_a' in names and 'output.weight.lora_b' in names" "$Root\adapter_vllm\JEV-9B-lora-f16.gguf"
if ($LASTEXITCODE -ne 0) { throw 'Converted output tensor check failed.' }
Get-FileHash "$Root\adapter_vllm\JEV-9B-lora-f16.gguf" -Algorithm SHA256 | Format-List

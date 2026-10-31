[CmdletBinding()]
param([string]$Root = 'C:\cuex')
$ErrorActionPreference = 'Stop'
$env:HF_HOME = Join-Path $Root 'hf-cache'
$env:UV_CACHE_DIR = Join-Path $Root 'uv-cache'
$env:PYTHONPATH = "$Root\source\llama.cpp-b12023\gguf-py"
$python = "$Root\convert-env\Scripts\python.exe"
& $python "$PSScriptRoot\Inspect-JevAdapter.py"
if ($LASTEXITCODE -ne 0) { throw 'Adapter inspection failed.' }
& $python "$Root\source\llama.cpp-b12023\convert_lora_to_gguf.py" --base "$Root\base-config" --outfile "$Root\adapter_vllm\JEV-9B-lora-f16.gguf" --outtype f16 "$Root\adapter_vllm"
if ($LASTEXITCODE -ne 0) { throw 'LoRA conversion failed.' }
& $python -c 'import gguf; from pathlib import Path; p=Path(r"C:\cuex\adapter_vllm\JEV-9B-lora-f16.gguf"); r=gguf.GGUFReader(p); names=[t.name for t in r.tensors]; print("tensor_count", len(names)); print("output", [n for n in names if "output" in n]); assert "output.weight.lora_a" in names and "output.weight.lora_b" in names'
if ($LASTEXITCODE -ne 0) { throw 'Converted output tensor check failed.' }
Get-FileHash "$Root\adapter_vllm\JEV-9B-lora-f16.gguf" -Algorithm SHA256 | Format-List

# Personal PC CUDA deployment

All models, tools, environments, caches and logs stay under `D:\cuex`.
The default `C:\cuex` and Vulkan options in the scripts remain available for existing deployments.

The runtime and converter both use official llama.cpp `b12023`.
CUDA uses the Windows x64 CUDA 13.4 build and its matching CUDA runtime DLL archive.
The Vulkan fallback is extracted separately to `D:\cuex\runtime-vulkan`.
Archives are checked against pinned SHA256 values before extraction.

Run these commands in PowerShell after copying `infra/windows` scripts to `D:\cuex\scripts`:

```powershell
# Start the Q4 and adapter download commands in separate sessions.
& D:\cuex\scripts\Download-Jev.ps1 -Root D:\cuex -Selection q4 -Mirror https://hf-mirror.com
& D:\cuex\scripts\Download-Jev.ps1 -Root D:\cuex -Selection adapter -Mirror https://hf-mirror.com

# Download the runtime separately while setting up the CPU converter.
& D:\cuex\scripts\Prepare-JevRuntime.ps1 -Root D:\cuex -Backend CUDA -DownloadsOnly -GitHubTransport GhProxy
& D:\cuex\scripts\Prepare-JevRuntime.ps1 -Root D:\cuex -ConverterOnly -GitHubTransport GhProxy
& D:\cuex\scripts\Convert-JevAdapter.ps1 -Root D:\cuex

& D:\cuex\scripts\Start-JevServer.ps1 -Root D:\cuex -Device CUDA0 -Quant Q4_K_M -Parallel 6 -ContextTotal 16384 -CacheRamMiB 0 -ContextCheckpoints 0 -BatchSize 2048 -UBatchSize 1024 -FlashAttention auto
& D:\cuex\convert-env\Scripts\python.exe D:\cuex\scripts\Verify-JevServer.py --root D:\cuex
```

`GhProxy` changes only the archive transport. The official release SHA256 checks still apply.
Portable uv and Python are installed under the selected root. Conversion uses CPU-only torch in `convert-env`.
The converter checks all 402 LoRA tensors, including `output.weight.lora_a` and `output.weight.lora_b`.
The server binds only `127.0.0.1:18080`. Adapter ID 0 starts inactive and requests select its scale.
The verification script checks all 24 verbalizer token IDs and measures the difference between LoRA scales 0 and 1.

The launcher uses `Win32_Process.Create` with an owned executable and a log file under `logs`.
It does not stop an existing listener. The launch record is `logs\server-current.json`.

## Deployment records and Mac access

Read the current process and command from `D:\cuex\logs\server-current.json`.
Read the hardware, runtime, and verification record from `D:\cuex\logs\personal-pc-runtime.json`.
The token and LoRA scale results are in `D:\cuex\logs\lora-scale-check.json`.
These are host run records; keep them outside the source tree.

The Mac reaches this loopback endpoint through the SSH stdio relay.
Run `bash scripts/s1-tunnel.sh` from the repository root.
See [S1-RELAY.md](S1-RELAY.md) for the Node entrypoint and frame protocol.

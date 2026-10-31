# Autotrust JEV-9B on Windows Vulkan

All deployment files live in `C:\cuex`. Run these scripts in PowerShell 7 on Windows. Model weights are downloaded on Windows only.

## Prepare

1. Inspect `llama-server.exe --version`, `--list-devices`, disk space, and port ownership first.
2. Copy `Download-Jev.ps1`, `jev-downloads.json`, `Prepare-JevRuntime.ps1`, `Convert-JevAdapter.ps1`, `Inspect-JevAdapter.py`, and `Start-JevServer.ps1`, and `Inspect-JevBase.py` to `C:\cuex\scripts`.
3. Run `Prepare-JevRuntime.ps1`. It downloads official llama.cpp **b12023** Vulkan and matching converter source. Python, uv cache, and the conversion environment stay under `C:\cuex`. PyTorch uses the CPU wheel index. The script asserts `torch.version.cuda is None`.
4. Run `Download-Jev.ps1 -Selection adapter`, then `Convert-JevAdapter.ps1`.
5. Run `Download-Jev.ps1 -Selection q4` or `-Selection q8`. Set `-Proxy http://127.0.0.1:7890` only when that proxy is available and faster.

Downloads use pinned Hugging Face revisions. Weight files have pinned byte counts and SHA256. Partial downloads resume. Existing files must match metadata. No foreign cache or model directory is changed.

Run `Inspect-JevBase.py` after the model download to confirm that `output.weight` and `token_embd.weight` have different offsets. The adapter inspection checks `lm_head` tensors. The converter checks `output.weight.lora_a` and `output.weight.lora_b` in the resulting GGUF. The base config has `tie_word_embeddings=false`.

## Start

```powershell
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q4_K_M
# Optional Q8 comparison can use the same port when it is free:
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q8_0
```

Startup validates the base hash, Vulkan0, runtime flags, and a free loopback port. It starts a dedicated process through `Win32_Process.Create`, outside the SSH child job. The process survives SSH disconnect. It does not install a service, create a scheduled task, open a firewall rule, or stop a listener.

The selected Q4 server uses `127.0.0.1:18080`, six slots, continuous batching, 16,384 total context tokens, RAM prompt cache disabled, context checkpoints disabled, batch size 2048, microbatch size 1024, `--jinja`, and `--lora-init-without-apply`. Startup evidence is in `C:\cuex\logs\server-current.json`. Logs have unique timestamped names.

For controlled runtime comparisons, the starter accepts `-Parallel`, `-ContextTotal`, `-CacheRamMiB`, `-ContextCheckpoints`, `-BatchSize`, `-UBatchSize`, and `-LogVerbosity`. For example:

```powershell
# Cache-only comparison, same four slots and total context:
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q4_K_M -Parallel 4 -ContextTotal 16384 -CacheRamMiB 0 -LogVerbosity 5
# Six-slot comparison, same total context and cache setting:
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q4_K_M -Parallel 6 -ContextTotal 16384 -CacheRamMiB 0 -LogVerbosity 5
```

The port must be free before either command. Coordinate with the evaluator before replacing your own running invocation.

## Runtime provenance

- llama.cpp: official b12023, version `0.8.0-dev`, commit `f3586e66b`.
- Device: `Vulkan0`, AMD Radeon RX 7900 XT, 20,464 MiB.
- Conversion: Python 3.12.15, PyTorch 2.11.0+cpu, CUDA absent.
- Converted adapter: 176,614,464 bytes, 402 tensors.
- Converted SHA256: `c36b94a24e7a74199828cfcb50e1f683a4773a10c552bc83d93299255f2e95ca`.
- Base: `tie_word_embeddings=false`, with separate output and token-embedding tensors.

`Prepare-JevRuntime.ps1` pins the runtime/source archive hashes. `models.json` records Q8/Q4 weight metadata and adapter/readout references. Runtime comparison evidence is kept with the evaluation artifacts.

## Per-request adapter selection

The single adapter is ID `0`. Startup leaves it unapplied. Always send an explicit scale on each request. `/lora-adapters` can show the most recently applied request scale.

- JEV decisions: `"lora":[{"id":0,"scale":1}]`.
- Base chat: `"lora":[{"id":0,"scale":0}]`.

JEV uses the repository's `bare-v1` raw prompt, not a chat wrapper. `adapter_vllm/decision_head.json` defines verbalizers and the bias. Repository-root `calibration.json` defines per-kind temperatures.

## Verify

Run `C:\cuex\convert-env\Scripts\python.exe C:\cuex\scripts\Verify-JevServer.py` after `/health` is ready. This checks all 24 verbalizer token IDs and confirms that scale `0` and `1` change their logprob odds. Evidence is saved in `C:\cuex\logs\lora-scale-check.json`.

## Safety

These scripts never touch `frpc`, `sshd`, the admin PowerShell host, other runtime directories, or foreign model files. They never kill a process. To stop a deployment, first inspect its PID, executable path, and command line from the saved launcher record; stop only that owned invocation. Do not stop a process by executable name.

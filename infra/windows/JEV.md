# Autotrust JEV-9B on Windows Vulkan

All deployment files live in `C:\cuex`. Run these scripts in PowerShell 7 on Windows. Model weights are downloaded on Windows only.

## Prepare

1. Inspect `llama-server.exe --version`, `--list-devices`, disk space, and port ownership first.
2. Copy `Download-Jev.ps1`, `jev-downloads.json`, `Prepare-JevRuntime.ps1`, `Convert-JevAdapter.ps1`, `Inspect-JevAdapter.py`, and `Start-JevServer.ps1`, `Download-JevRanged.ps1`, and `Inspect-JevBase.py` to `C:\cuex\scripts`.
3. Run `Prepare-JevRuntime.ps1`. It downloads official llama.cpp **b12023** Vulkan and matching converter source. Python, uv cache, and the conversion environment stay under `C:\cuex`. PyTorch uses the CPU wheel index. The script asserts `torch.version.cuda is None`.
4. Run `Download-Jev.ps1 -Selection adapter`, then `Convert-JevAdapter.ps1`.
5. Run `Download-Jev.ps1 -Selection q4` or `-Selection q8`. Set `-Proxy http://127.0.0.1:7890` only when that proxy is available and faster.

For a faster transfer, run `Download-JevRanged.ps1 -Selection q4 -Connections 8`. It preserves an existing `.partial` prefix, downloads only the missing tail in bounded ranges, assembles a new file, and checks the complete SHA256 before publishing the model. Run only one downloader for each target at a time.

Downloads use pinned Hugging Face revisions. Weight files have pinned byte counts and SHA256. Partial downloads resume. Existing files must match metadata. No foreign cache or model directory is changed.

The adapter inspection checks `lm_head` tensors. The converter checks `output.weight.lora_a` and `output.weight.lora_b` in the resulting GGUF. The base config has `tie_word_embeddings=false`.

## Start

```powershell
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q8_0
# Early Q4 evaluation can use the same port when it is free:
C:\cuex\scripts\Start-JevServer.ps1 -Quant Q4_K_M
```

Startup validates the base hash, Vulkan0, runtime flags, and a free loopback port. It starts a dedicated process through `Win32_Process.Create`, outside the SSH child job. The process survives SSH disconnect. It does not install a service, create a scheduled task, open a firewall rule, or stop a listener.

The server uses `127.0.0.1:18080`, four slots, continuous batching, 16,384 total context tokens, `--jinja`, and `--lora-init-without-apply`. Startup evidence is in `C:\cuex\logs\server-current.json`. Logs have unique timestamped names.

## Per-request adapter selection

The single adapter is ID `0`.

- JEV decisions: `"lora":[{"id":0,"scale":1}]`.
- Base chat: `"lora":[{"id":0,"scale":0}]`.

JEV uses the repository's `bare-v1` raw prompt, not a chat wrapper. `adapter_vllm/decision_head.json` defines verbalizers and the bias. Repository-root `calibration.json` defines per-kind temperatures.

## Safety

These scripts never touch `frpc`, `sshd`, the admin PowerShell host, other runtime directories, or foreign model files. They never kill a process. To stop a deployment, first inspect its PID, executable path, and command line from the saved launcher record; stop only that owned invocation. Do not stop a process by executable name.

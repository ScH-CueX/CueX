# Windows System 1 (llama.cpp Vulkan)

The default deployment is **Autotrust JEV-9B**, with Qwen3.5-9B Q8_0 and its decision LoRA. Follow [JEV.md](JEV.md) to prepare the isolated `C:\cuex` deployment and start `Start-JevServer.ps1`. Use adapter scale `1` for decisions and `0` for base chat. The generic scripts below also support standalone base-model comparisons.

Use an existing Windows Vulkan build of `llama-server.exe`. These scripts do not install software, change services or firewall rules, open LAN listeners, or stop other processes. Downloads run only when you call `Download-Model.ps1`.

## 1. Inspect before use

Run `.\infra\windows\Test-Scripts.ps1` for a read-only PowerShell syntax and catalogue check.

From the CueX root, in Windows PowerShell 5.1 or PowerShell 7:

```powershell
.\infra\windows\Inspect-SystemOne.ps1
# If no executable appears, search a directory you selected:
.\infra\windows\Inspect-SystemOne.ps1 -SearchRoot 'D:\my-tools'
```

Discovery reads process command lines, Windows service paths, TCP listeners and `PATH`. It searches recursively only inside explicit `-SearchRoot` directories. It does not assume a Worker installation directory. Review the output before selecting an executable.

If you need a newer build, choose the Windows Vulkan package from the [official llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases). Extract it outside CueX with its DLLs together. Do not replace binaries used by an existing Worker or server. Startup checks `--help` and `--list-devices`, and refuses to run without the selected `VulkanN` device.

## 2. Download one pinned model

The default is the provisional quality-first candidate for the 20 GB GPU, Qwen3.5-9B Q4_K_M. Use 4B if latency or memory needs a smaller model:

```powershell
.\infra\windows\Download-Model.ps1 -Model qwen35-9b-q4 -AcceptLicense
```

Read the linked card and its licence first. `-AcceptLicense` also acknowledges training-data terms. JevStyle v1 used AG News, whose card notes research/non-commercial terms.

| Catalogue key | File size | Purpose |
|---|---:|---|
| `qwen35-4b-q4` | 2,740,937,888 bytes | Smaller Chinese benchmark candidate |
| `qwen35-9b-q4` | 5,680,522,464 bytes | Quality-first default for the 20 GB GPU |
| `jevstyle-v1-2b-q8` | 2,076,666,976 bytes | Small typed-decision comparison; v1 bare prompt required |

`models.json` pins the repository revision, URL, byte size and Hugging Face LFS SHA256. The downloader checks disk space, writes a unique partial file, verifies size and SHA256, then moves it into place without overwrite. Existing valid files are reused. A mismatched existing file causes an error, not automatic deletion.

The default cache is `%LOCALAPPDATA%\CueX\cache`. Set `-CacheRoot 'D:\model-cache\CueX'` on both commands to use another disk. Cache paths inside this repository and junction/symlink ancestors are rejected. Model files and temporary downloads stay outside the repository.

## 3. Start on localhost

Use the exact executable discovered in step 1:

```powershell
.\infra\windows\Start-SystemOne.ps1 -LlamaServerPath 'D:\my-tools\llama-vulkan\llama-server.exe'
# Optional explicit free port and another catalogue model:
.\infra\windows\Start-SystemOne.ps1 -LlamaServerPath 'D:\my-tools\llama-vulkan\llama-server.exe' -Model jevstyle-v1-2b-q8 -Port 18081
```

The script repeats read-only discovery first. It verifies the model hash and executable flags. It binds a socket on `127.0.0.1` to test the requested port, or lets Windows select a free ephemeral port when `-Port 0` (default). It releases that probe immediately before launch. If another process takes the port, startup fails; it does not stop the owner.

The foreground server runs with:

```text
--host 127.0.0.1 --parallel 4 --cont-batching
--ctx-size 16384 --device Vulkan0 --n-gpu-layers 99 --no-webui
```

The script prints the actual base and `/health` URLs. `-ContextPerSlot 4096` reserves 16,384 total tokens for four slots. Set a smaller context or `-GpuLayers` value if memory is tight. `-Device Vulkan1` selects a different device listed by the executable. Qwen starts with `--jinja --reasoning-budget 0` for chat requests. Raw `/completion` prompts must still include the correct non-thinking Qwen template; startup flags do not transform raw prompt text. JevStyle v1 receives no Qwen chat-mode flags.

Stop this foreground invocation with Ctrl+C in its own console. There is no process-kill, service-management, or automatic-restart script. A local server has no remote access; use a separately authorized tunnel when needed.

## 4. Reach the server from the Mac

Use the Windows port printed by startup. This example assumes Windows port 18080 and a free Mac port 18080:

```sh
ssh -N -L 18080:127.0.0.1:18080 -o ExitOnForwardFailure=yes -o BatchMode=yes -o ConnectTimeout=40 -p 2233 -i ~/.ssh/nkanf_c -o IdentitiesOnly=yes nkanf@127.0.0.1
```

Keep that tunnel in its own terminal. Set the backend environment, then start CueX through its normal server command:

```sh
export CUEX_S1_URL=http://127.0.0.1:18080
export CUEX_S1_BACKEND=qwen3.5-9b@win-vulkan
export CUEX_S1_TIMEOUT_MS=600
export CUEX_S1_FORMAT=chat
```

For JevStyle v1, set `CUEX_S1_FORMAT=jev-v1`. For another authorized llama-server host, set its reachable base URL in `CUEX_S1_URL`; the backend contract stays the same. When the model URL fails or times out, CueX uses its local heuristic engine and reports `heuristic` as the answering backend.

## Prompt and evaluation notes

- See [`MODELS.md`](../../apps/server/src/system1/MODELS.md) for model scope and the benchmark checklist.
- JevStyle **v1** uses the exact `[State]`, `[Question]`, `[Options]` prompt ending in `Answer:` from its card. Ask for one option-letter token and normalize the declared option probabilities. Do not wrap it in a Qwen chat template.
- Current JevStyle **v4** uses block attention and per-option verdict slots. Its GGUF requires `jev-score-v2`; it is deliberately absent from this stock-server catalogue.
- Autotrust JEV is the default deployment. Its pinned adapter metadata and readout files are recorded in `models.json` and `jev-downloads.json`. [JEV.md](JEV.md) covers conversion, startup, and per-request LoRA selection.

## Validation record

On 2026-10-31 the model metadata, cards, LFS hashes, official licence text and llama.cpp flag documentation were read over HTTPS. No model was downloaded by this research task. The local Mac had llama.cpp 0.8.0 (build 11960) available. Windows paths and the existing Worker process were not observed: the parent reported that SSH banner exchange timed out. Run the read-only discovery on Windows before deployment. PowerShell execution and Vulkan inference remain the next validation steps.

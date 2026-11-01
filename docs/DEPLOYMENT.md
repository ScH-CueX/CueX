# CueX 通用部署指南

本指南面向新的开发电脑和服务器，不依赖作者的个人账号、主机地址或 SSH 文件。先跑通不需要模型的前后端，再逐项接入真实模型。

所有命令默认从仓库根目录执行，除非特别说明。下面的 `pnpm` 代表 **9.15.9**；未安装该版本时，可替换为 `npx --yes pnpm@9.15.9`。

## 选择部署方式

| 方式 | 能体验什么 | 需要什么 |
| --- | --- | --- |
| 仅前端 | 首页、68 秒演示回放、辅助切换、示例复盘 | Node.js、浏览器 |
| 前后端替身联调 | WebSocket、文字输入、候选与结束流程 | Node.js；不需要模型凭据 |
| 真实模型 | 实时判断、生成、语音输入和输出 | JEV / System 2 服务、ASR 模型、Ming TTS |
| 服务器部署 | 通过自己的域名体验 | 前端静态文件、Node 服务、HTTPS 与 WebSocket 反代 |

当前版本没有内置账号系统、多租户隔离或完整的会话数据库。服务器示例采用私有演示入口，不把未经鉴权的模型调用端口直接公开。

<a id="local"></a>
## 1. 环境、安装与本地联调

### 1.1 环境要求

| 部分 | 要求 |
| --- | --- |
| Web / Node 后端 | Git、Node.js ≥22.19、pnpm 9.15.9 |
| 浏览器 | 支持 WebGL；实时语音需要麦克风权限 |
| 本地 ASR | 当前平台可用的 `sherpa-onnx-node` 与已解压模型 |
| Ming GPU 服务 | 独立 Python / CUDA 环境，见语音部署说明 |
| 视频 / PDF 导出 | FFmpeg、Chrome；PPT 独立执行 `npm ci` |

```sh
git clone https://github.com/ScH-CueX/CueX.git
cd CueX
pnpm install --frozen-lockfile
```

不要用 `--prod` 安装当前后端的运行环境：服务端由 `tsx` 启动源码，而 `tsx` 目前位于开发依赖中。`apps/server/tsconfig.json` 设置了 `noEmit: true`，所以 `pnpm --filter @cuex/server build` 不会生成 `dist/index.js`。

### 1.2 初始化配置与独立运行目录

以下 Node 命令可在 macOS、Linux 和 Windows PowerShell 中使用。已有文件或运行目录不会被覆盖：

```sh
node -e "const f=require('node:fs'); if(!f.existsSync('.env')) f.copyFileSync('.env.example','.env');"
node -e "const f=require('node:fs'); if(!f.existsSync('.cuex-runtime/doctors')) f.cpSync('apps/server/agents/doctors','.cuex-runtime/doctors',{recursive:true});"
```

编辑根目录 `.env`。默认的四个引擎都是 `fake`，可直接联调。`.env` 和 `.cuex-runtime/` 已被 Git 忽略；示例中的 `CUEX_AGENTS_DIR` 相对 `apps/server` 解析，因此应使用下方启动命令。

### 1.3 启动后端

```sh
pnpm --filter @cuex/server exec node --env-file=../../.env --import tsx src/index.ts
```

预期日志包含 `ws://127.0.0.1:8765/ws/session`，并列出四个引擎模式。另开终端检查：

```sh
curl http://127.0.0.1:8765/health
```

响应应包含 `{"ok":true,"service":"cuex","sessions":0}`，会话数会随连接变化。这个接口只证明网关在运行，**不证明远端模型已经可用**。

PowerShell 可使用 `Invoke-RestMethod http://127.0.0.1:8765/health`。

### 1.4 启动前端

```sh
pnpm dev:web
```

打开 http://127.0.0.1:5173 。回放模式无需后端；切换实时连线后，开发服务器会代理 `/ws`、`/health` 和 `/briefing` 到 8765。

全屏演练入口是 `/?view=stage`，默认 `/` 保留首页。真实模式下，建立 WebSocket 连接会触发医生台词预取。

默认替身 ASR 不识别真实麦克风，替身 TTS 也不生成真实声音。先用文字输入验证会话，再按下一节启用模型。

### 1.5 自定义端口

在 `.env` 修改后端 `PORT`。假设改为 8876，前端开发代理也要同步：

macOS / Linux：

```sh
CUEX_SERVER_ORIGIN=http://127.0.0.1:8876 pnpm --filter @cuex/web dev --host 127.0.0.1 --port 5174 --strictPort
```

Windows PowerShell：

```powershell
$env:CUEX_SERVER_ORIGIN = 'http://127.0.0.1:8876'
pnpm --filter @cuex/web dev --host 127.0.0.1 --port 5174 --strictPort
```

`CUEX_SERVER_ORIGIN` 是 Vite 开发代理的配置，不是生产浏览器使用的后端 URL。浏览器默认连接同源 `/ws/session`。Node 启动命令明确加载 `.env`；普通 `pnpm dev:server` 不会自动加载它。终端已导出的同名变量优先于 `.env`，切换模式时要同步清理旧值。[Node 环境文件规则](https://nodejs.org/api/cli.html#--env-filefile)。

<a id="models"></a>
## 2. 接入真实模型

按需把 `.env` 中的 `CUEX_SYSTEM1`、`CUEX_SYSTEM2`、`CUEX_ASR`、`CUEX_TTS` 分别改为 `real`。四项可以逐项启用，便于定位问题；修改后重新启动后端。

### 2.1 System 1：快速判断

```dotenv
CUEX_SYSTEM1=real
CUEX_S1_URL=http://127.0.0.1:18080
CUEX_S1_FORMAT=jev-v1
CUEX_S1_TIMEOUT_MS=1460
```

`CUEX_S1_URL` 必须指向可访问的 llama-server 兼容服务；JEV 使用 `/completion`、约束输出和 token 概率，不是任意聊天接口。模型、量化、LoRA 与参数见 [System 1 文档](../apps/server/src/system1/README.md)和 [Windows 模型部署](../infra/windows/README.md)。

未设置 URL 时，`real` 适配器使用本地规则；模型超时或连接失败也会暂时回退到规则。应查看结果中的实际 `backend`，不能仅凭 `CUEX_SYSTEM1=real` 宣称每个判断都来自模型。

### 2.2 System 2：追问与医生台词

最简单的通用方式是提供兼容的聊天接口与自己的模型 ID：

```dotenv
CUEX_SYSTEM2=real
CUEX_S2_PROVIDER=cuex-provider
CUEX_S2_BASE_URL=https://your-provider.example/v1
CUEX_S2_MODEL=your-model-id
CUEX_S2_API_KEY=replace-with-your-private-key
CUEX_S2_TIMEOUT_MS=10000
CUEX_S2_RETRIEVAL=inline
```

替换示例地址、模型 ID 和凭据；不要把填好的 `.env` 提交到 Git。这条纯环境变量路线使用 `openai-completions` API 类型。两个独立 Agent 共用所选模型配置，分别准备追问和开场 / 重练 / 结束语。

如果需要 `anthropic-messages`，把提供商配置放在仓库外的 `models.json`，使用 `PRIME_MODELS_JSON` 指向该文件，并填写其 `api` 字段。代码还支持读取用户目录下的 `.prime/agent/models.json`，但通用部署不应依赖原作者的文件。具体读取逻辑见 [system2/config.ts](../apps/server/src/system2/config.ts)。

### 2.3 ASR：语音输入

启用本地识别：

```dotenv
CUEX_ASR=real
```

macOS / Linux 下载脚本：

```sh
bash apps/server/scripts/voice-fetch-asr-model.sh
```

脚本需要 `bash`、`curl`、`tar` 和 `shasum`，会校验下载 SHA-256。默认模型目录是用户缓存下的 `cuex-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`。

Windows 或自定义安装可从 [sherpa-onnx 官方发布](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models)下载同名模型、解压后设置：

```dotenv
CUEX_ASR_MODEL_DIR=C:/CueX/models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30
```

目录应包含 `tokens.txt`、encoder、decoder、joiner 模型文件。已有 sherpa WebSocket 服务时，也可使用 `CUEX_ASR_URL=ws://asr.example.com:6006`；显式 URL 优先于本地目录。没有可用配置时会成为文字模式，麦克风输入返回 `ASR_TEXT_ONLY`。[ASR 配置详情](../apps/server/src/voice/README.md)。

### 2.4 Ming TTS：语音输出

```dotenv
CUEX_TTS=real
CUEX_TTS_BACKEND=http
CUEX_TTS_URL=http://127.0.0.1:18766/tts
CUEX_TTS_FALLBACK=none
CUEX_TTS_TIMEOUT_MS=30000
```

HTTP 契约是 `POST /tts`，请求 `{"text":"你好。"}`，返回可独立解码的完整 WAV。项目与视频使用 Ming-3.0-tts-0.5b；医生和旁白使用不同的官方内置声线。

按部署位置选择连接方式：

| 位置 | 配置方式 |
| --- | --- |
| Node 与 Ming 在同一台主机 | 本项目 Ming 包装服务默认只监听 `127.0.0.1:18666`；把 TTS URL 指向该端口。 |
| Ming 在另一台允许 SSH 转发的主机 | 建立到远端回环端口的转发，再使用本机 18766。 |
| 团队当前 Windows 环境 | 使用专用 SSH 命令桥接，见下方说明；无需开放模型公网端口。 |

标准 SSH 转发示例，主机别名与用户由你在个人 SSH 配置中提供：

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18766:127.0.0.1:18666 your-gpu-host
```

这条命令仅适用于允许 TCP 转发的主机。团队当前 Windows 主机使用 `pnpm tts:connect`，读取仓库外 `CUEX_TTS_SSH_CONFIG` 指定的配置；其别名与部署目录约定见 [Windows TTS 指南](../infra/windows/tts/README.md)。不要把个人 SSH 配置或私钥拷进源码。

GPU 模型安装使用独立 Python 环境。包装服务通过 `CUEX_TTS_ROOT` 定位 `Ming-3.0-tts/` 与 `models/Ming-3.0-tts-0.5b/`；依赖清单、实际验证版本与 Windows 启动脚本位于 [infra/windows/tts](../infra/windows/tts/)。其他 GPU / 系统的 PyTorch 构建应按其兼容性选择，不能直接套用某台机器的 CUDA 版本。

### 2.5 检查真实引擎

完成配置后，在后端工作区的环境下执行：

```sh
pnpm --filter @cuex/server exec node --env-file=../../.env --import tsx src/gateway/demoHealth.ts
```

它会实际检查所配置的引擎，可能发起模型请求。确认输出是你期望的真实后端，而非仅检查 HTTP `/health`。首次本地 ASR 加载和 GPU TTS 预热需要时间。

`pnpm demo` 会启动团队约定的 JEV 与 TTS 桥接，并强制使用真实模式；它需要既有 SSH 别名、服务和模型配置。通用部署使用上述独立启动路线。

<a id="server"></a>
## 3. Linux 服务器与 HTTPS

下面是单实例、私有演示部署的参考布局。示例不会替你创建云主机、域名、证书或账号，也不是已经在所有系统上执行过的自动安装器。

```text
/srv/cuex/                       代码与安装后的依赖
/etc/cuex/server.env             运行配置，权限限制为部署管理员可读
/var/lib/cuex/doctors/           独立的医生 PROFILE.md / MEMORY.md
/var/lib/cuex/models/            可选的本地 ASR 模型
/etc/nginx/tls/cuex/             自己域名的 TLS 证书
```

### 3.1 安装与构建

将仓库部署到自己选择的目录，安装 Node.js 和固定版本 pnpm，再执行：

```sh
pnpm install --frozen-lockfile
pnpm build
```

静态产物在 `apps/web/dist/`。后端继续以源码启动；不要改成不存在的 `node apps/server/dist/index.js`。

创建专用服务用户并让它读取代码、写入运行数据目录。第一次部署时，把 `apps/server/agents/doctors/` 的种子文件复制到运行目录，之后升级不要覆盖已产生的 `MEMORY.md`。将 `.env.example` 复制到仓库外的 `/etc/cuex/server.env` 并配置模型，至少调整：

```dotenv
HOST=127.0.0.1
PORT=8765
CUEX_AGENTS_DIR=/var/lib/cuex/doctors
CUEX_LIBRARY_DIR=/var/lib/cuex/library
CUEX_MODEL_DIR=/var/lib/cuex/models
```

真实模型的模式和地址仍按第 2 节设置；只运行替身联调时保留 `fake`。

### 3.2 进程管理

参考 [cuex.service.example](../infra/deploy/cuex.service.example)。先替换服务用户、代码目录和 Node 可执行文件路径，再安装：

```sh
sudo cp infra/deploy/cuex.service.example /etc/systemd/system/cuex.service
sudo systemctl daemon-reload
sudo systemctl enable --now cuex
sudo systemctl status cuex
```

查看日志使用 `journalctl -u cuex -f`。示例的 `EnvironmentFile` 需要提前创建；`ExecStart` 使用 `node --import tsx src/index.ts`，并在 `apps/server` 工作目录运行。

### 3.3 反向代理

参考 [nginx.conf.example](../infra/deploy/nginx.conf.example)，替换域名、静态目录、证书和访问口令文件路径。将它放入 Nginx 的 `http` 配置上下文，例如常见的 `conf.d` 目录，再执行目标服务器的 `nginx -t` 检查后重载。

示例对网页、HTTP 和 WebSocket 入口都启用了 Basic Auth。使用系统的 `htpasswd` 工具创建你自己的口令文件；账号、口令和证书不进入仓库。[Nginx 访问控制文档](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)。

生产路径应保持同源：

| 路径 | 去向 |
| --- | --- |
| `/`、`/assets/`、字体与模型文件 | `apps/web/dist` 静态文件 |
| `/ws/session` | Node 的同名 WebSocket 路径 |
| `/health` | Node HTTP 健康接口 |
| `/briefing` | Node 场景资料接口 |
| `/api/experiences`、`/api/scenarios` | 团队经验与场景接口；保留入口鉴权 |

WebSocket 反代需要传递 Upgrade / Connection 头。示例显式使用 HTTP/1.1 并设置读取超时。[Nginx WebSocket 文档](https://nginx.org/en/docs/http/websocket.html)。

浏览器在 HTTPS 页面上会自动使用 WSS。远程机器通过普通 HTTP 访问时，麦克风可能不可用；应使用 HTTPS，本机 localhost 属于浏览器允许的安全上下文。[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

`vite preview` 用于本地检查构建产物，不作为本指南的长期服务器。不要假设静态托管会自动提供 `/ws/session`；只部署前端时，仅提供回放体验。

<a id="offline"></a>
## 4. 离线与静态部署

```sh
pnpm build
pnpm --filter @cuex/web preview --host 127.0.0.1 --port 5174 --strictPort
```

打开 http://127.0.0.1:5174 。构建产物包含本地字体、环境贴图和角色模型；回放不需要在线模型。

正式静态托管可使用同样的 `apps/web/dist`。当前前端按域名根路径部署；如需子路径，需要同时修改 Vite base、静态资源绝对路径和服务入口，不能只改目录名。

比赛交付包提供在线体验与 GitHub 链接，以及可离线阅读的 README、运行说明、PDF 和 MP4。本地备用运行时，先从仓库构建上述静态产物。完整实时训练需要模型与后端。

<a id="operations"></a>
## 5. 维护、升级与排障

### 数据与更新

- 活跃会话、播放状态和候选保存在进程内，服务重启后不恢复旧会话。
- 医生角色记忆会写入 `CUEX_AGENTS_DIR` 下的 `MEMORY.md`；它不是完整用户档案或数据库。
- 备份独立运行目录和部署配置，升级只替换代码、依赖与静态产物。
- 先在功能分支同步上游、处理冲突并运行相关检查，再发布经过验证的提交。
- 服务器升级前结束演练；重启后检查 HTTP、WebSocket、模型和一轮实际交互。

### 常用检查

```sh
pnpm build
pnpm --filter @cuex/server typecheck
pnpm check:public-data
pnpm check:public-data --staged
```

离线测试环境变量：

```sh
# macOS / Linux
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test
```

```powershell
# Windows PowerShell
$env:CUEX_TEST_OFFLINE = '1'
pnpm --filter @cuex/server test
```

本地隐私检查不会访问个人凭据目录，只检查不超过 2 MB 的 Git 已跟踪文本；`--staged` 检查暂存内容。它不扫描完整历史、未跟踪文件或二进制图片，发布前仍要核对实际交付物。

| 现象 | 优先检查 |
| --- | --- |
| 实时连接超时 / WebSocket 404 | Node 是否启动；同源 `/ws/session` 是否代理；反代是否传递 Upgrade |
| `/health` 正常但没有真实回答 | 四个引擎模式、System 2 配置及模型连通性；运行引擎检查 |
| `ASR_TEXT_ONLY` | 本地模型文件是否完整；配置目录是否正确；是否误设远程 ASR URL |
| 麦克风无法授权 | HTTPS / localhost、浏览器与操作系统麦克风权限 |
| TTS 报错 | Node 到 Ming 的 URL、服务预热和桥接状态；默认不会切换其他语音 |
| `models.json` 不存在 | 提供完整 `CUEX_S2_BASE_URL`、`CUEX_S2_API_KEY`、模型 ID，或指定自己的配置文件 |
| 字体 / 3D 文件 404 | 静态部署是否包含 fonts、env、models、brand；路径是否仍位于域名根目录 |
| 找不到 `tsx` 或服务端 `dist` | 使用完整依赖安装及本指南的源码启动命令 |
| 角色记忆无法保存 | 运行目录是否初始化并可写；服务用户是否有权限 |
| 端口被占用 | 调整 `.env` 的 PORT，并同步开发代理或反向代理的目标端口 |

## 6. 本指南的验证边界

本轮已核对配置名与源码，并验证环境文件启动、HTTP 健康与场景资料、WebSocket session.ready；文档相对链接、章节锚点及示例语法已检查。Nginx、systemd、域名、证书和不同平台的原生模型依赖需要在实际目标主机上验证；本指南不声称已经替部署者完成云端发布。

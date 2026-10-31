<div align="center">
  <img src="assets/brand/cuex-symbol-dimensional.svg" width="88" height="88" alt="CueX X 标识" />
  <h1>CueX</h1>
  <p><strong>让每一次临场应对，都有准备。</strong></p>
  <p>从医药代表训练出发的对话陪练系统</p>
  <p>AI + 医疗健康 · 记性好了一点 · 路皓然 / 任逸康</p>
</div>

CueX 练习的是对话发生变化时的应对：医生提出新的关切，代表需要停下原稿、听懂问题、重新选择信息，再组织回应。项目同时包含 Web 产品、实时会话后端、45 秒产品视频和超宽屏路演 PPT。

[运行与离线演示](docs/RUNNING.md) · [路演工程](ppt/README.md) · [Windows 语音部署](infra/windows/tts/README.md) · [公开调研依据](ppt/docs/research-basis.md)

## 产品如何工作

- **边听边判断。** System 1 处理范围明确的判断，跟踪当前关切和代表的回应；System 2 并行准备后续内容。
- **输出前再次检查。** 准备好的追问仍然是候选。代表主动补答后，已不适用的追问会撤销，避免把未说出的话写成真实对话。
- **提示可以逐渐减少。** 保留浅色诊室界面，使用全衬线字体；最小辅助通过四周光色和节奏表达，减少练习中的文字干扰。
- **回到具体时刻再练。** 回放与复盘呈现继续听、追问和撤销的关系；实时会话支持结束拜访、根据未解决的关切重试，并由 System 2 准备医生台词。
- **语音可以被打断。** 麦克风 PCM、ASR 结果、TTS 音频和中断通过统一协议流转。正式语音使用 Windows RTX 5080 上的 Ming-3.0-tts-0.5b。

## 当前可体验的范围

| 方式 | 内容 | 依赖 |
| --- | --- | --- |
| 演示回放 | 68 秒可拖动片段、辅助切换、评审视图、示例复盘 | 本地前端；素材和字体均在仓库 |
| 本地实时联调 | WebSocket 会话、候选状态、结束与重试流程 | 前后端；默认使用替身引擎 |
| 真实模型演示 | System 1 / System 2、ASR、Windows Ming TTS | 已配置并可访问的模型服务与凭据 |

ANSHU-3 是虚构训练资料，示例数字不代表真实临床证据。回放和示例评分用于说明交互，不能代替真实模型性能测试或训练效果验证。团队目前没有客户访谈、试用或付费验证；公开研究与商业假设分别记录在[研究依据](ppt/docs/research-basis.md)中。

## 快速启动

需要 Node.js **22.19 或更高**、pnpm **9.15.9**。PPT 使用独立的 npm / React 19 环境，Web 与视频使用 React 18。

```sh
git clone https://github.com/ScH-CueX/CueX.git
cd CueX
npx --yes pnpm@9.15.9 install
npx --yes pnpm@9.15.9 dev:web
```

打开 http://127.0.0.1:5173 。这是本地地址，不是公开部署链接。

另一个终端启动联调后端：

```sh
pnpm dev:server
```

前端把 `/ws` 和 `/health` 代理到本地 8765。后端默认使用替身引擎，不需要模型凭据。

真实模型演示：

```sh
pnpm demo
```

启动器先连接 Windows Ming，再检查 System 1、ASR、System 2 和服务端。需先按[运行说明](docs/RUNNING.md)及各引擎文档准备服务。SSH 私钥和配置保存在个人机器，不能提交到仓库或材料包。端口已占用时可通过 `PORT`、`CUEX_WEB_PORT` 指定新端口。

## Windows TTS

Ming 服务部署在 `E:\CueX-TTS`，使用隔离的 Python 环境、CUDA 12.8 和 PyTorch 2.8.0。医生使用官方内置声线「灵楷」，视频旁白使用「灵小柔」。

```sh
pnpm tts:connect
```

本机入口为 `http://127.0.0.1:18766/tts`。由于该 SSH 主机限制 TCP 转发，连接通过固定操作的 SSH 命令桥接完成。默认不自动切换到其他语音供应商；服务不可用会报错。

真实网关验证中，首段 Ming 音频约 3.1 秒返回，WAV 解码和用户打断后的停止输出均通过。这是单次检查，不是延迟分位数或并发性能承诺。[部署、启动与测量记录](infra/windows/tts/README.md)。

## 视频与路演

两份材料共同完成一条叙事：公开调研与痛点 → 产品演示 → 商业路径与拓展愿景。

- 视频：Remotion，1920×1080、30 fps、约 45 秒，含配乐和无配乐版本。统一采用浅色设计，使用真实前端采集、原片粒子动效、立体 X 与 Windows Ming 旁白。
- PPT：open-slide，最多 5 页，PDF 精确为 10.25 × 2.87 英寸。按 1＋3＋1 排列：调研痛点、三页产品、商业愿景；视频在第 2 页后播放；讲述约 135 秒，加视频共 3 分钟。
- 共享资产：统一维护在根目录 `assets/`，各工程的构建输出只是派生副本。

```sh
pnpm video:studio
pnpm video:demo
# 无配乐版
node video/scripts/render-demo.mjs --no-bgm

# 重建旁白，先保持 tts:connect 运行；需要 Python 和 ffmpeg
python3 video/scripts/build-demo-voice.py

# PPT
npm --prefix ppt ci
npm --prefix ppt run dev
node ppt/scripts/export-pdf.mjs cuex-pitch 5
```

视频输出到 `video/out/`，PDF 与可离线打开的 HTML 输出到 `ppt/out/`。浏览器采集和 PDF 导出需要 Chrome；可用 `CUEX_PLAYWRIGHT_PATH` 指定已有 Playwright，Remotion 可用 `REMOTION_BROWSER` 指定 Chrome 路径。

## 目录

```text
apps/web/              React、Vite、R3F、回放和实时会话界面
apps/server/           WebSocket、Controller、System 1/2、ASR/TTS
packages/protocol/     TypeScript 会话与音频协议
assets/                字体、模型、品牌、采集画面与声音
video/                 Remotion 视频工程
ppt/                   open-slide 路演工程与导出工具
infra/windows/         模型与语音服务部署代码
docs/                  运行说明、产品依据、设计与验证记录
scripts/               启动、SSH 语音桥接、浏览器采集
```

## 检查

```sh
pnpm build
pnpm --filter @cuex/server typecheck
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test
# 已启动 Windows Ming 后验证真实语音与中断
CUEX_TEST_OFFLINE=1 CUEX_TEST_MING_TTS=1 pnpm --filter @cuex/server test
# 浏览器交互检查；CUEX_CHROME 指向 Chrome 可执行文件
node --test apps/web/test/live-browser.test.mjs
```

## 下一步

从医药代表的小组试点开始，验证回应相关性、减少辅助后的独立完成度及教练投入，再探索团队订阅与场景内容服务。X 的四端代表未来可拓展的社交、演讲、销售、客服；这些是方向，尚未完成跨场景验证。

开发与媒体制作继续在功能分支进行，验证后合入 main。提交采用 `feat(scope): ...` / `fix(scope): ...`，正文说明行为变化与验证。

## 鸣谢与素材

感谢黑客松组织者、信达生物命题，以及 React、Three.js / React Three Fiber、Remotion、open-slide、Pi Agent 和 Ming TTS 开源项目。原 README 结构参考 Best-README-Template。素材来源见 [assets/README.md](assets/README.md)、[视频素材清单](video/src/assets/manifest.json)与[旁白清单](assets/audio/narration/manifest.json)。

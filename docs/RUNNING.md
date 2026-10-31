# CueX 运行与演示说明

## 当前交付范围

Web 首页、68 秒演示回放和复盘页面可本地运行。回放使用虚构的 ANSHU-3 资料。实时后端在 `origin/feat/realtime-poc` 分支继续开发；本轮没有将该分支合入 main，不能把这段回放当作真实模型端到端测试。

## Web

环境：Node.js 22 或更高；pnpm 9/10。项目现有 `pnpm.overrides` 配置应使用支持该配置的 pnpm 版本。

```sh
pnpm install
pnpm dev:web
```

访问 http://localhost:5173 。进入演练后可播放、暂停，选择「继续听 / 追问 / 撤销追问」，切换辅助强度，打开评审视图，然后进入复盘。

确定性画面链接示例：`/?view=live&t=28&jury=1&paused=1`。`paused=1` 仅控制演示回放是否自动开始。

```sh
pnpm build
pnpm --filter @cuex/web preview
```

字体、环境贴图、3D 模型均从根目录 assets 加载。演示回放不调用在线模型；在依赖安装和本地启动完成后，可作为离线演示方案。需先在实际演示电脑上验证 WebGL 与浏览器播放。

## 45 秒视频

```sh
pnpm video:demo
```

合成名 `CueXDemo45`，保留原来的 `CueXPromo` 90 秒工程。输出 `video/out/AI+医疗健康-记性好了一点-视频.mp4`。渲染读取本地素材和配音，不在渲染时调用语音服务。

更新前端后，先启动 Web，再执行 `node scripts/capture-product.mjs` 与 `node scripts/record-product.mjs`，更新实际页面素材。浏览器采集需要 Playwright 和 Chrome。可设置 `CUEX_PLAYWRIGHT_PATH`，渲染可设置 `REMOTION_BROWSER` 指向本机 Chrome 可执行文件。

`video/scripts/build-demo-voice.py` 是可选的旁白重建工具，需要 Python edge-tts 与 ffmpeg，会调用在线语音合成。最终配音已保存在 assets/audio/narration，不要求演示现场重建。

## 路演 PDF

见 `ppt/README.md`。使用独立的 open-slide 工程，避免 React 版本混用。

## 素材来源

共享目录说明见 `assets/README.md`。X 标识提取自原 CueX 视频。字体来源与已有声音来源见 `video/src/assets/manifest.json`，新旁白见 `assets/audio/narration/manifest.json`。产品录像为本项目浏览器演示回放；没有使用患者记录或真实临床试验数据。

# CueX 路演材料

使用用户指定的 [open-slide](https://github.com/open-slide/open-slide)，锁定 `@open-slide/core` 2.3.1。此目录单独使用 npm 和 React 19，避免影响 Web / Remotion 现有的 React 18 工作区。

```sh
cd ppt
npm ci
npm run dev
```

浏览器打开 http://localhost:5180 。当前 `dir-clinic`、`dir-crossing`、`dir-editorial` 是三个设计方向，每个仅两页代表稿，尚未选定最终路演版本。

目录与视频工程对应：`slides/` 是 open-slide 入口，`src/` 留给后续共享逻辑，`scripts/` 放导出脚本，`docs/` 放制作依据，`out/` 是生成的交付文件。所有图片、字体、标识均来自根目录 `assets/`。

## 超宽屏导出

设计内容是 2050 × 574。open-slide 的预览舞台仍是 1920 × 1080，内容以宽屏居中展示。PDF 导出只取 `.cuex-wide` 内容，页面精确为 10.25 × 2.87 英寸，保持主会场大屏的比例，不包含预览留边。

保持开发服务器运行，在另一个终端执行：

```sh
node scripts/export-pdf.mjs dir-clinic 2
```

导出脚本需要 Playwright 与 Chrome。可通过 `CUEX_PLAYWRIGHT_PATH` 指向本机已有 Playwright 包。导出 HTML 会内嵌所用字体和图像，PDF 保留文字，可离线打开。

方向选定后补齐至最多 5 页，并导出 `CueX-记性好了一点-PPT.pdf`。三分钟路演中预留约 45 秒播放视频，其余约 2 分 15 秒用于讲述。

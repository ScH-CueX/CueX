# RealtimeGuide 视觉探索 · 共享创意简报（所有原型页面共同遵守）

本目录是视觉概念草案，不是产品实现。静态数据、脚本化回放，无后端、无语音、无模型。页面上必须诚实标注“演示回放 · 静态数据”。

## 1. 产品要点（来自 handoff.md，已读全文）

- 训练的不是“讲完准备稿”，而是交流途中被改变时的调整：停止 → 听懂 → 重选信息 → 回应。
- 快慢两层并行：System One 高频、小范围判断（是否回应了关切、该继续听还是追问、候选是否仍然适用）；System Two 在后台理解、检索、准备候选追问。
- 两条必须保留的区别：①实际说出的话 vs 尚未说出的候选；②准备候选时的情境 vs 现在的情境（用户自行修正后，候选要撤销）。
- 三个关键时刻：继续听（回应得当）→ 追问（持续偏离）→ 撤销追问（用户自己补上）。
- 前端原则：交流自然发生；医生行为有可理解的原因，不只是挑错；**安静也有意义，不靠持续弹提示证明系统在工作**；打断后能接上；复盘回到具体经历；重练能尝试不同做法；技术解释与正常练习各有位置（评审视图另外呈现）。
- 表现模式（Performance）：给适量提示、资料、策略，帮眼前练习推进。学习模式（Learning）：少帮助，留出独立尝试，之后复盘再练。

## 2. 推荐方向：A「诊室」The Consulting Room

**一句话理念：** 只属于这个产品的东西，是“医生已经想好、还没说出口、随时可能收回的那句追问”。它在页面上表现为医生身体的前倾和一束朱砂色的侧光——用户感到“对方想插话”，却看不到那句话本身；只有在评审视图和复盘里，那句话才以朱砂色写出来，并在被撤销时划掉。

- **3D 主体：石膏半身像医生。** 石膏是解剖课、雕塑课、医学史的材料；它诚实地表明“这是模拟角色”，绕开恐怖谷，也不用做皮肤、头发、服装。3D 不是背景：它承担真实拜访里的非语言轮次信号（倾听时的点头、准备插话时前倾吸气抬眉、追问、放下追问时呼气后靠并点头）。
- **不在练习中显示候选追问的文字**（会剧透训练）。练习中只给身体信号 + 一个状态词。
- **光与色：** 白天的诊室。冷灰绿墙面底色、墨色文字、石膏白；唯一强调色是朱砂（`--held`），只用于“被搁置的追问”及其生命周期（问出 / 撤销）。已回应的关切用一个安静的数据色（`--resolved`）。不做深色默认，不用渐变、发光、玻璃。
- **两种声音两种字：** 医生说话用宋体（Noto Serif SC），代表与界面用黑体（Noto Sans SC）。这是品牌最重要的排版规则。
- **方向 B「语义场」**（抽象认知空间：关切是锚点，代表的表达是一条靠近或偏离锚点的线，候选追问是悬在空中的朱砂珠，问出就落下，撤销就消散）不作为主界面，压缩进**评审视图**和复盘的决策轨道。
- **方向 C「对谈稿」**（像剧本或乐谱一样排版的对话，两行谱表 + 页边批注）不作为主界面，成为**复盘页的骨架**。

## 3. 共享文件（只读，除非你是指定所有者）

| 文件 | 内容 | 所有者 |
| --- | --- | --- |
| `shared/tokens.css` | 色彩、字体、字号、间距、圆角、动效 token，基础控件 `.btn` `.seg` | 主线程（不要改；需要新 token 就在自己页面 CSS 里加页面前缀变量，并在报告里说明） |
| `shared/scenario.js` | 唯一的演示片段数据（ES module）：UTTERANCES / CONCERN / JUDGMENTS / CANDIDATES / DOCTOR_STATES / NODS / STATE_WORDS / MOMENTS / stateAt / fmt | 主线程（不要改；发现数据问题写进报告） |
| `shared/doctor3d.js` | `createDoctor(container, opts)` → `{ ok, setState(name), setReadiness(0–1), nod(amp), lookAt(x,y), setFraming(name, extra), dispose() }`；状态：listening / holding / asking / withdrawing / speaking；framing：stage / hero / thumb；opts：azimuth, shiftX, shiftY, heldLight | **实时训练页 agent** 负责调姿态参数；API 只能向后兼容地扩展 |
| `vendor/three/` | Three.js r170 本地副本 + GLTFLoader、meshopt、RoomEnvironment | 不要改 |
| `assets/models/facecap-notex.glb` | 临时 3D 头部（52 个 ARKit 表情 blendshape，330 KB）。来自 three.js 示例（Face Cap），**仅作临时资产**，正式使用前要替换或确认授权 | 不要改 |

页面需要的 import map（路径相对于页面所在目录，页面在 `design-exploration/<folder>/index.html` 时）：

```html
<script type="importmap">
{ "imports": { "three": "../vendor/three/three.module.min.js", "three/addons/": "../vendor/three/addons/" } }
</script>
```

字体（每页 `<head>` 内，tokens.css 之前）：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@500;600;700&display=swap">
<link rel="stylesheet" href="../shared/tokens.css">
```

## 4. 页面与目录

| 目录 | 页面 | 负责 |
| --- | --- | --- |
| `live/` | 实时训练主界面（核心） | agent 1 |
| `landing/` | 首页首屏关键视觉 | agent 2 |
| `review/` | 复盘界面 | agent 3 |
| `directions/` | 三个方向比较（含可渲染小样） | agent 4 |
| `spec/` + 根目录 `index.html` | 视觉规范初稿 + 草案入口页 | agent 5 |

每个 agent 只写自己的目录（agent 5 另外写根目录 `index.html`）。不要改其他目录，不要改 `_round0/`（旧草案存档）。

## 5. 通用质量线（四套 skill 的交集，全部页面适用）

- 中文界面，`<html lang="zh-Hans">`。品牌名 RealtimeGuide 加 `translate="no"`。
- 无眉标（标题上方的小标签）、无 01/02/03 编号、无 emoji、无渐变、无发光、无玻璃、无静止元素的阴影、无等宽字体装饰、无图标卡片网格、无小号大写字距标签。
- 最小字号 13px；正文 16px 以上；对比度正文 ≥ 4.5:1。
- 圆角统一 2px（`--r`）。按钮为方角实心墨色，主操作每屏一个。
- 动效只动 transform / opacity（3D 画布除外）；用 tokens 里的缓动；永不 `transition: all`；按钮 `:active` scale(0.97)；所有动效有 `prefers-reduced-motion` 降级。
- 键盘可达，`:focus-visible` 可见，图标按钮有 aria-label，状态变化用 `aria-live="polite"` 播报。
- WebGL 失败时（`doctor.ok === false`）页面依然可读可用。
- 截图检查：预览服务器已在 `http://127.0.0.1:8766/` 运行（根目录即 design-exploration）。**不要使用 Browser pane 工具（preview_*）**，它与其他 agent 共用。用无头 Chrome 自己截图（需要在沙箱外运行，Bash 设 `dangerouslyDisableSandbox: true`）：

```bash
OUT=$TMPDIR/<your-folder>-shots; mkdir -p $OUT; "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --user-data-dir=$OUT/profile --window-size=1440,900 --virtual-time-budget=9000 --screenshot=$OUT/desktop.png "http://127.0.0.1:8766/<your-folder>/index.html?t=28"
```

  然后用 Read 工具查看 PNG。至少检查 1440×900、1280×800、390×844 三个尺寸。页面支持 `?t=<秒>` 参数直接定位到某个时刻会让截图更容易（实时页与复盘页必须支持）。

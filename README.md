<a id="readme-top"></a>

当前演示范围、离线运行与新制作的 45 秒视频见 [运行说明](docs/RUNNING.md)。超宽屏路演工程见 [ppt/README.md](ppt/README.md)。

<!-- PROJECT SHIELDS -->
<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

</div>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/ScH-CueX/CueX">
    <img src="assets/brand/cuex-symbol.svg" width="80" height="80" alt="CueX" />
  </a>

<h2 align="center">CueX</h2>

  <p align="center">
    <strong>医药代表临场应对实时训练系统 · 基于上下文的双层即时决策架构</strong>
    <br />
    2026 苏客松 · AI + 医疗健康主赛道（信达生物企业命题）
    <br />
    <br />
    <a href="http://127.0.0.1:5173/"><strong>在线体验 Demo »</strong></a>
    &middot;
    <a href="#核心功能与交互亮点">交互亮点</a>
    &middot;
    <a href="#快速上手">快速启动</a>
    &middot;
    <a href="https://github.com/ScH-CueX/CueX/issues">提交反馈</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details open>
  <summary>目录导览</summary>
  <ol>
    <li>
      <a href="#关于项目">关于项目</a>
      <ul>
        <li><a href="#行业痛点与解决思路">行业痛点与解决思路</a></li>
        <li><a href="#三大底层创新">三大底层创新</a></li>
        <li><a href="#技术选型">技术选型</a></li>
      </ul>
    </li>
    <li>
      <a href="#核心功能与交互亮点">核心功能与交互亮点</a>
      <ul>
        <li><a href="#1-3d-石膏半身像与非语言轮次感知">1. 3D 石膏半身像与非语言轮次感知</a></li>
        <li><a href="#2-阶梯式认知辅助系统-scaffolding-hud">2. 阶梯式认知辅助系统 (Scaffolding HUD)</a></li>
        <li><a href="#3-ai-自动情境合成与团队经验沉淀飞轮">3. AI 自动情境合成与团队经验沉淀飞轮</a></li>
        <li><a href="#4-带智能反馈的复盘对谈稿-reflection-studio">4. 带智能反馈的复盘对谈稿 (Reflection Studio)</a></li>
      </ul>
    </li>
    <li>
      <a href="#快速上手">快速上手</a>
      <ul>
        <li><a href="#环境要求">环境要求</a></li>
        <li><a href="#安装依赖">安装依赖</a></li>
        <li><a href="#运行项目">运行项目</a></li>
      </ul>
    </li>
    <li><a href="#系统架构与模块拓扑">系统架构与模块拓扑</a></li>
    <li><a href="#路线图">路线图</a></li>
    <li><a href="#贡献指南">贡献指南</a></li>
    <li><a href="#鸣谢与致谢">鸣谢与致谢</a></li>
  </ol>
</details>

---

<!-- ABOUT THE PROJECT -->
## 关于项目

> **“让代表第一次接不住医生的追问，发生在训练里，而不是重要拜访里。”**

**CueX** 是针对医药代表一线实战拜访培训研发的**实时认知伴随与演练系统**。针对传统带教成本高、静态背书与真实临床脱节的痛点，CueX 通过 AI 模拟医生的流式决策，让代表在动态被打断、突发追问与关切转移的情境中，训练“停止原话 → 听清关切 → 提取证据 → 临场调整”的核心能力。

### 行业痛点与解决思路

* **痛点一：传统带教主管陪练成本极高，新人靠死记硬背。**
  * *CueX 解法*：AI 驱动真实医生情境低成本随时开练，让新人零边际成本反复摸爬滚打。
* **痛点二：静态剧本与真实门诊严重脱节。**
  * *CueX 解法*：引入 **System 1（快层 / Jev）** 毫秒级感知表达偏离，在说话途中发起打断，还原临床真实压力。
* **痛点三：团队销冠个体经验难以传承。**
  * *CueX 解法*：将老资历代表的“避坑红线、医生雷区、黄金应答逻辑”沉淀为系统知识中枢，自动合成衍生演练素材，把个体经验转化为整个团队的群体竞争力。

### 三大底层创新

1. **实时理解 · 不等句号 (Real-time Understanding)**
   在代表说话的同时，System 1（Jev-like 决策模型）毫秒级研判语义与医生关切的贴合度，在恰当时机果断打断，打破传统“等讲完整句才应答”的假智能。
2. **并行准备 · 毫秒开口 (Parallel Preparation)**
   System 2（基于 TypeScript 的 PiAgent 基座）在后台调用临床试验指南与 Skills 异步准备候选追问。快层触发时内容早已就绪，实现零延迟语音介入。
3. **动态撤销 · 不进历史 (Dynamic Withdrawal)**
   Controller 在输出前持续复核依据。代表一旦自行补齐答案，已准备就绪的追问在输出前**静默撤销**，留在时间线上供复盘，绝不污染真实对话历史。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

### 技术选型

CueX 采用统一的 **全栈 TypeScript Monorepo** 架构，技术栈深度协同：

* [![React][React.js]][React-url]
* [![Three.js][Three.js]][Three-url]
* [![TailwindCSS][TailwindCSS]][Tailwind-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Vite][Vite]][Vite-url]
* [![Remotion][Remotion]][Remotion-url]

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- CORE FEATURES -->
## 核心功能与交互亮点

遵从 **“Less is More（少即是多）· 能用视觉语言表达的绝不写字”** 的核心原则：

### 1. 3D 石膏半身像与非语言轮次感知

* **材料诚实性**：采用医学解剖课与雕塑课的**石膏白（Plaster）**，诚实表明这是模拟角色，彻底规避恐怖谷，不靠逼真皮肤做噱头；
* **非语言轮次信号**：
  * **想插话**：石膏身体前倾 5°、后颈微抬、微吸气挑眉，背光侧亮起一束**朱砂侧光（Fresnel Rim Light）**，代表本能感受到对方要开口；
  * **放下追问**：代表主动纠正后，石膏像呼气、后靠、轻轻点头，朱砂侧光消散，危机化解全凭身体松弛传达。

### 2. 阶梯式认知辅助系统 (Scaffolding HUD)

避免 2025 年 PNAS 实验警示的“AI 代劳陷阱（撤除 AI 后学生成绩暴跌）”，提供三级自适应辅助：
* **全量辅助 (Performance)**：伴随托盘展开，提供临床证据文献出处（ANSHU-3 亚组数据速查 P.14 表 3-2）与即时应对战术；
* **微信号提示 (Minimal Cue)**：仅保留核心数据与合规红线禁忌（如 eGFR < 30 严禁推荐）；
* **撤除辅助 (Independent)**：关闭所有外部提示，独立面对医生突发质询，复盘时再回溯经验。

### 3. AI 自动情境合成与团队经验沉淀飞轮

* 支持用户挂载不同药械资料包、设定医生性格特征（严谨学术型 / 急躁紧迫型 / 探索质疑型）与门诊时间限制；
* 一键注入老代表实战心得（如李主管 5 年销冠打法），AI 自动生成带有针对性关切逻辑树与追问陷阱的专属演练素材。

### 4. 带智能反馈的复盘对谈稿 (Reflection Studio)

* **决策时序轨道**：拖动滑块查看任意时刻 System 1 / System 2 的推理状态；
* **双声部纯粹排版**：医生说话用宋体（Noto Serif SC），代表说话用黑体（Noto Sans SC），字体即身份；
* **智能教练诊断**：量化偏离时滞（秒）、自愈成效分析，并与**资深销冠实战打法（Senior Rep Benchmark）**形成对照，支持一键变式重练。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- GETTING STARTED -->
## 快速上手

### 环境要求

* Node.js >= 18.0.0
* pnpm >= 9.0.0

### 安装依赖

1. 克隆代码仓库
   ```sh
   git clone https://github.com/ScH-CueX/CueX.git
   cd CueX
   ```
2. 安装 Monorepo 工作区依赖
   ```sh
   pnpm install
   ```

### 运行项目

* **启动前端应用 (apps/web)**
  ```sh
  pnpm dev:web
  ```
  浏览器打开 `http://localhost:5173/` 即可体验。

* **构建并启动全栈生产产物**
  ```sh
  pnpm build
  pnpm --filter @cuex/web preview
  ```

* **启动宣发视频制作工作室 (apps/video)**
  ```sh
  pnpm video:studio
  ```

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- ARCHITECTURE -->
## 系统架构与模块拓扑

```text
CueX/
├── packages/
│   └── protocol/              # 【强类型契约】Jev 判定、PiAgent 候选生命周期、ASR/TTS 协议
├── apps/
│   ├── web/                   # 【工业级前端】React 18 + R3F + Tailwind + shadcn/ui
│   │   ├── src/core/          # 会话驱动层 (ReplayDriver / LiveWSDriver) + 音频管道
│   │   ├── src/components/    # 3D 医生舞台、Scaffolding HUD 辅助抽屉、张力刻度线
│   │   └── src/views/         # HomepageView、LiveTrainingView、ReviewView
│   ├── server/                # 【TS 后端中枢】WebSocket 网关 + Jev 快层 + PiAgent 慢层 + Controller
│   └── video/                 # 【宣发视频工程】Remotion 4.0 90 秒 CueX Promo 自动化工程
├── docs/                      # 需求分析、医疗痛点、黑客松说明文档
└── pnpm-workspace.yaml        # Monorepo 统一依赖调度
```

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- ROADMAP -->
## 路线图

- [x] 基于 React 18 + R3F 重构工业级纯粹前端
- [x] R3F 石膏医生 52 ARKit Blendshape 表情与 Fresnel 朱砂侧光
- [x] 全双工通信协议包 (`@cuex/protocol`)
- [x] 阶梯式认知辅助系统 (`ClinicalScaffoldingHUD`)
- [x] AI 自动情境合成与团队销冠经验萃取交互模块
- [x] 智能反馈复盘室与决策时序轨道
- [ ] 接入真实麦克风流式 ASR 与本地 VAD 静音切片
- [ ] 接入云端流式 TTS 毫秒级硬截断
- [ ] 扩展更多临床专科拜访情境（肿瘤免疫联合治疗、SGLT2 抑制剂等）

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- CONTRIBUTING -->
## 贡献指南

任何有助于提升真实拜访训练体验的建议与贡献都深受感激！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送至分支 (`git push origin feature/AmazingFeature`)
5. 发起 Pull Request

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

---

<!-- ACKNOWLEDGMENTS -->
## 鸣谢与致谢

* [2026 苏客松组委会（36氪 & 锦丰集团）](https://mp.weixin.qq.com/s/msnEgvj4M5lk2pcG0YkOYg)
* [信达生物制药（苏州）有限公司 (Innovent Biologics)](https://www.innoventbio.com/)
* [PiAgent / TypeSafe 开源智能体社区](https://github.com/badlogic/pi-mono)
* [Three.js & React Three Fiber 社区](https://github.com/pmndrs/react-three-fiber)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/ScH-CueX/CueX.svg?style=for-the-badge
[contributors-url]: https://github.com/ScH-CueX/CueX/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/ScH-CueX/CueX.svg?style=for-the-badge
[forks-url]: https://github.com/ScH-CueX/CueX/network/members
[stars-shield]: https://img.shields.io/github/stars/ScH-CueX/CueX.svg?style=for-the-badge
[stars-url]: https://github.com/ScH-CueX/CueX/stargazers
[issues-shield]: https://img.shields.io/github/issues/ScH-CueX/CueX.svg?style=for-the-badge
[issues-url]: https://github.com/ScH-CueX/CueX/issues
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Three.js]: https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white
[Three-url]: https://threejs.org/
[TailwindCSS]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[TypeScript]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Remotion]: https://img.shields.io/badge/Remotion-0B84F3?style=for-the-badge&logo=remotion&logoColor=white
[Remotion-url]: https://www.remotion.dev/

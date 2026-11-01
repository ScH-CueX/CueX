import React, { useState } from 'react';
import type { ViewKey } from '@/components/layout/Navbar';
import { DoctorCanvas } from '@/components/r3f/DoctorCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, ArrowRight, BookOpen, ShieldCheck, Zap, RotateCcw, Brain, CheckCircle2, Sparkles, UserCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScenarioSynthesizerModal } from '@/components/ScenarioSynthesizerModal';

interface HomepageViewProps {
  onNavigate: (view: ViewKey, params?: { t?: number; jury?: boolean }) => void;
}

export const HomepageView: React.FC<HomepageViewProps> = ({ onNavigate }) => {
  const [heroPose, setHeroPose] = useState<'listening' | 'holding' | 'withdrawing'>('holding');
  const [isSynthesizerOpen, setIsSynthesizerOpen] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-ground text-ink selection:bg-held-tint selection:text-ink">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-12 space-y-24">
        
        {/* ===================== HERO SECTION ===================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-widest text-ink-3 uppercase">CUEX</span>
              <span className="text-line">/</span>
              <span className="text-xs text-ink-2 font-medium">临床沟通与临场应对训练</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink leading-[1.15]">
              让代表第一次接不住医生的追问，<br />
              <span className="text-held">发生在训练里，</span><br />
              而不是重要拜访里。
            </h1>

            <p className="text-base sm:text-lg text-ink-2 leading-relaxed max-w-xl font-normal">
              资料都背过了，可医生的追问从不按准备稿来。<strong className="text-ink font-semibold">CueX</strong> 是基于上下文的即时决策与真实拜访训练系统。AI 模拟医生根据代表当下的表达持续决策：倾听推进、追问打断，或在代表主动补正时静默撤销追问。
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-3">
              <Button
                variant="default"
                size="lg"
                onClick={() => onNavigate('live')}
                className="h-12 px-8 text-base gap-2"
              >
                <span>进入演练室</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="quiet"
                size="lg"
                onClick={() => onNavigate('review')}
                className="h-12 px-6 text-base"
              >
                查看复盘示例
              </Button>
            </div>

            <div className="pt-4 border-t border-line/60 grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="font-bold text-ink text-sm block">说话途中</span>
                <span className="text-ink-3">感知关切变化</span>
              </div>
              <div>
                <span className="font-bold text-ink text-sm block font-mono">System 1/2</span>
                <span className="text-ink-3">快慢双层并行架构</span>
              </div>
              <div>
                <span className="font-bold text-ink text-sm block font-mono">Scaffolding</span>
                <span className="text-ink-3">逐步撤除辅助闭环</span>
              </div>
            </div>
          </div>

          {/* Hero 3D 石膏医生焦点交互 */}
          <div className="lg:col-span-6 border border-line bg-surface/70 rounded-[2px] p-6 space-y-4 shadow-sm">
            <div className="relative h-[380px] bg-ground-2/30 rounded-[2px] overflow-hidden border border-line/60 flex items-center justify-center">
              <DoctorCanvas
                state={heroPose}
                readiness={heroPose === 'holding' ? 0.9 : 0}
                framing="hero"
                bust={true}
                className="w-full h-full"
              />

              {/* 姿态微操控制盘 */}
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-surface/90 border border-line p-1 rounded-[2px] text-xs">
                <button
                  type="button"
                  onClick={() => setHeroPose('listening')}
                  className={cn('px-2.5 py-1 rounded-[2px] transition-colors', heroPose === 'listening' ? 'bg-ink text-ground font-medium' : 'text-ink-2 hover:bg-ground-2')}
                >
                  倾听
                </button>
                <button
                  type="button"
                  onClick={() => setHeroPose('holding')}
                  className={cn('px-2.5 py-1 rounded-[2px] transition-colors', heroPose === 'holding' ? 'bg-held text-ground font-medium' : 'text-ink-2 hover:bg-ground-2')}
                >
                  前倾想插话（朱砂光）
                </button>
                <button
                  type="button"
                  onClick={() => setHeroPose('withdrawing')}
                  className={cn('px-2.5 py-1 rounded-[2px] transition-colors', heroPose === 'withdrawing' ? 'bg-resolved text-ground font-medium' : 'text-ink-2 hover:bg-ground-2')}
                >
                  后靠放下追问
                </button>
              </div>

              {/* 悬置追问状态卡 */}
              <div className="absolute top-4 right-4 max-w-[260px] p-3 rounded-[2px] bg-surface/90 border border-line text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-ink-3 tracking-wider block font-mono">非语言轮次</span>
                <p className="font-doctor text-xs text-ink font-semibold leading-relaxed">
                  {heroPose === 'holding' && '“先停一下。七十五岁以上的患者，研究里有多少？”'}
                  {heroPose === 'withdrawing' && <del className="text-ink-3">“那 eGFR 低于 30 的呢？”（已静默撤销）</del>}
                  {heroPose === 'listening' && '点头倾听，未指示准备追问。'}
                </p>
              </div>
            </div>

            <p className="text-xs text-ink-3 leading-relaxed">
              石膏医生用前倾、点头和侧光表达对话状态。演练中可以查看医生的判断与追问准备过程。
            </p>
          </div>
        </section>

        {/* ===================== THREE PILLARS ===================== */}
        <section className="border-t border-line pt-16 space-y-10">
          <div className="space-y-2">
            <span className="font-mono text-xs font-bold tracking-widest text-ink-3 uppercase">CORE PRINCIPLES</span>
            <h2 className="text-3xl font-bold tracking-tight text-ink">三大底层创新</h2>
            <p className="text-ink-2 text-sm max-w-2xl leading-relaxed">
              从传统回合制问答与硬编码打断，走向基于上下文与双层并行的实时认知系统。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-line bg-surface p-6 rounded-[2px] space-y-3">
              <div className="w-9 h-9 rounded-[2px] bg-ground-2 flex items-center justify-center text-ink">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-ink">实时理解 · 不等句号</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                你说话时，System 1 持续判断你是否回应了医生的关切，并选择继续听、准备追问或发起追问。
              </p>
            </div>

            <div className="border border-line bg-surface p-6 rounded-[2px] space-y-3">
              <div className="w-9 h-9 rounded-[2px] bg-ground-2 flex items-center justify-center text-ink">
                <Brain className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-ink">结合上下文 · 自然回应</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                System 2 根据医生的风格、已听到的对话和临床资料准备回应。你补正后，已准备的追问可以撤销；结束时，医生说明自己的态度和依据。
              </p>
            </div>

            <div className="border border-line bg-surface p-6 rounded-[2px] space-y-3">
              <div className="w-9 h-9 rounded-[2px] bg-ground-2 flex items-center justify-center text-ink">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-ink">动态撤销 · 不进历史</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                你主动补充证据后，医生会重新判断已准备的追问。撤销的内容保留在复盘中，帮助你看清自己的表达如何改变了对话。
              </p>
            </div>
          </div>
        </section>

        {/* ===================== SCAFFOLDING & FADING ===================== */}
        <section className="border border-line bg-surface rounded-[2px] p-8 space-y-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4 border-b border-line pb-6">
            <div className="space-y-1">
              <span className="font-mono text-xs font-bold tracking-widest text-held uppercase">PEDAGOGICAL DESIGN</span>
              <h2 className="text-2xl font-bold text-ink">科学带教：阶梯式辅助与独立能力内化</h2>
              <p className="text-xs text-ink-2">
                解决 PNAS 警告的“AI 代劳陷阱”：辅助不是目的，让代表在撤除 AI 后也能独立应对才是目的。
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Scaffolding → Fading → Mastery
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="p-4 bg-ground-2/50 border border-line rounded-[2px] space-y-2">
              <strong className="block text-ink font-bold text-sm">阶段 1 · 表现模式 (Performance)</strong>
              <p className="text-ink-2 leading-relaxed">
                实时伴随 HUD 提供临床试验数据出处、亚组数字速查与关键策略建议，帮助新手代表在保护下推进行动。
              </p>
            </div>
            <div className="p-4 bg-ground-2/50 border border-line rounded-[2px] space-y-2">
              <strong className="block text-ink font-bold text-sm">阶段 2 · 微信号提示 (Minimal Cue)</strong>
              <p className="text-ink-2 leading-relaxed">
                逐步撤除详细文本，仅保留极简关键词与红线禁忌指示，促使代表主动回忆资料细节。
              </p>
            </div>
            <div className="p-4 bg-ground-2/50 border border-line rounded-[2px] space-y-2">
              <strong className="block text-ink font-bold text-sm">阶段 3 · 独立挑战 (Independent)</strong>
              <p className="text-ink-2 leading-relaxed">
                彻底撤除所有外部提示，代表凭借内化知识直面医生追问。结束后在复盘室深入分析并“变式再练”。
              </p>
            </div>
          </div>
        </section>

        {/* ===================== SCENARIO SYNTHESIS & TEAM FLYWHEEL ===================== */}
        <section className="space-y-8 border-t border-line pt-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <span className="font-mono text-xs font-bold tracking-widest text-held uppercase">SCENARIO SYNTHESIS &amp; TEAM ASSETS</span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                AI 自动情境合成 · 团队经验沉淀飞轮
              </h2>
              <p className="text-xs sm:text-sm text-ink-2 max-w-2xl leading-relaxed">
                针对传统培训成本高、脱离真实市场的痛点。AI 自动合成含真实医生情境的拜访演练素材，把老资历实战经验转化为结构化认知模型，让新人低成本反复演练，沉淀为团队群体竞争力。
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsSynthesizerOpen(true)}
              className="text-xs h-9 gap-1.5 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 自动合成新演练素材</span>
            </Button>
          </div>

          {/* 经验沉淀转化条：老代表隐性经验 -> AI 结构化演练素材 -> 新人实战肌肉记忆 */}
          <div className="p-5 bg-ground-2/50 border border-line rounded-[2px] grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-ink font-bold">
                <UserCheck className="w-4 h-4 text-held" />
                <span>1. 资深老代表经验萃取</span>
              </div>
              <p className="text-ink-2 leading-relaxed text-[11px]">
                整理资深代表的拜访经验，帮助练习者选择回应顺序、补充证据，并识别需要改进的表达。
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-ink font-bold">
                <Brain className="w-4 h-4 text-ink" />
                <span>2. AI 自动合成高保真情境</span>
              </div>
              <p className="text-ink-2 leading-relaxed text-[11px]">
                智能体将药械文献指南与医生偏好参数结合，自动派生关切逻辑树、突发打断点与禁忌陷阱，素材生成成本趋近于零。
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-ink font-bold">
                <RefreshCw className="w-4 h-4 text-resolved" />
                <span>3. 新人低成本反复实战</span>
              </div>
              <p className="text-ink-2 leading-relaxed text-[11px]">
                新代表在带智能反馈的演练中抗打断、学应变；复盘时对照销冠最佳实践与决策时序，把个体经验内化为群体竞争力。
              </p>
            </div>
          </div>

          {/* 演练素材库卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              onClick={() => onNavigate('live')}
              className="group border border-line hover:border-ink bg-surface p-6 rounded-[2px] cursor-pointer transition-all space-y-4"
            >
              <div className="flex items-center justify-between">
                <Badge variant="held">已合成 · 立即演练</Badge>
                <span className="text-xs font-mono text-ink-3">68s · 核心片段</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-ink group-hover:underline">
                  心内科门诊 · 适用范围拜访
                </h3>
                <p className="text-xs text-ink-2">陈主任 · 心内科门诊 · 严谨学术型</p>
              </div>
              <p className="text-xs text-ink-3 leading-relaxed">
                降压药“安舒平”ANSHU-3 循证拜访。融入销冠防打断规则，医生突然追问 75 岁以上高龄及 eGFR &lt; 60 肾功能人群证据。
              </p>
              <Button variant="quiet" size="sm" className="w-full text-xs">
                开启演练
              </Button>
            </div>

            <div className="border border-line/60 bg-surface/50 p-6 rounded-[2px] opacity-75 space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">肿瘤线 · 规划中</Badge>
                <span className="text-xs font-mono text-ink-3">专科线</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-ink">肿瘤免疫联合靶向循证沟通</h3>
                <p className="text-xs text-ink-2">林主任 · 肿瘤科 · 学术钻研型</p>
              </div>
              <p className="text-xs text-ink-3 leading-relaxed">
                针对晚期非鳞状 NSCLC 一线联合方案的无进展生存期（PFS）获益数据与严重 irAE 应急处理规范展开深度对话。
              </p>
            </div>

            <div className="border border-line/60 bg-surface/50 p-6 rounded-[2px] opacity-75 space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">代谢线 · 规划中</Badge>
                <span className="text-xs font-mono text-ink-3">专科线</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-ink">PCSK9 抑制剂降脂与心血管事件获益</h3>
                <p className="text-xs text-ink-2">郭主任 · 心内科 · 务实紧迫型</p>
              </div>
              <p className="text-xs text-ink-3 leading-relaxed">
                医生门诊时间压缩至 2 分钟，要求代表直接针对他汀不耐受冠心病患者拿出降低 LDL-C 的硬终点循证证据。
              </p>
            </div>
          </div>
        </section>

        {/* 呼出 AI 合成弹窗 */}
        <ScenarioSynthesizerModal
          isOpen={isSynthesizerOpen}
          onClose={() => setIsSynthesizerOpen(false)}
          onSynthesizeAndStart={(scenario) => {
            setIsSynthesizerOpen(false);
            onNavigate('live');
          }}
        />

      </main>
    </div>
  );
};

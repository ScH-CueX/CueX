import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Brain, Upload, X, Check, ArrowRight, UserCheck } from 'lucide-react';
import type { TrainingScenarioDef } from '@cuex/protocol';

interface ScenarioSynthesizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynthesizeAndStart: (scenario: TrainingScenarioDef) => void;
}

export const ScenarioSynthesizerModal: React.FC<ScenarioSynthesizerModalProps> = ({
  isOpen,
  onClose,
  onSynthesizeAndStart,
}) => {
  const [docStyle, setDocStyle] = useState<'rigorous' | 'impatient' | 'exploratory'>('rigorous');
  const [timeWindow, setTimeWindow] = useState<number>(60);
  const [includeSeniorExperience, setIncludeSeniorExperience] = useState<boolean>(true);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesizedScenario, setSynthesizedScenario] = useState<TrainingScenarioDef | null>(null);

  if (!isOpen) return null;

  const handleSynthesize = () => {
    setIsSynthesizing(true);

    setTimeout(() => {
      const result: TrainingScenarioDef = {
        id: `synth-${Date.now()}`,
        productName: '安舒平',
        packTitle: '安舒平 · 降压适应证临床资料包',
        studyName: 'ANSHU-3 多中心循证研究',
        doctor: {
          id: 'doc-synth-01',
          name: '陈主任',
          department: '心内科',
          title: '主任医师',
          style: docStyle,
          timeConstraintSec: timeWindow,
          skepticismLevel: 'high',
          note: '看重安全性与特殊亚组，听到空谈获益必打断',
        },
        sceneTitle: '门诊快速拜访 · 临床适用范围质询',
        concerns: [
          {
            id: 'c-synth-1',
            title: '高龄与肾功能亚组适用证据',
            anchorSpeaker: 'doctor',
            points: [
              { id: 'p1', label: '75 岁以上高龄占比 (11%)', anchorQuestion: '高龄患者有多少？' },
              { id: 'p2', label: 'eGFR 30–60 亚组降幅 (412例)', anchorQuestion: '中度肾功能不全患者数据呢？' },
              { id: 'p3', label: 'eGFR < 30 禁忌症排除说明', anchorQuestion: '重度肾衰能用吗？' },
            ],
          },
        ],
        expertRules: includeSeniorExperience
          ? [
              {
                id: 'exp-01',
                sourceSeniorRep: '李主管（5年销售冠军）',
                scenarioContext: '周三上午心内科大门诊，候诊患者超50人',
                goldenTactic: '开场30秒内直给亚组客观数字，绝不强行下定论，顺带反问剂量调整建议。',
                antiPatternWarning: '面对陈主任切忌背诵总体降压幅度与安全性，否则在第20秒必被追问打断。',
              },
            ]
          : [],
        syntheticProvenance: {
          synthesizedAt: new Date().toLocaleTimeString(),
          sourceDocument: 'ANSHU-3-Clinical-Report.pdf',
          model: 'PiAgent Scenario Synthesizer',
        },
      };

      setSynthesizedScenario(result);
      setIsSynthesizing(false);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-line rounded-[2px] shadow-2xl overflow-hidden flex flex-col text-xs text-ink">
        {/* Modal 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-ground-2/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-held" />
            <span className="font-bold text-sm tracking-tight text-ink">
              AI 自动合成实战演练素材 · 团队经验沉淀
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-ground-2 rounded-[2px] text-ink-3 hover:text-ink"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal 内容 */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {!synthesizedScenario ? (
            <>
              {/* 1. 资料包与文献 */}
              <div className="space-y-2">
                <span className="font-bold text-ink block text-xs">1. 选择产品资料包与文献来源</span>
                <div className="p-3 bg-ground-2/40 border border-line rounded-[2px] flex items-center justify-between">
                  <div className="space-y-0.5">
                    <strong className="block text-ink font-semibold">安舒平 · ANSHU-3 临床文献与说明书 (默认)</strong>
                    <span className="text-ink-3 text-[11px]">包含入组标准、多终点数据、亚组分析及肾功能禁忌</span>
                  </div>
                  <Badge variant="outline" className="text-[11px]">已挂载</Badge>
                </div>
              </div>

              {/* 2. 真实医生情境特征配置 */}
              <div className="space-y-2">
                <span className="font-bold text-ink block text-xs">2. 设定真实门诊医生情境</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 p-3 bg-ground-2/30 border border-line rounded-[2px]">
                    <span className="text-ink-3 text-[11px] block">医生性格与质询风格</span>
                    <div className="seg w-full text-center" role="group">
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={docStyle === 'rigorous'}
                        onClick={() => setDocStyle('rigorous')}
                      >
                        严谨学术型
                      </button>
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={docStyle === 'impatient'}
                        onClick={() => setDocStyle('impatient')}
                      >
                        急躁紧迫型
                      </button>
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={docStyle === 'exploratory'}
                        onClick={() => setDocStyle('exploratory')}
                      >
                        探索质疑型
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 p-3 bg-ground-2/30 border border-line rounded-[2px]">
                    <span className="text-ink-3 text-[11px] block">门诊时间窗口压力</span>
                    <div className="seg w-full text-center" role="group">
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={timeWindow === 45}
                        onClick={() => setTimeWindow(45)}
                      >
                        45 秒极限
                      </button>
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={timeWindow === 60}
                        onClick={() => setTimeWindow(60)}
                      >
                        60 秒标准
                      </button>
                      <button
                        type="button"
                        className="flex-1"
                        aria-pressed={timeWindow === 90}
                        onClick={() => setTimeWindow(90)}
                      >
                        90 秒充裕
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. 注入老代表沉淀实战经验 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink block text-xs">3. 融合老资历销冠沉淀经验（个体经验 → 团队竞争力）</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-ink-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={includeSeniorExperience}
                      onChange={(e) => setIncludeSeniorExperience(e.target.checked)}
                      className="accent-ink"
                    />
                    <span>启用资深代表经验库</span>
                  </label>
                </div>

                {includeSeniorExperience && (
                  <div className="p-3 bg-ground-2/50 border-l-2 border-held rounded-[2px] space-y-1.5">
                    <div className="flex items-center gap-1.5 text-ink font-semibold">
                      <UserCheck className="w-3.5 h-3.5 text-held" />
                      <span>李主管（大区 5 年销售冠军）实战心得注入</span>
                    </div>
                    <p className="text-ink-2 leading-relaxed text-[11px]">
                      “陈主任在面对代表空谈大样本获益时极为反感，通常在第 20 秒打断；若直接回应 75 岁及 30–60 亚组数字，他会点头继续听。”
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Button
                  variant="default"
                  size="default"
                  onClick={handleSynthesize}
                  disabled={isSynthesizing}
                  className="w-full text-xs h-10 gap-2"
                >
                  <Brain className="w-4 h-4" />
                  <span>{isSynthesizing ? 'AI 智能体正在合成实战演练素材...' : '立即由 AI 自动合成演练素材'}</span>
                </Button>
              </div>
            </>
          ) : (
            /* 合成成功展示卡 */
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-3 bg-resolved-tint/50 border border-resolved/40 rounded-[2px] flex items-center gap-2 text-resolved font-medium">
                <Check className="w-4 h-4" />
                <span>演练素材已成功由 AI 合成，并沉淀入团队实战库！</span>
              </div>

              <div className="border border-line bg-surface p-4 rounded-[2px] space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-bold text-ink">{synthesizedScenario.sceneTitle}</strong>
                  <Badge variant="held">合成演练素材</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-ink-2 text-[11px]">
                  <div>医生：{synthesizedScenario.doctor.name}（{synthesizedScenario.doctor.style === 'rigorous' ? '严谨学术型' : '急躁型'}）</div>
                  <div>时间限制：{synthesizedScenario.doctor.timeConstraintSec} 秒门诊窗口</div>
                </div>

                <div className="space-y-1 border-t border-line/60 pt-2">
                  <span className="font-semibold text-ink text-[11px] block">合成的关切核心与追问陷阱：</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-ink-3 text-[11px]">
                    <li>第 20 秒代表若仅介绍获益，医生将前倾追问高龄人群证据</li>
                    <li>包含 eGFR &lt; 30 禁忌症撤销追问机制，检验代表是否自主补正</li>
                  </ul>
                </div>

                {synthesizedScenario.expertRules && synthesizedScenario.expertRules.length > 0 && (
                  <div className="p-2.5 bg-ground-2/50 rounded-[2px] border border-line text-[11px] text-ink-2 space-y-1">
                    <span className="font-bold text-ink block">已融合老代表实战经验：</span>
                    <p className="text-ink-3">{synthesizedScenario.expertRules[0].goldenTactic}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => setSynthesizedScenario(null)}
                  className="flex-1 text-xs"
                >
                  重新配置
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onSynthesizeAndStart(synthesizedScenario)}
                  className="flex-1 text-xs gap-1.5"
                >
                  <span>立即进入该场景演练</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

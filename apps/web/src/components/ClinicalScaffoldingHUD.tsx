import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ShieldAlert, ChevronRight, ChevronLeft, Sparkles, EyeOff } from 'lucide-react';

export type ScaffoldingLevel = 'full' | 'minimal' | 'faded';

interface ClinicalScaffoldingHUDProps {
  currentSec: number;
  level: ScaffoldingLevel;
  onLevelChange: (level: ScaffoldingLevel) => void;
  className?: string;
}

export const ClinicalScaffoldingHUD: React.FC<ClinicalScaffoldingHUDProps> = ({
  currentSec,
  level,
  onLevelChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // 处于完全撤除辅助（Faded / Independent）模式时，保持静默状态
  if (level === 'faded') {
    return (
      <div className={cn('flex items-center gap-2 p-2 bg-ground-2/50 border border-line rounded-[2px] text-xs', className)}>
        <EyeOff className="w-3.5 h-3.5 text-ink-3" />
        <span className="text-ink-3">独立挑战模式 · 已撤除所有外部提示</span>
        <button
          type="button"
          onClick={() => onLevelChange('full')}
          className="ml-auto text-ink hover:underline text-[11px] font-medium"
        >
          开启辅助
        </button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'border border-line bg-surface/95 backdrop-blur-sm rounded-[2px] shadow-sm transition-all duration-200 overflow-hidden text-xs',
        isOpen ? 'w-full' : 'w-auto',
        className
      )}
      aria-label="实时认知辅助系统"
    >
      {/* HUD 头部栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-line bg-ground-2/40">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-ink" />
          <span className="font-bold text-ink">临场辅助</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* 辅助等级切换 */}
          <div className="seg" role="group" aria-label="辅助等级">
            <button
              type="button"
              aria-pressed={level === 'full'}
              onClick={() => onLevelChange('full')}
              className="text-[11px] h-6 px-2"
              title="全量辅助：提供资料出处与应对策略"
            >
              全量
            </button>
            <button
              type="button"
              aria-pressed={level === 'minimal'}
              onClick={() => onLevelChange('minimal')}
              className="text-[11px] h-6 px-2"
              title="微信号：仅提供关键数据点与红线"
            >
              轻提示
            </button>
            <button
              type="button"
              aria-pressed={false}
              onClick={() => onLevelChange('faded')}
              className="text-[11px] h-6 px-2"
              title="撤除辅助：独立无提示完成训练"
            >
              撤除
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 hover:bg-ground-2 rounded-[2px] text-ink-2"
            aria-label={isOpen ? '收起辅助托盘' : '展开辅助托盘'}
          >
            {isOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* HUD 内容主体 */}
      {isOpen && (
        <div className="p-4 space-y-4">
          {/* 实时情境应对战术（伴随式提示） */}
          {level === 'full' && currentSec >= 23.5 && currentSec < 36.4 && (
            <div className="p-3 bg-held-tint/60 border-l-2 border-held rounded-[2px] space-y-1 animate-in fade-in">
              <div className="flex items-center gap-1.5 text-held-ink font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>即时应对策略</span>
              </div>
              <p className="text-ink leading-relaxed">
                陈主任关心高龄与肾功能人群。先直给亚组证据比例，再回到主要终点。
              </p>
            </div>
          )}

          {/* 临床证据速查卡（ANSHU-3 获批证据） */}
          {level === 'full' ? <div className="space-y-2">
            <div className="flex items-center justify-between text-ink-3 text-[11px]">
              <span className="font-semibold uppercase tracking-wider">证据出处 · ANSHU-3 亚组</span>
              <span className="font-mono">P.14 表 3-2</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-ink">
              <div className="p-2.5 bg-ground-2/50 border border-line rounded-[2px] space-y-0.5">
                <span className="text-[11px] text-ink-3 block">75 岁以上人群</span>
                <span className="font-bold text-sm text-ink block font-mono">11% 占比</span>
                <span className="text-[10px] text-ink-2 block">降幅与总体一致 (-6.2 mmHg)</span>
              </div>
              <div className="p-2.5 bg-ground-2/50 border border-line rounded-[2px] space-y-0.5">
                <span className="text-[11px] text-ink-3 block">eGFR 30–60 亚组</span>
                <span className="font-bold text-sm text-ink block font-mono">412 例</span>
                <span className="text-[10px] text-ink-2 block">肾功能不全无需减量</span>
              </div>
            </div>
          </div> : <p className="text-sm leading-relaxed text-ink">先回应适用范围，再说明证据边界。</p>}

          {/* 合规与安全红线提醒 */}
          <div className="p-2.5 bg-ground-2/40 border border-line/80 rounded-[2px] flex items-start gap-2 text-ink-2">
            <ShieldAlert className="w-4 h-4 text-held shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="block text-ink text-[11px]">合规红线禁忌</strong>
              <p className="text-[11px] leading-relaxed text-ink-3">
                eGFR &lt; 30 患者被排除在入组之外，说明书不建议使用，严禁超适应证推荐。
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

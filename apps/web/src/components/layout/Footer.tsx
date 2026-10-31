import React from 'react';
import type { ViewKey } from './Navbar';

interface FooterProps {
  onSelectView?: (view: ViewKey) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectView }) => {
  return (
    <footer className="w-full border-t border-line mt-20 pt-8 pb-12 bg-ground-2/40 text-ink-2 text-xs">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-ink-3 leading-relaxed">
          <div>
            <strong className="block text-ink font-semibold mb-1">CueX 认知伴随架构</strong>
            <p className="text-[11px]">
              基于 TypeScript 全栈架构设计，集成 Jev 快速决策引擎、PiAgent 深度智能体基座与双向流式音视频管道。
            </p>
          </div>
          <div>
            <strong className="block text-ink font-semibold mb-1">科学渐隐带教 (Scaffolding & Fading)</strong>
            <p className="text-[11px]">
              融合表现模式临床 HUD 伴随提示与学习模式彻底撤除辅助机制，保障代表在现实无 AI 环境中的独立应对能力。
            </p>
          </div>
          <div>
            <strong className="block text-ink font-semibold mb-1">模拟与虚构声明</strong>
            <p className="text-[11px]">
              当前演练案例中的安舒平、ANSHU-3 研究及心内科陈主任均为模拟用例，专用于临场应对训练与算法验证。
            </p>
          </div>
        </div>

        {onSelectView && (
          <div className="pt-6 border-t border-line/60 flex flex-wrap items-center justify-between gap-4 text-ink-3 text-[11px]">
            <span translate="no">CueX · Real-Time Conversation Training</span>
            <div className="flex items-center gap-6">
              <button type="button" onClick={() => onSelectView('home')} className="hover:text-ink hover:underline">
                产品首页
              </button>
              <button type="button" onClick={() => onSelectView('live')} className="hover:text-ink hover:underline">
                实时演练室
              </button>
              <button type="button" onClick={() => onSelectView('review')} className="hover:text-ink hover:underline">
                对谈复盘室
              </button>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
};

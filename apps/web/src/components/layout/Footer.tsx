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
            <strong className="block text-ink font-semibold mb-1">有依据的医生回应</strong>
            <p className="text-[11px]">
              医生结合资料和你的表达回应、追问，并在你补正后撤销已准备的追问。
            </p>
          </div>
          <div>
            <strong className="block text-ink font-semibold mb-1">科学渐隐带教 (Scaffolding & Fading)</strong>
            <p className="text-[11px]">
              融合表现模式临床 HUD 伴随提示与学习模式彻底撤除辅助机制，保障代表在现实无 AI 环境中的独立应对能力。
            </p>
          </div>
          <div>
            <strong className="block text-ink font-semibold mb-1">训练场景</strong>
            <p className="text-[11px]">
              以模拟临床资料和医生角色练习拜访。每次结束后，回看医生的态度、判断依据和下一步建议。
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
                复盘示例
              </button>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
};

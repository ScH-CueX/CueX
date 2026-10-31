import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ViewKey = 'home' | 'live' | 'review';

interface NavbarProps {
  currentView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  className?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onSelectView, className }) => {
  const navItems: { key: ViewKey; label: string }[] = [
    { key: 'home', label: '首页' },
    { key: 'live', label: '实时演练' },
    { key: 'review', label: '对谈复盘' },
  ];

  return (
    <header className={cn('w-full border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40', className)}>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onSelectView('home')}
          className="flex items-center gap-2 text-ink hover:opacity-80 transition-opacity"
          aria-label="CueX 首页"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
            <rect x="1" y="1" width="22" height="22" rx="2" fill="#141716" />
            <path d="M6 9.5h12M6 14.5h6.5M15 14.5h3" stroke="#ecede8" strokeWidth="2" />
          </svg>
          <span className="font-bold tracking-tight text-lg font-ui" translate="no">CueX</span>
          <span className="text-[10px] text-ink-3 uppercase tracking-widest hidden sm:inline ml-1">Training Platform</span>
        </button>

        <nav className="flex items-center gap-1.5" aria-label="主导航">
          {navItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectView(item.key)}
                className={cn(
                  'px-3.5 py-1.5 text-xs sm:text-sm rounded-[2px] transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-ink text-ground font-medium'
                    : 'text-ink-2 hover:bg-ground-2 hover:text-ink'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

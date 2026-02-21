'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface InlineTab {
  id: string;
  label: string;
  count?: number;
}

interface InlineTabsProps {
  tabs: InlineTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  size?: 'sm' | 'md';
}

export function InlineTabs({ tabs, activeTab, onTabChange, size = 'md' }: InlineTabsProps) {
  return (
    <div className="inline-flex items-center bg-warm-100 p-1 rounded-xl overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-nowrap snap-x snap-mandatory">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'relative transition-colors rounded-lg font-medium flex-shrink-0 snap-center',
            size === 'sm' ? 'px-3 py-2.5 md:py-1.5 text-xs' : 'px-4 py-2.5 md:py-2 text-sm',
            activeTab === tab.id ? 'text-warm-900' : 'text-warm-500 hover:text-warm-700'
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="inline-tab-bg"
              className="absolute inset-0 bg-white rounded-lg shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-xs',
                activeTab === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-warm-200 text-warm-600'
              )}>
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

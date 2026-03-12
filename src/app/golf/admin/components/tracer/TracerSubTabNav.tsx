'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { TracerSubTab, TracerSubTabConfig } from './tracer-types';

// ============================================================================
// TRACER SUB-TAB NAVIGATION
// ============================================================================

interface TracerSubTabNavProps {
  tabs: TracerSubTabConfig[];
  activeTab: TracerSubTab;
  onTabChange: (tab: TracerSubTab) => void;
}

export function TracerSubTabNav({ tabs, activeTab, onTabChange }: TracerSubTabNavProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-warm-100/50 rounded-xl max-w-full overflow-x-auto w-fit">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isErrorTab = tab.id === 'errors';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              isActive
                ? 'text-warm-900'
                : 'text-warm-500 hover:text-warm-700'
            )}
          >
            {/* Animated active indicator */}
            {isActive && (
              <motion.div
                layoutId="tracer-tab-indicator"
                className="absolute inset-0 bg-white shadow-sm rounded-lg"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}

            {/* Tab label */}
            <span className="relative z-10">{tab.label}</span>

            {/* Badge */}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className={cn(
                  'relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold tabular-nums leading-none',
                  isErrorTab
                    ? 'bg-red-500 text-white'
                    : 'bg-warm-200 text-warm-600'
                )}
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

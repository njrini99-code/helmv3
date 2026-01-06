'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  defaultTab?: string;
  children: (activeTab: string) => ReactNode;
  className?: string;
  variant?: 'underline' | 'pill' | 'segment';
}

export function AnimatedTabs({
  tabs,
  defaultTab,
  children,
  className,
  variant = 'underline'
}: AnimatedTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab || tabs[0]?.id || '');

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (nextTab) {
        setActiveTab(nextTab.id);
      }
    }
  };

  return (
    <div className={className}>
      {/* Tab List */}
      <LayoutGroup>
        <div
          role="tablist"
          aria-label="Content tabs"
          className={cn(
            'relative flex',
            variant === 'segment' && 'bg-slate-100 p-1 rounded-xl gap-1',
            variant === 'underline' && 'border-b border-slate-200 gap-1',
            variant === 'pill' && 'gap-2'
          )}
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors z-10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2',
                variant === 'segment' && 'rounded-lg flex-1',
                variant === 'underline' && 'pb-3',
                variant === 'pill' && 'rounded-full',
                activeTab === tab.id
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {tab.icon}
                {tab.label}
              </span>

              {/* Animated indicator */}
              {activeTab === tab.id && (
                <motion.div
                  layoutId={`tab-indicator-${variant}`}
                  className={cn(
                    'absolute inset-0',
                    variant === 'segment' && 'bg-white rounded-lg shadow-sm',
                    variant === 'underline' && 'bottom-0 left-0 right-0 h-0.5 top-auto bg-green-600 rounded-full',
                    variant === 'pill' && 'bg-slate-900 rounded-full'
                  )}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {/* Tab Content with AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={activeTab}
          tabIndex={0}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30
          }}
          className="mt-6"
        >
          {children(activeTab)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

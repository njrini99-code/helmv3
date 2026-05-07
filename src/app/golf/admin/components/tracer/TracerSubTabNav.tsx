'use client';

import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Tabs
      value={activeTab}
      onChange={(v) => onTabChange(v as TracerSubTab)}
    >
      <TabsList className="max-w-full overflow-x-auto bg-warm-100/50">
        {tabs.map((tab) => {
          const isErrorTab = tab.id === 'errors';
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              badge={
                tab.badge != null && tab.badge > 0
                  ? tab.badge > 99
                    ? '99+'
                    : tab.badge
                  : undefined
              }
              className={cn(isErrorTab && 'data-[state=inactive]:text-red-500')}
            >
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

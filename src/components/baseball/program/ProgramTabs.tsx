'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconBuilding, IconUsers } from '@/components/icons';

interface ProgramTabsProps {
  overviewContent: React.ReactNode;
  rosterContent: React.ReactNode;
  coachType?: string; // For roster visibility control
}

type TabType = 'overview' | 'roster';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProgramTabs({ overviewContent, rosterContent, coachType: _coachType }: ProgramTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <IconBuilding size={16} /> },
    { id: 'roster', label: 'Roster', icon: <IconUsers size={16} /> },
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center',
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && overviewContent}
        {activeTab === 'roster' && rosterContent}
      </div>
    </div>
  );
}

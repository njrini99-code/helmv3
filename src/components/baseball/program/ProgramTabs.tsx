'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconBuilding, IconUsers } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface ProgramTabsProps {
  overviewContent: React.ReactNode;
  rosterContent: React.ReactNode;
  coachType?: string; // For roster visibility control
}

type TabType = 'overview' | 'roster';

 
export function ProgramTabs({ overviewContent, rosterContent, coachType: _coachType }: ProgramTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Details', icon: <IconBuilding size={16} /> },
    { id: 'roster', label: 'Roster', icon: <IconUsers size={16} /> },
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-warm-100 rounded-xl mb-6">
        {tabs.map((tab) => (
          <Button variant="ghost"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center',
              activeTab === tab.id
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </Button>
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

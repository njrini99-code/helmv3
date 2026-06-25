'use client';

// =============================================================================
// src/app/lifting/(dashboard)/dashboard/check-ins/check-ins-client.tsx
//
// Client shell for the Check-Ins Schedules page.
// Three tabs: Soreness | Weight | Nutrition.
// Each tab hosts its corresponding builder component inline (no modals needed
// at this surface — the builders are self-contained forms).
// =============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Scale, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SorenessScheduleBuilder } from '@/components/lifting/soreness/SorenessScheduleBuilder';
import { WeightCheckInScheduleBuilder } from '@/components/lifting/weight/WeightCheckInScheduleBuilder';
import { NutritionPlanUploader } from '@/components/lifting/nutrition/NutritionPlanUploader';
import type { LiftingGroupOption, LiftingAthleteOption } from '@/components/lifting/weight/WeightCheckInScheduleBuilder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'soreness' | 'weight' | 'nutrition';

interface Props {
  orgId: string;
  sport: 'baseball' | 'golf';
  groups: LiftingGroupOption[];
  athletes: LiftingAthleteOption[];
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'soreness', label: 'Soreness Checks', icon: Activity },
  { key: 'weight',   label: 'Weight Check-Ins', icon: Scale },
  { key: 'nutrition', label: 'Nutrition Plans', icon: Utensils },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckInsPageClient({ orgId, sport, groups, athletes }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('soreness');
  // Track created IDs for success state display
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-warm-900 sm:text-3xl">
          Check-In Schedules
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Schedule soreness checks and weight check-ins, or upload nutrition plans.
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl bg-warm-100/70 p-1"
        role="tablist"
        aria-label="Check-in builder sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              variant="ghost"
              onClick={() => {
                setActiveTab(tab.key);
                setLastCreated(null);
              }}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60',
                isActive
                  ? 'bg-cream-50 text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-700',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="check-in-tab-indicator"
                  className="absolute inset-0 rounded-xl bg-cream-50 shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div>
        {activeTab === 'soreness' && (
          <SorenessScheduleBuilder
            orgId={orgId}
            sport={sport}
            onClose={() => undefined}
            onSaved={(id) => setLastCreated(id)}
          />
        )}

        {activeTab === 'weight' && (
          <WeightCheckInScheduleBuilder
            orgId={orgId}
            sport={sport}
            groups={groups}
            athletes={athletes}
            onSuccess={(id) => setLastCreated(id)}
            onCancel={() => undefined}
          />
        )}

        {activeTab === 'nutrition' && (
          <NutritionPlanUploader
            orgId={orgId}
            onSuccess={(id) => setLastCreated(id)}
            onCancel={() => undefined}
          />
        )}
      </div>

      {lastCreated && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          Saved successfully (id: {lastCreated}).
        </div>
      )}
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';

type LifecycleStage =
  | 'brand_new'
  | 'onboarding'
  | 'active'
  | 'engaged'
  | 'power_user'
  | 'at_risk'
  | 'churned'
  | 'dormant';

interface LifecycleBadgeProps {
  stage: LifecycleStage;
  className?: string;
}

const stageConfig: Record<LifecycleStage, { label: string; color: string }> = {
  brand_new: { label: 'Brand New', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  onboarding: { label: 'Onboarding', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  active: { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200' },
  engaged: { label: 'Engaged', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  power_user: { label: 'Power User', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  at_risk: { label: 'At Risk', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  churned: { label: 'Churned', color: 'bg-red-50 text-red-700 border-red-200' },
  dormant: { label: 'Dormant', color: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const stageDotColors: Record<LifecycleStage, string> = {
  brand_new: 'bg-blue-500',
  onboarding: 'bg-indigo-500',
  active: 'bg-green-500',
  engaged: 'bg-emerald-500',
  power_user: 'bg-violet-500',
  at_risk: 'bg-amber-500',
  churned: 'bg-red-500',
  dormant: 'bg-gray-400',
};

export function LifecycleBadge({ stage, className }: LifecycleBadgeProps) {
  const config = stageConfig[stage];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border text-xs font-medium px-2.5 py-1 whitespace-nowrap',
        config.color,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', stageDotColors[stage])} />
      {config.label}
    </span>
  );
}

'use client';

import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';

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

// stage → label + color-faithful Badge tone. green/emerald/blue/indigo/violet
// are kept DISTINCT (never flattened to one "positive"/"info" tone).
const stageConfig: Record<LifecycleStage, { label: string; tone: BadgeTone }> = {
  brand_new: { label: 'Brand New', tone: 'blue' },
  onboarding: { label: 'Onboarding', tone: 'indigo' },
  active: { label: 'Active', tone: 'green' },
  engaged: { label: 'Engaged', tone: 'emerald' },
  power_user: { label: 'Power User', tone: 'violet' },
  at_risk: { label: 'At Risk', tone: 'amber' },
  churned: { label: 'Churned', tone: 'red' },
  dormant: { label: 'Dormant', tone: 'warm' },
};

export function LifecycleBadge({ stage, className }: LifecycleBadgeProps) {
  const config = stageConfig[stage];

  return (
    <Badge
      tone={config.tone}
      size="none"
      showDot
      className={cn('text-xs px-2.5 py-1 whitespace-nowrap', className)}
    >
      {config.label}
    </Badge>
  );
}

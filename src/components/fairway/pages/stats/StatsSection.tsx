'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MotionDiv, MotionSection, useStatsMotion } from './fairway-stats-motion';

const ACCENT: Record<string, string> = {
  default: 'border-l-border-subtle',
  accent: 'border-l-accent-600',
  driving: 'border-l-sky-500',
  approach: 'border-l-amber-500',
  putting: 'border-l-emerald-600',
  scrambling: 'border-l-stone-400',
  scoring: 'border-l-violet-500',
};

export interface StatsSectionProps {
  title: string;
  description?: string;
  accent?: keyof typeof ACCENT;
  children: ReactNode;
  className?: string;
}

/** Section block with a left accent rail for scan hierarchy. */
export function StatsSection({
  title,
  description,
  accent = 'default',
  children,
  className,
}: StatsSectionProps) {
  const motion = useStatsMotion();

  return (
    <MotionSection
      className={cn(
        'flex flex-col gap-4 border-l-2 pl-4',
        ACCENT[accent] ?? ACCENT.default,
        className,
      )}
      {...motion.section}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-fw-display text-h3 font-medium tracking-[-0.01em] text-text-primary">
          {title}
        </h3>
        {description ? (
          <p className="font-fw-sans text-body-sm text-text-tertiary">{description}</p>
        ) : null}
      </div>
      {children}
    </MotionSection>
  );
}

/** Staggered grid wrapper for KPI tiles, cards, rows. */
export function StatsStaggerGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const motion = useStatsMotion();
  return (
    <MotionDiv className={className} {...motion.container}>
      {children}
    </MotionDiv>
  );
}

/** Single stagger child — pair with StatsStaggerGrid. */
export function StatsStaggerItem({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const motion = useStatsMotion();
  return (
    <MotionDiv className={className} {...motion.item} {...motion.tile}>
      {children}
    </MotionDiv>
  );
}

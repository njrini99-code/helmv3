'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GAME_AREA_DEFS, type GameAreaId } from './player-stats-theme';

export interface StatsAreaPanelProps {
  area: GameAreaId;
  children: ReactNode;
  className?: string;
}

/** Colored header band + content well for a single game-area drill-down. */
export function StatsAreaPanel({ area, children, className }: StatsAreaPanelProps) {
  const def = GAME_AREA_DEFS.find((d) => d.id === area) ?? GAME_AREA_DEFS[0]!;
  const Icon = def.icon;

  return (
    <div className={cn('overflow-hidden rounded-card border border-border-subtle bg-surface shadow-soft', className)}>
      <div
        className={cn(
          'flex items-center gap-3 border-b border-border-subtle bg-gradient-to-r px-4 py-3 sm:px-5',
          def.header,
        )}
      >
        <span className={cn('grid h-9 w-9 place-items-center rounded-fw-md border', def.tint, def.border)}>
          <Icon className={cn('h-4 w-4', def.iconColor)} aria-hidden />
        </span>
        <div>
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">Game area</p>
          <h3 className="font-fw-display text-h3 font-medium text-text-primary">{def.label}</h3>
        </div>
      </div>
      <div className="px-4 py-5 sm:px-5 sm:py-6">{children}</div>
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';
import { GAME_AREA_DEFS, type GameAreaId } from './player-stats-theme';

export interface GameAreaStat {
  label: string;
  value: string;
}

export interface GameAreaPickerProps {
  value: GameAreaId;
  onChange: (area: GameAreaId) => void;
  statsByArea?: Partial<Record<GameAreaId, GameAreaStat | null>>;
  className?: string;
}

/** Large tappable area cards — replaces the quiet segmented control for players. */
export function GameAreaPicker({ value, onChange, statsByArea, className }: GameAreaPickerProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:gap-3', className)}>
      {GAME_AREA_DEFS.map((area) => {
        const active = value === area.id;
        const Icon = area.icon;
        const stat = statsByArea?.[area.id];
        return (
          <button
            key={area.id}
            type="button"
            onClick={() => onChange(area.id)}
            className={cn(
              'flex min-h-[88px] flex-col items-start gap-1 rounded-card border px-3 py-3 text-left outline-none transition-all [transition-duration:180ms]',
              'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
              active
                ? cn('shadow-soft ring-2 ring-offset-1 ring-offset-canvas', area.tint, area.border, 'ring-accent-600/30')
                : cn('border-border-subtle bg-surface hover:bg-surface-tint', area.tint),
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={cn('grid h-8 w-8 place-items-center rounded-fw-md border', area.tint, area.border)}>
                  <Icon className={cn('h-4 w-4', area.iconColor)} aria-hidden />
                </span>
                <span className="font-fw-sans text-body-sm font-semibold text-text-primary">{area.short}</span>
              </span>
              {stat ? (
                <span className="text-right">
                  <span className="block font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
                    {stat.value}
                  </span>
                  <span className="font-fw-sans text-caption text-text-tertiary">{stat.label}</span>
                </span>
              ) : null}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">{area.label}</span>
          </button>
        );
      })}
    </div>
  );
}

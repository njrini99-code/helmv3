'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type RibbonStatus = 'ready' | 'watch' | 'limited' | 'missing' | 'complete';

export interface StatusRibbonProps {
  value: RibbonStatus;
  onChange?: (value: RibbonStatus) => void;
  readonly?: boolean;
  className?: string;
}

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  activeBg: string;
  activeText: string;
  /** Border color for the ghost (unselected) state */
  ghostBorder: string;
}

const STATUS_CONFIG: Record<RibbonStatus, StatusConfig> = {
  ready: {
    label: 'Ready',
    bg: 'bg-primary-100',
    text: 'text-primary-700',
    activeBg: 'bg-primary-600',
    activeText: 'text-white',
    ghostBorder: 'border-primary-300',
  },
  // Ink system (Living Annual doctrine — no raw amber/red): `watch` is the
  // warning-weight state, so it reads pursuit clay soft (mirrors
  // UrgencyPicker's 'high' tier). `limited` stays orange — out of the
  // red/amber ban, unchanged.
  watch: {
    label: 'Watch',
    bg: 'bg-pursuit/10',
    text: 'text-pursuit',
    activeBg: 'bg-pursuit/60',
    activeText: 'text-white',
    ghostBorder: 'border-pursuit/30',
  },
  limited: {
    label: 'Limited',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    activeBg: 'bg-orange-500',
    activeText: 'text-white',
    ghostBorder: 'border-orange-300',
  },
  // `missing` is the true error/blocking state — the same pursuit lane at
  // full solid weight (mirrors UrgencyPicker's 'urgent' tier), one notch
  // deeper than `watch` so the two stay visually distinguishable.
  missing: {
    label: 'Missing',
    bg: 'bg-pursuit/15',
    text: 'text-pursuit',
    activeBg: 'bg-pursuit',
    activeText: 'text-white',
    ghostBorder: 'border-pursuit/50',
  },
  complete: {
    label: 'Complete',
    bg: 'bg-primary-100',
    text: 'text-primary-900',
    activeBg: 'bg-primary-800',
    activeText: 'text-white',
    ghostBorder: 'border-primary-400',
  },
};

const STATUSES: RibbonStatus[] = ['ready', 'watch', 'limited', 'missing', 'complete'];

export function StatusRibbon({ value, onChange, readonly = false, className }: StatusRibbonProps) {
  return (
    <div
      className={cn('flex flex-row flex-wrap gap-1.5', readonly && 'opacity-80', className)}
      role={readonly ? undefined : 'group'}
      aria-label={readonly ? undefined : 'Status selector'}
    >
      {STATUSES.map((status) => {
        const cfg = STATUS_CONFIG[status];
        const isSelected = value === status;

        const chipBase = cn(
          'inline-flex items-center justify-center px-3 rounded-full text-xs font-medium',
          'min-h-[44px] border transition-colors duration-150',
        );

        if (readonly) {
          return (
            <div
              key={status}
              className={cn(
                chipBase,
                isSelected
                  ? cn(cfg.activeBg, cfg.activeText, 'border-transparent')
                  : cn('bg-transparent', cfg.text, cfg.ghostBorder),
              )}
              aria-current={isSelected ? 'true' : undefined}
            >
              {cfg.label}
            </div>
          );
        }

        return (
          <Button
            key={status}
            variant="ghost"
            type="button"
            onClick={() => onChange?.(status)}
            aria-pressed={isSelected}
            className={cn(
              chipBase,
              'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2',
              'active:scale-[0.96] active:duration-75',
              isSelected
                ? cn(cfg.activeBg, cfg.activeText, 'border-transparent shadow-sm')
                : cn('bg-transparent', cfg.text, cfg.ghostBorder, 'hover:' + cfg.bg),
            )}
          >
            {cfg.label}
          </Button>
        );
      })}
    </div>
  );
}

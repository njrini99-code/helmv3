'use client';

/**
 * ============================================================================
 * Fairway · roster · FairwayPlayerStatusBadge (C11)
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy roster PlayerStatusBadge
 * (src/components/golf/roster/PlayerStatusBadge.tsx). PRESENTATION-ONLY:
 * the server-side write (`updatePlayerStatus`) is imported VERBATIM and called
 * exactly as the legacy did — same args, same `{ success, error? }` contract,
 * same optimistic-update + `router.refresh()` flow. No mutation is rewritten,
 * wrapped, weakened, or auto-fired.
 *
 *   • EDITABLE mode (coach roster): a StatusPill rendered as the trigger of a
 *     Fairway PopoverPanel. Picking a status performs the single, scoped
 *     `updatePlayerStatus(playerId, status)` write (NON-destructive — a plain
 *     UPDATE), optimistically reflects the new status, toasts via fairwayToast,
 *     and `router.refresh()`es. On failure it rolls the optimistic value back.
 *   • STATIC mode (`editable={false}`, player contexts): just the StatusPill,
 *     no trigger, no popover, no write path.
 *
 * Tone map (locked Fairway status families — green=structure/success, amber=
 * warning, rose/red=danger only): active→success, injured→danger,
 * redshirt→warning, inactive→neutral. Color is never the only channel — the
 * text label always carries the meaning too.
 *
 * Haptics: a quiet `triggerHaptic('light')` on open + on a real status change
 * (fire-and-forget; silent no-op on web).
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import type { FwStatusTone } from '@/components/fairway/controls/_internal';
import { IconChevronDown } from '@/components/icons';
import { Check } from 'lucide-react';

/* ---------------------------------------------------------------------------
 * Status vocabulary — the four player statuses + their Fairway tone mapping.
 * Mirrors the legacy CHECK-constraint values (active | injured | redshirt |
 * inactive) so the write contract is unchanged.
 * ------------------------------------------------------------------------- */

export type PlayerStatus = 'active' | 'injured' | 'redshirt' | 'inactive';

interface StatusMeta {
  value: PlayerStatus;
  label: string;
  tone: FwStatusTone;
}

const STATUSES: readonly StatusMeta[] = [
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'injured', label: 'Injured', tone: 'danger' },
  { value: 'redshirt', label: 'Redshirt', tone: 'warning' },
  { value: 'inactive', label: 'Inactive', tone: 'neutral' },
] as const;

/** Resolve a (possibly null/unknown) status string to its meta, defaulting to Active. */
function metaFor(status: string | null | undefined): StatusMeta {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0]!;
}

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface FairwayPlayerStatusBadgeProps {
  /** The player whose team-membership status this pill edits. */
  playerId: string;
  /** Current status from the loader (null → treated as "active"). */
  currentStatus: string | null;
  /**
   * Editable (coach) vs static (player) mode. Default `true`.
   * In static mode this renders a bare, non-interactive StatusPill.
   */
  editable?: boolean;
  /** StatusPill size. Default `md`. */
  size?: 'sm' | 'md';
  /** Side the popover opens relative to the trigger. Default `bottom`. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side. Default `start`. */
  align?: 'start' | 'center' | 'end';
  /** Extra classes merged onto the trigger / static pill. */
  className?: string;
}

/* ---------------------------------------------------------------------------
 * FairwayPlayerStatusBadge
 * ------------------------------------------------------------------------- */

export function FairwayPlayerStatusBadge({
  playerId,
  currentStatus,
  editable = true,
  size = 'md',
  side = 'bottom',
  align = 'start',
  className,
}: FairwayPlayerStatusBadgeProps) {
  const router = useRouter();

  // Optimistic status — initialized from the prop, kept in sync if the prop
  // changes (e.g. after router.refresh() lands fresh server data).
  const [status, setStatus] = React.useState<PlayerStatus>(metaFor(currentStatus).value);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setStatus(metaFor(currentStatus).value);
  }, [currentStatus]);

  const current = metaFor(status);

  /* ---- STATIC (player) mode — bare pill, no write path ---- */
  if (!editable) {
    return (
      <StatusPill tone={current.tone} size={size} className={className}>
        {current.label}
      </StatusPill>
    );
  }

  /* ---- write path — single, scoped, NON-destructive UPDATE (verbatim) ---- */
  async function handleSelect(next: PlayerStatus) {
    setOpen(false);

    // No-op selecting the already-current status (matches legacy).
    if (next === status) return;

    const prev = status;
    const nextLabel = metaFor(next).label;

    // Optimistic flip + light haptic.
    setStatus(next);
    setLoading(true);
    void triggerHaptic('light');

    try {
      const result = await updatePlayerStatus(playerId, next);
      if (result.success) {
        fairwayToast.success('Status updated', {
          description: `Player status changed to ${nextLabel}.`,
        });
        router.refresh();
      } else {
        // Roll the optimistic value back on a failed write.
        setStatus(prev);
        fairwayToast.danger('Failed to update status', {
          description: result.error ?? 'Please try again.',
        });
      }
    } catch {
      setStatus(prev);
      fairwayToast.danger('Failed to update status', {
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  /* ---- EDITABLE (coach) mode — StatusPill trigger + PopoverPanel menu ---- */
  const trigger = (
    <button
      type="button"
      disabled={loading}
      aria-label={`Player status: ${current.label}. Change status.`}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        'inline-flex items-center rounded-full',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'transition-opacity duration-fast motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      <StatusPill
        tone={current.tone}
        size={size}
        pulse={loading}
        className="cursor-pointer pr-1.5"
      >
        {loading ? 'Updating…' : current.label}
        <IconChevronDown
          size={12}
          className={cn(
            'ml-0.5 transition-transform duration-fast motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </StatusPill>
    </button>
  );

  return (
    <PopoverPanel
      open={open}
      onOpenChange={(next) => {
        // Light haptic when the menu opens (not on close).
        if (next && !open) void triggerHaptic('light');
        setOpen(next);
      }}
      trigger={trigger}
      side={side}
      align={align}
      width="sm"
      surface="matte"
      ariaLabel="Change player status"
      data-slot="fw-player-status-menu"
    >
      <PopoverPanel.Header>Set status</PopoverPanel.Header>
      <div role="menu" className="flex flex-col gap-0.5">
        {STATUSES.map((s) => {
          const selected = s.value === status;
          return (
            <PopoverPanel.Item
              key={s.value}
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => handleSelect(s.value)}
              className={cn(selected && 'bg-surface-sunken')}
            >
              <StatusPill tone={s.tone} size="sm">
                {s.label}
              </StatusPill>
              {selected ? (
                <Check size={16} className="ml-auto text-accent-600" aria-hidden="true" />
              ) : null}
            </PopoverPanel.Item>
          );
        })}
      </div>
    </PopoverPanel>
  );
}

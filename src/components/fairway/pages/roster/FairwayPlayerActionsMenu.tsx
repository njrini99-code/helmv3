'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayPlayerActionsMenu (C13) — the kebab row-action menu
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of src/components/golf/roster/PlayerActionsMenu.tsx.
 * PRESENTATION-ONLY: every server action is imported VERBATIM by its exact path
 * and called unchanged — no wrapping, no weakening, no auto-fire.
 *
 *   • A kebab IconButton trigger opens a Fairway PopoverPanel (the lightest
 *     overlay) with the navigation + action items.
 *   • View Profile / View Stats / Message  → navigation (Link / router.push).
 *   • Change Status → opens a ModalShell with the four status options →
 *     updatePlayerStatus(playerId, status) from '@/app/golf/actions/golf'.
 *   • Remove from Team → opens a ModalShell CONFIRM → removePlayerFromTeam(playerId)
 *     from '@/app/golf/actions/roster'. DESTRUCTIVE, single scoped delete:
 *     gated behind an explicit confirm, NEVER auto-fired, Button variant="danger",
 *     and the copy explicitly states the player's account & stats are NOT deleted.
 *
 * GOTCHA honored: updatePlayerStatus AND removePlayerFromTeam both return
 * { success, error? } (golf.ts / roster.ts contract) — checked with `.success`.
 *
 * Optimistic UX: on success we toast + router.refresh() so the parent server
 * component re-fetches the authoritative roster snapshot.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// Server actions — imported VERBATIM by their exact paths, called unchanged.
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import { updatePlayerStatus } from '@/app/golf/actions/golf';

import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import {
  IconMoreVertical,
  IconUser,
  IconChartBar,
  IconMessage,
  IconUsers,
  IconChevronRight,
} from '@/components/icons';

/* ---------------------------------------------------------------------------
 * Status vocabulary — the two valid roster statuses (green=active,
 * tertiary=neutral). The dot color is the non-text meaning channel.
 *
 * B4/F007: the golf_team_members.status enum only allows
 * pending/active/inactive/removed — 'injured' and 'redshirt' were never valid
 * write values, so they are dropped from the Change Status modal. Active +
 * Inactive only.
 * ------------------------------------------------------------------------- */

export type FairwayPlayerStatus = 'active' | 'inactive';

interface StatusOption {
  value: FairwayPlayerStatus;
  label: string;
  description: string;
  /** Tailwind bg-* utility for the meaning dot. */
  dotClass: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'active',
    label: 'Active',
    description: 'Player is actively participating in team activities',
    dotClass: 'bg-accent-500',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    description: 'Player is not currently participating',
    dotClass: 'bg-text-tertiary',
  },
];

const STATUS_LABEL: Record<FairwayPlayerStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

function isPlayerStatus(v: string | null | undefined): v is FairwayPlayerStatus {
  return v === 'active' || v === 'inactive';
}

/**
 * The PopoverPanel.Item primitive wraps a raw <button> (no `asChild`), so the
 * "View Profile" Link cannot mount through it. We mirror its exact item styling
 * onto the <Link> so it reads as the same menu row, keyboard-focusable + tactile.
 */
const MENU_ITEM_CLASS = cn(
  'flex w-full items-center gap-2.5 rounded-fw-sm px-2.5 py-2',
  'min-h-[36px] text-left font-fw-sans text-body text-text-primary',
  'transition-colors duration-fast',
  'hover:bg-surface-sunken active:translate-y-[0.5px]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-elevated',
);

/* ---------------------------------------------------------------------------
 * Props — mirrors the legacy PlayerActionsMenu contract so the card/page
 * composers can wire it 1:1. Optional route overrides are additive (defaults
 * match the legacy hrefs exactly).
 * ------------------------------------------------------------------------- */

export interface FairwayPlayerActionsMenuProps {
  /** Player (golf_players.id) — the subject of every action. REQUIRED. */
  playerId: string;
  /** Display name for toasts + confirm copy. REQUIRED. */
  playerName: string;
  /** Current roster status (pre-selects the Change Status modal). */
  currentStatus?: string | null;
  /** Side the popover opens on (default `bottom`). */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side (default `end`, matching the legacy kebab). */
  align?: 'start' | 'center' | 'end';
  /** Extra classes merged onto the kebab IconButton. */
  className?: string;
}

export function FairwayPlayerActionsMenu({
  playerId,
  playerName,
  currentStatus,
  side = 'bottom',
  align = 'end',
  className,
}: FairwayPlayerActionsMenuProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [selectedStatus, setSelectedStatus] =
    React.useState<FairwayPlayerStatus | null>(null);

  // F142/F143: the CoachHelm Player deep-dive (AI patterns/predictions) is
  // NOT the roster profile — `/golf/dashboard/roster/[id]` is the profile
  // (what the card's "View player" CTA opens). Labeling this kebab row "View
  // Profile" pointed coaches at a different page than the card's primary
  // action. The item is now "View Insights" so the two destinations are
  // distinct + honestly named. GOLF IA REORG (final_migrations #11): the
  // insight/verdict content moved into the Scouting Report tab of the
  // canonical /players/[playerId]/game deep-dive.
  const insightHref = `/golf/dashboard/players/${playerId}/game?tab=scouting`;

  /* ---- navigation helpers (close the popover first) ---- */

  function goTo(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  /* ---- Change Status ---- */

  function openStatusModal() {
    setMenuOpen(false);
    // Pre-select the current status if it is one of the four known values,
    // otherwise default to "active" (verbatim legacy behavior).
    setSelectedStatus(isPlayerStatus(currentStatus) ? currentStatus : 'active');
    setStatusOpen(true);
  }

  async function handleStatusChange() {
    if (!selectedStatus) return;
    setUpdatingStatus(true);
    try {
      // updatePlayerStatus → { success, error? } (golf.ts contract): check .success.
      const result = await updatePlayerStatus(playerId, selectedStatus);
      if (result.success) {
        fairwayToast.success(
          `${playerName}'s status changed to ${STATUS_LABEL[selectedStatus]}`,
        );
        setStatusOpen(false);
        setSelectedStatus(null);
        router.refresh();
      } else {
        fairwayToast.error(result.error ?? 'Failed to update status');
      }
    } catch (error) {
      fairwayToast.error(
        error instanceof Error ? error.message : 'Failed to update status',
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  /* ---- Remove from Team (DESTRUCTIVE — explicit confirm only, never auto-fire) ---- */

  function openRemoveModal() {
    setMenuOpen(false);
    setRemoveOpen(true);
  }

  async function handleRemovePlayer() {
    setRemoving(true);
    try {
      // removePlayerFromTeam → { success, error? } (roster.ts contract): check .success.
      const result = await removePlayerFromTeam(playerId);
      if (result.success) {
        fairwayToast.success(`${playerName} removed from team`);
        setRemoveOpen(false);
        router.refresh();
      } else {
        fairwayToast.error(result.error ?? 'Failed to remove player');
      }
    } catch (error) {
      fairwayToast.error(
        error instanceof Error ? error.message : 'Failed to remove player',
      );
    } finally {
      setRemoving(false);
    }
  }

  const statusUnchanged =
    selectedStatus != null && selectedStatus === currentStatus;

  return (
    <>
      <PopoverPanel
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side={side}
        align={align}
        surface="matte"
        width="sm"
        ariaLabel={`Actions for ${playerName}`}
        trigger={
          <IconButton
            variant="ghost"
            size="md"
            aria-label={`Actions for ${playerName}`}
            className={className}
          >
            <IconMoreVertical size={18} />
          </IconButton>
        }
      >
        {/* View Insights — opens the CoachHelm Player Insight surface (distinct
            from the card's "View player" profile CTA). A real <Link>, styled to
            match the PopoverPanel.Item row (the Item primitive is a raw <button>
            with no asChild slot). */}
        <Link href={insightHref} className={MENU_ITEM_CLASS} onClick={() => setMenuOpen(false)}>
          <IconChevronRight size={18} className="text-text-tertiary" />
          View Insights
        </Link>

        <PopoverPanel.Item onClick={() => goTo(`/golf/dashboard/stats?player=${playerId}`)}>
          <IconChartBar size={18} className="text-text-tertiary" />
          View Stats
        </PopoverPanel.Item>

        <PopoverPanel.Item onClick={() => goTo(`/golf/dashboard/messages?player=${playerId}`)}>
          <IconMessage size={18} className="text-text-tertiary" />
          Message
        </PopoverPanel.Item>

        <PopoverPanel.Separator />

        <PopoverPanel.Item onClick={openStatusModal}>
          <IconUser size={18} className="text-text-tertiary" />
          Change Status
        </PopoverPanel.Item>

        <PopoverPanel.Separator />

        {/* Destructive — tinted danger affordance; opens an explicit confirm. */}
        <PopoverPanel.Item
          onClick={openRemoveModal}
          className="text-fw-danger hover:bg-fw-danger-bg hover:text-fw-danger-ink"
        >
          <IconUsers size={18} className="text-fw-danger" />
          Remove from Team
        </PopoverPanel.Item>
      </PopoverPanel>

      {/* ---- CHANGE STATUS MODAL ---- */}
      <ModalShell
        open={statusOpen}
        onOpenChange={(o) => {
          setStatusOpen(o);
          if (!o) setSelectedStatus(null);
        }}
        size="md"
        title="Change player status"
        description={`Update the roster status for ${playerName}.`}
      >
        <ModalShell.Body>
          <div className="flex flex-col gap-2">
            {STATUS_OPTIONS.map((status) => {
              const active = selectedStatus === status.value;
              return (
                // Intentional raw <button>: a single-select status row with a
                // meaning-dot + stacked label/description + check that the
                // <Button> primitive can't express. The full interactive-state
                // contract (hover/focus-visible/active/disabled, §7.1) is inline.
                // eslint-disable-next-line helm/no-raw-button
                <button
                  key={status.value}
                  type="button"
                  onClick={() => setSelectedStatus(status.value)}
                  disabled={updatingStatus}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-fw-md border px-4 py-3 text-left',
                    'transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-elevated',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    active
                      ? 'border-accent-500 bg-accent-50'
                      : 'border-border-subtle bg-surface hover:bg-surface-sunken hover:border-border-strong',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('h-3 w-3 flex-shrink-0 rounded-full', status.dotClass)}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block font-fw-sans text-body-sm font-medium',
                        active ? 'text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="block font-fw-sans text-caption text-text-tertiary">
                      {status.description}
                    </span>
                  </span>
                  {active ? (
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-accent-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>

          {isPlayerStatus(currentStatus) ? (
            <p className="mt-4 font-fw-sans text-caption text-text-tertiary">
              Current status:{' '}
              <span className="font-medium text-text-secondary">
                {STATUS_LABEL[currentStatus]}
              </span>
            </p>
          ) : null}
        </ModalShell.Body>

        <ModalShell.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setStatusOpen(false);
              setSelectedStatus(null);
            }}
            disabled={updatingStatus}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={updatingStatus}
            disabled={!selectedStatus || statusUnchanged}
            onClick={handleStatusChange}
          >
            Update status
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ---- REMOVE FROM TEAM CONFIRM (DESTRUCTIVE) ---- */}
      <ModalShell
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        size="md"
        title="Remove player?"
        description={
          <>
            Remove <span className="font-medium text-text-primary">{playerName}</span> from
            your team? They can rejoin later using the team invite code.
          </>
        }
      >
        <ModalShell.Body>
          {/* The destructive guarantee — the player's account & stats are NOT
              deleted; this only ends their roster membership. */}
          <p className="rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3 font-fw-sans text-body-sm text-text-secondary">
            Their account and stats will{' '}
            <span className="font-medium text-text-primary">not</span> be deleted — this only
            removes them from your active roster.
          </p>
        </ModalShell.Body>

        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setRemoveOpen(false)} disabled={removing}>
            Cancel
          </Button>
          <Button variant="danger" busy={removing} onClick={handleRemovePlayer}>
            Remove player
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </>
  );
}

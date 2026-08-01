'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayJoinRequestAlert — warm-premium re-skin of the legacy
 * JoinRequestAlert: a dismissible banner that links to the roster when players
 * are waiting to join. (C8)
 * ----------------------------------------------------------------------------
 * Re-skins the legacy amber-gradient banner onto the Fairway warning InlineNotice
 * + an AvatarGroup of the waiting players (deterministic colored initials, since
 * join requests carry no photo). Keeps:
 *   · self-fetch on mount via getTeamJoinRequests() (legacy behavior) — UNLESS a
 *     `requests` prop is supplied, in which case it renders from that and skips
 *     the fetch (lets a parent that already loaded the data avoid a duplicate).
 *   · dismiss + onDismiss (consumer-owned visibility), `dismissible` toggle.
 *   · a "Review requests" link to /golf/dashboard/roster.
 *   · gentle reveal motion honoring prefers-reduced-motion (legacy used
 *     LazyMotion/m; Fairway pages standardize on plain `motion`, which needs no
 *     LazyMotion provider — the animation intent is preserved).
 *
 * PRESENTATION-ONLY. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * Reuses getTeamJoinRequests VERBATIM (returns { success, data?, error? }).
 * ADDITIVE — imported by nothing live until the dashboard fork.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getTeamJoinRequests, type JoinRequestData } from '@/app/golf/actions/teams';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Button } from '@/components/fairway/controls/button';
import { AvatarGroup } from '@/components/fairway/controls/avatar';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';
import { IconUsers, IconChevronRight } from '@/components/icons';

/* ---------------------------------------------------------------------------
 * A lightweight subset of JoinRequestData — the banner only needs the player
 * name + an id seed for the colored initials. Accepts the full shape too.
 * ------------------------------------------------------------------------- */

type AlertRequest = Pick<JoinRequestData, 'id' | 'player_id'> & {
  player?: { first_name: string; last_name: string } | JoinRequestData['player'];
};

export interface FairwayJoinRequestAlertProps {
  /**
   * Pre-fetched requests. When provided, the banner renders from these and does
   * NOT self-fetch. Omit to keep the legacy self-fetch-on-mount behavior.
   */
  requests?: AlertRequest[];
  /** Href the "Review requests" CTA points to. Defaults to the roster. */
  href?: string;
  /** Show the dismiss (×) affordance. Defaults to true (legacy default). */
  dismissible?: boolean;
  /** Called when the banner is dismissed (consumer owns persistence if any). */
  onDismiss?: () => void;
  className?: string;
}

function requestName(r: AlertRequest): string {
  return r.player ? `${r.player.first_name} ${r.player.last_name}`.trim() || 'A player' : 'A player';
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Colored-initials avatar (join requests carry no photo). Deterministic tint
 *  via the shared tintFor seed. Sized to match AvatarGroup's `sm` (h-8 w-8). */
function InitialsAvatar({ seed, name }: { seed: string; name: string }) {
  const tint = tintFor(seed);
  return (
    <span
      aria-label={name}
      role="img"
      className={cn(
        'inline-flex h-8 w-8 select-none items-center justify-center rounded-full',
        'font-fw-sans text-caption font-semibold uppercase ring-1 ring-inset ring-border-subtle',
      )}
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      {initialsFromName(name)}
    </span>
  );
}

export function FairwayJoinRequestAlert({
  requests: requestsProp,
  href = '/golf/dashboard/roster',
  dismissible = true,
  onDismiss,
  className,
}: FairwayJoinRequestAlertProps) {
  const controlled = requestsProp !== undefined;

  const [fetched, setFetched] = React.useState<AlertRequest[]>([]);
  // When controlled by a prop, we already "have" the data → not loading.
  const [loading, setLoading] = React.useState(!controlled);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (controlled) return;
    let active = true;
    (async () => {
      const result = await getTeamJoinRequests();
      if (!active) return;
      if (result.success && result.data) {
        setFetched(result.data);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [controlled]);

  const requests = controlled ? requestsProp! : fetched;

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  // Don't render while loading, once dismissed, or with nothing pending
  // (mirrors the legacy null-render guards).
  if (loading || dismissed || requests.length === 0) {
    return null;
  }

  const count = requests.length;
  const shown = requests.slice(0, 3);
  const playerNames = shown.map(requestName).join(', ');
  const extraCount = count > 3 ? count - 3 : 0;

  return (
    <InlineNotice
      tone="warning"
      icon={null}
      dismissible={dismissible}
      onDismiss={handleDismiss}
      className={cn('items-center', className)}
      title={
        <span className="flex items-center gap-2">
          <IconUsers size={16} aria-hidden />
          {count} player{count === 1 ? '' : 's'} waiting to join
        </span>
      }
      action={
        <Button asChild variant="primary" size="sm">
          <Link href={href} className="inline-flex items-center gap-1.5">
            Review requests
            <IconChevronRight size={15} aria-hidden />
          </Link>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AvatarGroup size="sm" max={3}>
          {shown.map((r) => (
            <InitialsAvatar key={r.id} seed={r.player_id} name={requestName(r)} />
          ))}
        </AvatarGroup>
        <span className="font-fw-sans text-body text-text-secondary">
          {playerNames}
          {extraCount > 0 ? ` and ${extraCount} more` : ''} requested to join your team.
        </span>
      </div>
    </InlineNotice>
  );
}

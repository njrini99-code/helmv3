'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayPlayerRoster  (C16)
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy player-facing Team Roster
 * (src/components/golf/roster/PlayerRosterView.tsx). PRESENTATION-ONLY: a
 * READ-ONLY teammate grid. There is NO status editing, NO intent control, NO
 * roster mutation, NO invite — exactly the player view's scope.
 *
 * Anatomy:
 *   - ViewHeader masthead ("Team Roster" + teammate-count meta line).
 *   - A responsive grid of matte Surface cards. Each card carries:
 *       · an Avatar (online/offline presence dot; deterministic colored-initials
 *         fallback via `tintFor` when a teammate has no photo),
 *       · name + FairwayYearBadge (graduation-year mini-tag),
 *       · a handicap Chip (green `success` tone when scratch-or-better, ≤ 0),
 *       · grad-year caption,
 *       · a single ghost "Message" Button that is a Link to the messages thread.
 *   - EmptyState ("No teammates yet") when the roster is empty.
 *
 * Helpers (isUserOnline 5-min window, formatHandicap) come from the shared
 * ./roster-helpers module (the deduped, verbatim source of truth).
 *
 * Renders inside a `.fairway-ds` scope on a `bg-canvas` page. ADDITIVE ONLY —
 * never imports or mutates anything in the legacy roster tree.
 * ========================================================================== */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconMessage } from '@/components/icons';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Button } from '@/components/fairway/controls/button';
import { Chip } from '@/components/fairway/controls/badge';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Users as LucideUsers } from 'lucide-react';
import { FairwayYearBadge } from './FairwayYearBadge';
import { isUserOnline, formatHandicap } from './roster-helpers';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';

/* ---------------------------------------------------------------------------
 * Props — mirror the legacy PlayerRosterView loader output EXACTLY
 * ------------------------------------------------------------------------- */

export interface FairwayPlayerRosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  last_seen: string | null;
}

export interface FairwayPlayerRosterProps {
  players: FairwayPlayerRosterPlayer[];
  teamName: string;
  className?: string;
  /**
   * Hide the "Team Roster" masthead. Set when embedded under another header
   * (e.g. the Team Hub's Teammates tab) so the heading isn't duplicated.
   */
  hideHeader?: boolean;
}

/* ---------------------------------------------------------------------------
 * Local name/initials helpers (presentation only; presence + handicap formatting
 * live in the shared ./roster-helpers module)
 * ------------------------------------------------------------------------- */

function fullName(p: FairwayPlayerRosterPlayer): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Teammate';
}

function initials(p: FairwayPlayerRosterPlayer): string {
  return (
    `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() || '—'
  );
}

/* ---------------------------------------------------------------------------
 * FairwayPlayerRoster
 * ------------------------------------------------------------------------- */

export function FairwayPlayerRoster({
  players,
  teamName,
  className,
  hideHeader = false,
}: FairwayPlayerRosterProps) {
  const count = players.length;

  return (
    <div className={cn('flex flex-col gap-7', className)}>
      {hideHeader ? null : (
        <ViewHeader
          title="Team Roster"
          description={`${count} ${count === 1 ? 'teammate' : 'teammates'} on ${teamName}`}
        />
      )}

      {count === 0 ? (
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={LucideUsers}
            title="No teammates yet"
            description="Your team roster is empty. Your coach will add players to the team."
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {players.map((player) => (
            <TeammateCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * TeammateCard — one read-only teammate (no actions beyond Message link)
 * ------------------------------------------------------------------------- */

function TeammateCard({ player }: { player: FairwayPlayerRosterPlayer }) {
  const name = fullName(player);
  const online = isUserOnline(player.last_seen);
  const hasHandicap = player.handicap !== null;
  // Scratch-or-better (handicap <= 0) reads as the green "structure" tone.
  const scratchOrBetter = hasHandicap && (player.handicap as number) <= 0;

  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        {/* Avatar — image with presence dot, OR deterministic colored initials. */}
        {player.avatar_url ? (
          <Avatar
            src={player.avatar_url}
            name={name}
            size="lg"
            status={online ? 'online' : 'offline'}
          />
        ) : (
          <ColoredInitialsAvatar
            seed={player.id}
            initials={initials(player)}
            name={name}
            online={online}
          />
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-fw-sans text-h3 font-semibold text-text-primary">
              {name}
            </h3>
            <FairwayYearBadge year={player.graduation_year} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {hasHandicap ? (
              <Chip
                tone={scratchOrBetter ? 'success' : 'neutral'}
                size="sm"
                className="font-fw-mono tabular-nums"
              >
                {formatHandicap(player.handicap)} HCP
              </Chip>
            ) : (
              <span className="font-fw-sans text-caption text-text-tertiary">
                No handicap yet
              </span>
            )}
            {player.graduation_year ? (
              <span className="font-fw-sans text-caption text-text-tertiary">
                Class of {player.graduation_year}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* The ONE action — a ghost Button wrapping a next/link (asChild). */}
      <Button variant="ghost" size="sm" fullWidth asChild>
        <Link
          href={`/golf/dashboard/messages?player=${player.id}`}
          aria-label={`Message ${name}`}
        >
          <IconMessage size={15} />
          <span>Message</span>
        </Link>
      </Button>
    </Surface>
  );
}

/* ---------------------------------------------------------------------------
 * ColoredInitialsAvatar — deterministic warm-tinted initials + presence dot.
 * Mirrors the Fairway Avatar's lg geometry + status-dot treatment so a
 * photoless teammate reads like a real avatar (not flat gray).
 * ------------------------------------------------------------------------- */

function ColoredInitialsAvatar({
  seed,
  initials: glyph,
  name,
  online,
}: {
  seed: string;
  initials: string;
  name: string;
  online: boolean;
}) {
  const tint = tintFor(seed);
  return (
    <span className="relative inline-flex h-12 w-12 flex-shrink-0">
      <span
        className="flex h-full w-full select-none items-center justify-center overflow-hidden rounded-full font-fw-sans text-body font-semibold uppercase ring-1 ring-inset ring-border-subtle"
        style={{ backgroundColor: tint.bg, color: tint.text }}
      >
        <span aria-hidden={!!name}>{glyph}</span>
        {name ? <span className="sr-only">{name}</span> : null}
      </span>
      <span
        className={cn(
          'absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-[3px] ring-canvas',
          online ? 'bg-fw-success' : 'bg-text-tertiary',
        )}
        role="img"
        aria-label={online ? 'Online' : 'Offline'}
      />
    </span>
  );
}

export default FairwayPlayerRoster;

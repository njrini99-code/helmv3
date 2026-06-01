'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayPlayerProfile (D1) — coach player drill-down
 * ----------------------------------------------------------------------------
 * The coach-facing player page reached from the roster (Roster → player). It is
 * now a thin IDENTITY HEADER (avatar, name, year, editable status, contact +
 * message) on top of the shared <FairwayStatsCockpit> — the SAME re-architected
 * strokes-gained stats body the player sees at /golf/dashboard/stats. This is
 * the "unify on the cockpit" decision: one beautiful stats page, two roles, no
 * double-nav (the coach gets a roster header instead of the CoachHelm sub-nav).
 *
 * The cockpit owns the stats, leak maps, trend, detailed standings, CoachHelm
 * cause/effect, and recent rounds — so this file no longer renders its own
 * stats block or rounds list.
 *
 * The only mutation reachable here is the NON-destructive status change inside
 * FairwayPlayerStatusBadge. No row is deleted; no destructive write auto-fires.
 *
 * ADDITIVE ONLY — a client component (it reaches the `'use client'` tintFor +
 * interactive children); the server page hands it plain serializable props.
 * ========================================================================== */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { IconMessage, IconMapPin, IconMail, IconPhone } from '@/components/icons';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';
import { FairwayStatsCockpit } from '@/components/fairway/pages/coachhelm/FairwayStatsCockpit';

/* ---------------------------------------------------------------------------
 * Props — mirror the roster/[id] loader output
 * ------------------------------------------------------------------------- */

export interface FairwayPlayerProfilePlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  phone: string | null;
  email: string | null;
  created_at: string | null;
}

export interface FairwayPlayerProfileProps {
  player: FairwayPlayerProfilePlayer;
  /** golf_team_members.status for this player on the coach's team. */
  membershipStatus: string | null;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Local formatters (presentation only)
 * ------------------------------------------------------------------------- */

function fullName(p: FairwayPlayerProfilePlayer): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

function initials(p: FairwayPlayerProfilePlayer): string {
  return `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() || '—';
}

function memberSince(createdAt: string | null): string {
  if (!createdAt) return 'Unknown';
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ---------------------------------------------------------------------------
 * FairwayPlayerProfile
 * ------------------------------------------------------------------------- */

export function FairwayPlayerProfile({
  player,
  membershipStatus,
  className,
}: FairwayPlayerProfileProps) {
  const name = fullName(player);
  const tint = tintFor(player.id);
  const location = [player.hometown, player.state].filter(Boolean).join(', ');

  return (
    <div className={cn('mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8', className)}>
      {/* ── Back to roster ── */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        leftIcon={<ArrowLeft className="h-4 w-4" />}
        className="mb-5 -ml-2 text-text-tertiary"
      >
        <Link href="/golf/dashboard/roster">Roster</Link>
      </Button>

      {/* ── Identity header ── */}
      <Surface elevation="shadow" padding="lg" className="mb-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <span
              className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl font-fw-display text-h2 font-semibold ring-1 ring-border-subtle sm:h-24 sm:w-24"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(player)
              )}
            </span>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="break-words font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
                  {name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <FairwayYearBadge year={player.graduation_year} />
                  <FairwayPlayerStatusBadge
                    playerId={player.id}
                    currentStatus={membershipStatus}
                    editable
                    size="sm"
                  />
                </div>
                {location ? (
                  <p className="mt-2 flex items-center gap-1.5 font-fw-sans text-body-sm text-text-tertiary">
                    <IconMapPin size={14} />
                    {location}
                  </p>
                ) : null}
              </div>

              {/* Contact + actions */}
              <div className="flex flex-wrap items-center gap-2">
                {player.email ? (
                  <Button asChild variant="ghost" size="sm" leftIcon={<IconMail size={15} />}>
                    <a href={`mailto:${player.email}`} title={player.email}>
                      <span className="hidden md:inline">Email</span>
                    </a>
                  </Button>
                ) : null}
                {player.phone ? (
                  <Button asChild variant="ghost" size="sm" leftIcon={<IconPhone size={15} />}>
                    <a href={`tel:${player.phone}`} title={player.phone}>
                      <span className="hidden md:inline">Call</span>
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="secondary" size="sm" leftIcon={<IconMessage size={16} />}>
                  <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message</Link>
                </Button>
              </div>
            </div>

            <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
              Member since {memberSince(player.created_at)}
            </p>
          </div>
        </div>
      </Surface>

      {/* ── The shared stats cockpit (stats · leak maps · trend · CoachHelm ·
           detailed standings · recent rounds) ── */}
      <FairwayStatsCockpit playerId={player.id} />
    </div>
  );
}

export default FairwayPlayerProfile;

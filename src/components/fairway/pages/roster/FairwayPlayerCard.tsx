'use client';

/** Fairway · Roster · FairwayPlayerCard (C9) — coach roster player card. */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';

import { cn, pluralize } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Badge } from '@/components/fairway/controls/badge';
import { TrendGlyph } from '@/components/fairway';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { TrendVerdict } from '@/lib/coachhelm/trend';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { FairwayIntentControl } from './FairwayIntentControl';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { isUserOnline } from './roster-helpers';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';

export interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  status: string | null;
  last_seen?: string | null;
  rounds_count?: number;
  avg_score?: number;
  // ── CoachHelm signal (Wave 2 Players-tab enrichment) — reuses the SAME
  // classifier/loaders the Players sub-tab (PlayersGridView) already reads,
  // extended to the roster server payload; see roster/page.tsx. ────────────
  /** Canonical scoring trend (`@/lib/golf/scoring-trend`) — null when there
   *  isn't enough round history yet for a real signal. */
  recent_trend?: TrendVerdict | null;
  /** golf_player_stats_cache.sg_total_per_round. */
  sg_total?: number | null;
  /** Team-percentile cohort caption for the sg_total standing (e.g. "Top
   *  quartile on team"), empty/null when cold-start. */
  standing_tier?: string | null;
  /** Active/in_progress golf_player_focus_areas count. */
  active_focus_areas?: number;
  /** Active v3 goals count. */
  active_goals?: number;
}

/** SG:Total deadzone — |value| at or below this reads as neutral (matches
 *  the "roughly even" honesty band the rest of the SG rendering uses). */
const SG_TONE_DEADZONE = 0.15;

function formatSgTotal(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function sgTone(value: number): string {
  if (value > SG_TONE_DEADZONE) return 'text-fw-success-ink';
  if (value < -SG_TONE_DEADZONE) return 'text-fw-warning-ink';
  return 'text-text-primary';
}

export interface FairwayPlayerCardProps {
  player: RosterPlayer;
  intent: CoachPlayerIntent | null;
}

export function FairwayPlayerCard({ player, intent }: FairwayPlayerCardProps) {
  const router = useRouter();
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const online = isUserOnline(player.last_seen);
  const tint = tintFor(player.id);
  const hasScore = player.avg_score && player.avg_score > 0;

  return (
    <Surface elevation="shadow" padding="none" className="overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar + online dot */}
          <div className="relative flex-shrink-0">
            <span
              className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-2xl font-fw-display text-h3 font-semibold ring-1 ring-border-subtle md:h-[76px] md:w-[76px]"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase() || '—'
              )}
            </span>
            <span
              className={cn(
                'absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-surface',
                online ? 'bg-accent-500' : 'bg-border-strong',
              )}
              title={online ? 'Online' : 'Offline'}
            />
          </div>

          {/* Info — name + year badge + hometown. Hand-rolled here rather than
              via the shared PlayerIdentity primitive: PlayerIdentity hardcodes
              single-line `truncate` on the name span (see
              src/components/fairway/controls/PlayerIdentity.tsx), which is
              right for its other call sites (messages picker, qualifier list,
              CoachHelm attention rows) but collapsed a two-word name to one
              letter + ellipsis in this card's narrower 2-col grid cell —
              GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1, "the standout
              defect of the audit". Letting the name wrap to 2 lines fixes it
              without touching the shared primitive's other callers. Hometown
              keeps single-line truncate (min-w-0 so it clips at the string's
              end, not to two letters). */}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 line-clamp-2 break-words font-fw-display text-body-lg font-semibold leading-snug tracking-[-0.01em] text-text-primary [overflow-wrap:anywhere]">
                {name}
              </span>
              <FairwayYearBadge year={player.graduation_year} />
            </div>
            {player.hometown && player.state ? (
              <p className="mt-0.5 min-w-0 truncate font-fw-sans text-caption text-text-tertiary">
                {player.hometown}, {player.state}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <FairwayPlayerStatusBadge playerId={player.id} currentStatus={player.status} size="sm" />
              <FairwayIntentControl
                playerId={player.id}
                playerName={name}
                current={intent}
                size="sm"
                onSaved={() => router.refresh()}
              />
            </div>
          </div>

          <div className="flex-shrink-0">
            <FairwayPlayerActionsMenu playerId={player.id} playerName={name} currentStatus={player.status} />
          </div>
        </div>
      </div>

      {/* Anchor stat */}
      <div className="px-5 pb-3 md:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-fw-md bg-surface-sunken px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <p className="font-fw-sans text-caption font-medium uppercase tracking-wide text-text-tertiary">Avg score</p>
              {player.recent_trend ? (
                <TrendGlyph direction={player.recent_trend} className="text-caption font-medium" />
              ) : null}
            </div>
            {/* The denominator. Without it a coach compares an average built on
                one round against one built on sixteen — measured on Guilford
                2026-08-18, the same list held players at 1, 2 and 16 rounds.
                Every neighbouring surface states this ("'30 · 1 rds · 88.0" on
                the team board, "14/15" per putting bucket in round review). */}
            <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
              {pluralize(player.rounds_count ?? 0, 'round')}
            </p>
          </div>
          <p
            className={cn(
              'font-fw-mono text-h1 leading-none tracking-[-0.025em] tabular-nums',
              hasScore ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            {hasScore ? (player.avg_score ?? 0).toFixed(1) : '—'}
          </p>
        </div>
      </div>

      {/* CoachHelm signal strip — SG:Total (+ standing tier), Focus areas,
          Goals. The rest of what already gets computed server-side for this
          player (player-fingerprint.ts, standing/loader.ts, goals/loader.ts)
          surfaced at the list level so a coach doesn't have to open every
          player individually to triage the team. */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-4 md:px-6">
        <div className="min-w-0 rounded-fw-md bg-surface-sunken px-3 py-2.5">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">SG:Total</p>
          <p
            className={cn(
              'font-fw-mono text-body-lg font-semibold tabular-nums',
              player.sg_total != null ? sgTone(player.sg_total) : 'text-text-tertiary',
            )}
          >
            {player.sg_total != null ? formatSgTotal(player.sg_total) : '—'}
          </p>
          {player.standing_tier ? (
            // Wraps rather than truncating: at 390pt this cell is ~77px of text
            // width while the tier phrases run 19-25 characters ("Top quartile
            // on your team"), so `truncate` cut inside the phrase and left
            // "Top quartile…" — and the `title` tooltip that was the fallback
            // does nothing on a touch device (owner device report, 2026-08-26).
            <p className="mt-0.5 font-fw-sans text-caption leading-tight text-text-tertiary">
              {player.standing_tier}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1 rounded-fw-md bg-surface-sunken px-3 py-2.5">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">Focus</p>
          {player.active_focus_areas ? (
            // `whitespace-normal` deliberately overrides Badge's built-in
            // whitespace-nowrap (twMerge lets className win) — same fix as
            // TeamCategoryLeakBand's "N of M need work" pill. In this card's
            // 3-up mini-stat row at tablet/mobile-landscape widths, "3 active"
            // was wider than its ~1/3 grid cell and got clipped mid-word to
            // "3 activ" by the card's own overflow-hidden Surface
            // (GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1). Badge's `min-h`
            // (not a fixed height) lets the pill grow to a second line
            // instead of spilling past the card edge.
            <Badge tone="accent" size="sm" numeric className="w-fit whitespace-normal">
              {player.active_focus_areas} active
            </Badge>
          ) : (
            <span className="font-fw-sans text-caption text-text-tertiary">None yet</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1 rounded-fw-md bg-surface-sunken px-3 py-2.5">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">Goals</p>
          {player.active_goals ? (
            <Badge tone="accent" size="sm" numeric className="w-fit whitespace-normal">
              {player.active_goals}
            </Badge>
          ) : (
            <span className="font-fw-sans text-caption text-text-tertiary">None yet</span>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <Button asChild variant="primary" size="md" className="w-full" leftIcon={<Users className="h-4 w-4" />}>
          <Link href={`/golf/dashboard/roster/${player.id}`}>View player</Link>
        </Button>
      </div>
    </Surface>
  );
}

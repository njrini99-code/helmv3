'use client';

/** Fairway · Roster · FairwayPlayerCard (C9) — coach roster player card. */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { TrendGlyph } from '@/components/fairway';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { TrendVerdict } from '@/lib/coachhelm/trend';
import { yearLabel } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { FairwayIntentControl } from './FairwayIntentControl';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { isUserOnline } from './roster-helpers';
import { tintFor } from '@/components/fairway/controls/identity-tint';

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
  // Read on the deep green stat band (.fw-plinth-green): accent-ink is its
  // light mint there, and the amber is a light warm tone that holds contrast.
  if (value > SG_TONE_DEADZONE) return 'text-accent-ink';
  if (value < -SG_TONE_DEADZONE) return 'text-[oklch(0.86_0.11_75)]';
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
  const playerHref = `/golf/dashboard/roster/${player.id}`;
  // One quiet metadata line instead of a year pill plus a coloured dot (DS-N6).
  const year = yearLabel(player.graduation_year);
  const meta = [
    ...(online ? ['Online'] : []),
    ...(year ? [year] : []),
    ...(player.hometown && player.state ? [`${player.hometown}, ${player.state}`] : []),
  ];

  return (
    // In-flow roster card: the resting hairline, not a drop shadow (DS-E4).
    <Surface
      padding="none"
      className="overflow-hidden"
      // Session Replay masks all text by default (instrumentation-client.ts,
      // maskAllText: true) — this attribute is defense in depth so a player's
      // name/details stay masked even if that default is ever narrowed later.
      data-sentry-mask=""
    >
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar + online dot */}
          <div className="relative flex-shrink-0">
            <span
              className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-fw-md font-fw-display text-h3 font-semibold ring-1 ring-border-subtle md:h-[76px] md:w-[76px]"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase() || '—'
              )}
            </span>
            {/* Only "online" earns a dot, and the meta line below says it in
                words, so the colour never has to be decoded (DS-N7). */}
            {online ? (
              <span
                aria-hidden
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-surface bg-accent-fill"
              />
            ) : null}
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
            <Link
              href={playerHref}
              className="min-w-0 line-clamp-2 break-words rounded-fw-sm font-fw-display text-body-lg font-semibold leading-snug tracking-[-0.01em] text-text-primary outline-none [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {name}
            </Link>
            {meta.length > 0 ? (
              <p className="mt-0.5 min-w-0 truncate font-fw-sans text-caption text-text-secondary">
                {online ? <span className="font-medium text-accent-ink">Online</span> : null}
                {online && meta.length > 1 ? ' · ' : ''}
                {meta.filter((part) => part !== 'Online').join(' · ')}
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

      {/* Stat band: the three numbers a coach triages on, SG: Total, scoring
          average and rounds played, on the deep green plinth so they read at
          full contrast. Focus areas and goals are not shown on the card. */}
      <div className="px-5 pb-5 md:px-6">
        <dl className="fw-plinth-green grid grid-cols-3 overflow-hidden rounded-fw-md shadow-soft">
          <div className="flex min-w-0 flex-col gap-1 px-4 py-4">
            <dt className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              SG / rd
            </dt>
            <dd
              className={cn(
                'font-fw-display text-h2 font-semibold leading-none tracking-[-0.02em] tabular-nums',
                player.sg_total == null ? 'text-text-tertiary' : sgTone(player.sg_total),
              )}
            >
              {player.sg_total != null ? formatSgTotal(player.sg_total) : '—'}
            </dd>
            {player.standing_tier ? (
              <dd className="font-fw-sans text-caption leading-tight text-text-secondary">{player.standing_tier}</dd>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1 border-l border-border-subtle px-4 py-4">
            <dt className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Avg score
            </dt>
            <dd className="font-fw-display text-h2 font-semibold leading-none tracking-[-0.02em] tabular-nums text-text-primary">
              {hasScore ? (player.avg_score ?? 0).toFixed(1) : '—'}
            </dd>
            {player.recent_trend ? (
              <dd className="text-text-secondary">
                <TrendGlyph direction={player.recent_trend} className="text-caption font-medium" />
              </dd>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1 border-l border-border-subtle px-4 py-4">
            <dt className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Rounds
            </dt>
            <dd className="font-fw-display text-h2 font-semibold leading-none tracking-[-0.02em] tabular-nums text-text-primary">
              {player.rounds_count ?? 0}
            </dd>
            <dd className="font-fw-sans text-caption leading-tight text-text-secondary">played</dd>
          </div>
        </dl>
      </div>

      {/* A list of cards is not a list of primary actions: one quiet row link
          per card, the way an iOS grouped list drills in (NAT-06). */}
      <Link
        href={playerHref}
        className="flex min-h-[48px] items-center justify-between border-t border-border-subtle px-5 font-fw-sans text-body-sm font-semibold text-accent-ink outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken active:bg-surface-sunken md:px-6"
      >
        View player
        <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden />
      </Link>
    </Surface>
  );
}

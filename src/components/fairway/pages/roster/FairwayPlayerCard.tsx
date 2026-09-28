'use client';

/** Fairway · Roster · FairwayPlayerCard (C9) — coach roster player card. */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
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

function formatSgTotal(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

const TREND_COPY: Record<TrendVerdict, { arrow: string; text: string; className: string }> = {
  improving: { arrow: '↗', text: 'Improving', className: 'text-[oklch(0.88_0.12_150)]' },
  stable: { arrow: '→', text: 'Steady', className: 'text-[oklch(0.975_0.015_90/0.72)]' },
  declining: { arrow: '↘', text: 'Declining', className: 'text-[oklch(0.86_0.11_70)]' },
};

/** Trend under the average, in a light ink that holds on the deep green. */
function TrendCaption({ trend }: { trend: TrendVerdict }) {
  const copy = TREND_COPY[trend];
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', copy.className)}>
      <span aria-hidden>{copy.arrow}</span>
      {copy.text}
    </span>
  );
}

function StatCell({
  label,
  value,
  muted,
  caption,
}: {
  label: string;
  value: string;
  muted: boolean;
  caption: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col px-4 py-4 md:px-5">
      <dt className="font-fw-sans text-eyebrow font-semibold uppercase leading-none tracking-[0.09em] text-[oklch(0.975_0.015_90/0.66)]">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-2.5 font-fw-sans text-h2 font-semibold leading-none tracking-[-0.02em] tabular-nums',
          muted ? 'text-[oklch(0.975_0.015_90/0.5)]' : 'text-[oklch(0.985_0.012_90)]',
        )}
      >
        {value}
      </dd>
      {caption ? (
        <dd className="mt-2 font-fw-sans text-caption leading-snug text-[oklch(0.975_0.015_90/0.72)]">{caption}</dd>
      ) : null}
    </div>
  );
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
    ...(player.handicap != null ? [`HCP ${player.handicap}`] : []),
  ];

  return (
    // In-flow roster card: the resting hairline, not a drop shadow (DS-E4).
    // Raised card (owner: "more depth"): a soft two-layer lift plus the lit
    // top edge, instead of the flat resting hairline.
    <Surface
      padding="none"
      elevation="shadow"
      className="overflow-hidden border border-border-subtle [box-shadow:inset_0_1px_0_oklch(1_0_0/0.6),0_1px_2px_oklch(0.18_0.01_60/0.06),0_10px_24px_-8px_oklch(0.25_0.03_70/0.22)]"
      // Session Replay masks all text by default (instrumentation-client.ts,
      // maskAllText: true) — this attribute is defense in depth so a player's
      // name/details stay masked even if that default is ever narrowed later.
      data-sentry-mask=""
    >
      <div className="px-5 pb-5 pt-6 md:px-6 md:pt-7">
        <div className="flex items-center gap-5">
          {/* Avatar + online dot */}
          <div className="relative flex-shrink-0">
            <span
              className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-fw-lg font-fw-display text-h2 font-semibold ring-4 ring-surface [box-shadow:0_0_0_5px_var(--fw-color-border-subtle),0_10px_22px_-10px_oklch(0.25_0.03_70/0.45)] md:h-[104px] md:w-[104px]"
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
                className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full border-4 border-surface bg-accent-fill"
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
          <div className="min-w-0 flex-1">
            <Link
              href={playerHref}
              className="min-w-0 line-clamp-2 break-words rounded-fw-sm font-fw-display text-h3 font-semibold leading-tight tracking-[-0.015em] text-text-primary outline-none [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {name}
            </Link>
            {meta.length > 0 ? (
              <p className="mt-1 min-w-0 truncate font-fw-sans text-body-sm text-text-secondary">
                {online ? <span className="font-medium text-accent-ink">Online</span> : null}
                {online && meta.length > 1 ? ' · ' : ''}
                {meta.filter((part) => part !== 'Online').join(' · ')}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
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

      {/* Stat band: the three numbers a coach triages on, SG per round,
          scoring average and rounds played, on the deep green plinth so they
          read at full contrast. One type system for all three columns: a small
          tracked label, a large tabular figure, one caption line. */}
      <div className="px-5 pb-5 md:px-6">
        <dl className="fw-plinth-green grid grid-cols-3 divide-x divide-[oklch(0.975_0.015_90/0.16)] overflow-hidden rounded-fw-md bg-gradient-to-b from-[oklch(0.42_0.09_152)] to-[oklch(0.35_0.08_152)] [box-shadow:inset_0_1px_0_oklch(1_0_0/0.14),0_8px_18px_-8px_oklch(0.25_0.07_152/0.55)]">
          <StatCell
            label="SG / round"
            value={player.sg_total != null ? formatSgTotal(player.sg_total) : '—'}
            muted={player.sg_total == null}
            caption={player.standing_tier ?? null}
          />
          <StatCell
            label="Avg score"
            value={hasScore ? (player.avg_score ?? 0).toFixed(1) : '—'}
            muted={!hasScore}
            caption={player.recent_trend ? <TrendCaption trend={player.recent_trend} /> : null}
          />
          <StatCell
            label="Rounds"
            value={String(player.rounds_count ?? 0)}
            muted={!player.rounds_count}
            caption="played"
          />
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

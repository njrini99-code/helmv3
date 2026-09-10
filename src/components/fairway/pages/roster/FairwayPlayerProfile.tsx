'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayPlayerProfile (D1) — coach player dossier
 * ----------------------------------------------------------------------------
 * FACELIFT (docs/design/fairway-facelift/screens/player-dossier.md): the
 * coach-facing player page reached from the roster (Roster → player). It is
 * an unboxed identity MASTHEAD (avatar, name, class year, one-line standing
 * summary) with ONE primary action (Message) and an overflow Menu, then a
 * StatMatrix of headline numbers, a StandingBars readout, focus areas and
 * recent rounds as seam rows inside single Surfaces, and a tab row (Game /
 * Genome / Rounds) — replacing the old hero card + Message pill + "member
 * since" line, the three link cards, and the always-on StatsSpineStage block.
 *
 * `Game` and `Genome` navigate to their own routes (`/players/[id]/game`,
 * `/players/[id]/genome`) — each already has its own data loader and its own
 * internal tab switcher (Game Fingerprint / Scouting Report). `Rounds` stays
 * on THIS page and mounts `<StatsSpineStage>` unchanged: it is a separately-
 * loaded, shared component (also used by the player's own `/dashboard/stats`)
 * with its own `?area=` StageRouter — composed here, not forked or edited.
 *
 * The only mutations reachable here are non-destructive: status change and
 * "Remove from Team" (behind an explicit confirm) inside
 * `FairwayPlayerActionsMenu`, already the roster board's own row-action menu.
 *
 * ADDITIVE ONLY — a client component; the server page hands it plain
 * serializable props (including a `serverNowMs` anchor so relative-freshness
 * text agrees between server and client first paint — see `relativeTimeFrom`).
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Surface,
  Button,
  Chip,
  Eyebrow,
  InsetGroup,
  InsufficientData,
  Segmented,
  StatMatrix,
  type StatMatrixItem,
  type SegmentedOption,
} from '@/components/fairway';
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { IconMessage } from '@/components/icons';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';
import { StatsSpineStage } from '@/components/golf/stats/spine-stage/StatsSpineStage';
import { buildStandingBars, buildVerdict } from '@/components/golf/stats/spine-stage/buildStatsViewModel';
import { relativeTimeFrom } from '@/components/fairway/notifications/time-format';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

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

export interface FairwayPlayerProfileFocusArea {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  created_at: string;
}

export interface FairwayPlayerProfileRound {
  id: string;
  round_date: string | null;
  course_name: string | null;
  total_score: number | null;
  score_to_par: number | null;
}

export interface FairwayPlayerProfileProps {
  player: FairwayPlayerProfilePlayer;
  /** golf_team_members.status for this player on the coach's team. */
  membershipStatus: string | null;
  /** Career (`overall`) detailed stats — null when the read failed. */
  detailedStats: GolfStats | null;
  /** SG standing rows (you / team / Tour) — [] when unavailable. */
  standingRows: PlayerStandingRow[];
  /** Up to 3 non-completed focus areas, newest first. */
  focusAreas: FairwayPlayerProfileFocusArea[];
  /** Up to 4 most recent scored rounds, newest first. */
  recentRounds: FairwayPlayerProfileRound[];
  /** Server wall-clock at render time — anchors relative-time text. */
  serverNowMs: number;
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

/** `round_date` is a plain YYYY-MM-DD calendar date — split it rather than
 * routing it through `new Date()`, which resolves midnight UTC and renders
 * the previous day for anyone west of Greenwich (same rule StatsSpineStage's
 * `formatRoundDate` follows). */
function formatRoundDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : iso;
}

function formatPct(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

function formatOne(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : '—';
}

type DossierTab = 'game' | 'genome' | 'rounds';

const TAB_OPTIONS: SegmentedOption<DossierTab>[] = [
  { value: 'game', label: 'Game' },
  { value: 'genome', label: 'Genome' },
  { value: 'rounds', label: 'Rounds' },
];

/* ---------------------------------------------------------------------------
 * FairwayPlayerProfile
 * ------------------------------------------------------------------------- */

export function FairwayPlayerProfile({
  player,
  membershipStatus,
  detailedStats,
  standingRows,
  focusAreas,
  recentRounds,
  serverNowMs,
  className,
}: FairwayPlayerProfileProps) {
  const router = useRouter();
  const name = fullName(player);
  const tint = tintFor(player.id);
  const location = [player.hometown, player.state].filter(Boolean).join(', ');

  // Mount-gated "now" — starts at the server's timestamp (agrees with first
  // paint) then advances, matching the relativeTimeFrom contract (a
  // Date.now() default here would drift between server and client renders).
  const [nowMs, setNowMs] = useState(serverNowMs);
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [tab, setTab] = useState<DossierTab>('rounds');

  function onTabChange(next: DossierTab) {
    if (next === 'game') {
      router.push(`/golf/dashboard/players/${player.id}/game`);
      return;
    }
    if (next === 'genome') {
      router.push(`/golf/dashboard/players/${player.id}/genome`);
      return;
    }
    setTab('rounds');
  }

  const sgTotalRow = useMemo(
    () => standingRows.find((r) => r.metric_id === 'sg_total') ?? null,
    [standingRows],
  );
  const standingBarsProps = useMemo(
    () => buildStandingBars(sgTotalRow, 'coach', name),
    [sgTotalRow, name],
  );
  const verdict = useMemo(
    () => buildVerdict(sgTotalRow?.player_value ?? null, null),
    [sgTotalRow],
  );

  const statMatrixItems: StatMatrixItem[] = [
    { label: 'Scoring avg', value: formatOne(detailedStats?.scoringAverage) },
    { label: 'Rounds', value: detailedStats?.roundsPlayed ?? 0 },
    { label: 'Fairways', value: formatPct(detailedStats?.fairwayPercentage) },
    { label: 'GIR', value: formatPct(detailedStats?.girPercentage) },
    { label: 'Putts/rd', value: formatOne(detailedStats?.puttsPerRound) },
  ];

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

      <div className="flex flex-col gap-6">
        {/* ── Masthead — unboxed identity, one primary action, overflow Menu ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-fw-md font-fw-display text-h3 font-semibold ring-1 ring-border-subtle"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(player)
              )}
            </span>

            <div className="min-w-0">
              <h1 className="break-words font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
                {name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <FairwayYearBadge year={player.graduation_year} />
                <FairwayPlayerStatusBadge
                  playerId={player.id}
                  currentStatus={membershipStatus}
                  editable
                  size="sm"
                />
                {location ? (
                  <span className="font-fw-sans text-caption text-text-tertiary">{location}</span>
                ) : null}
              </div>
              <p className="mt-1.5 font-fw-sans text-body-sm text-text-secondary">{verdict}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 self-start">
            <Button asChild variant="primary" size="sm" leftIcon={<IconMessage size={16} />}>
              <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message</Link>
            </Button>
            <FairwayPlayerActionsMenu
              playerId={player.id}
              playerName={name}
              currentStatus={membershipStatus}
              email={player.email}
              phone={player.phone}
            />
          </div>
        </div>

        {/* ── Headline numbers ── */}
        <StatMatrix label="Season" items={statMatrixItems} variant="matte" />

        {/* ── Standing ── */}
        <Surface elevation="border" padding="md">
          <Eyebrow as="h3" tone="accent">
            Standing
          </Eyebrow>
          {standingBarsProps ? (
            <div className="mt-3">
              <StandingBars {...standingBarsProps} frame="bare" />
            </div>
          ) : (
            <div className="mt-3">
              <InsufficientData
                title="Standing fills in after 5+ rounds"
                description="Strokes-gained vs the team and Tour needs a minimum sample of shot-tracked rounds."
              />
            </div>
          )}
        </Surface>

        {/* ── Focus areas + recent rounds — seam rows, not card grids ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Surface elevation="border" padding="md">
            <Eyebrow as="h3" tone="accent">
              Focus areas
            </Eyebrow>
            {focusAreas.length > 0 ? (
              <InsetGroup className="mt-3">
                {focusAreas.map((fa) => (
                  <InsetGroup.Row
                    key={fa.id}
                    trailing={
                      <Chip size="sm" tone={fa.status === 'in_progress' ? 'accent' : 'neutral'}>
                        {fa.status === 'in_progress' ? 'In progress' : (fa.status ?? 'Open')}
                      </Chip>
                    }
                  >
                    {fa.title ?? fa.area_type ?? 'Focus area'}
                  </InsetGroup.Row>
                ))}
              </InsetGroup>
            ) : (
              <p className="mt-3 font-fw-sans text-body-sm text-text-tertiary">
                No open focus areas. Add one from the Genome tab.
              </p>
            )}
          </Surface>

          <Surface elevation="border" padding="md">
            <Eyebrow as="h3" tone="accent">
              Recent rounds
            </Eyebrow>
            {recentRounds.length > 0 ? (
              <InsetGroup className="mt-3">
                {recentRounds.map((r) => (
                  <InsetGroup.Row
                    key={r.id}
                    as={Link}
                    href={`/golf/dashboard/rounds/${r.id}`}
                    trailing={
                      r.total_score != null ? (
                        <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">
                          {r.total_score}
                        </span>
                      ) : undefined
                    }
                  >
                    {[r.round_date ? formatRoundDate(r.round_date) : null, r.course_name]
                      .filter(Boolean)
                      .join(' · ') || 'Round'}
                  </InsetGroup.Row>
                ))}
              </InsetGroup>
            ) : (
              <p className="mt-3 font-fw-sans text-body-sm text-text-tertiary">
                No scored rounds yet.
              </p>
            )}
            {recentRounds[0]?.round_date ? (
              <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
                Last played {relativeTimeFrom(recentRounds[0].round_date, nowMs)}
              </p>
            ) : null}
          </Surface>
        </div>

        {/* ── Tabs: Game / Genome / Rounds ── */}
        <div className="flex flex-col gap-4">
          <Segmented<DossierTab>
            options={TAB_OPTIONS}
            value={tab}
            onValueChange={onTabChange}
            aria-label="Player dossier view"
          />
          {tab === 'rounds' ? <StatsSpineStage playerId={player.id} isOwnStats={false} playerName={name} /> : null}
        </div>
      </div>
    </div>
  );
}

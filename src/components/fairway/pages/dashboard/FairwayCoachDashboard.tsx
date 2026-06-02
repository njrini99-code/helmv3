'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayCoachDashboard  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The warm "Fairway" rebuild of the coach /golf/dashboard — a calm executive
 * command center. This is a PRESENTATION + LAYOUT + ORGANIZATION rebuild only:
 * it accepts the EXACT same props the existing `CoachDashboard` receives
 * (`data` / `enhancedData` / `dateRange` from `dashboard-data.ts`) and reuses
 * every value unchanged. No data fetching, no server actions, no mutations are
 * defined or altered here.
 *
 * Architecture reorganization vs the legacy CoachDashboard (per
 * dashboard-home.json coach entry):
 *   • ONE <h1> — a single ViewHeader (Fraunces greeting) replaces the stacked
 *     LargeTitleHeader + PageHeader plinth double-h1 (a11y mustFix).
 *   • Quick actions PROMOTED out of the page bottom into the ViewHeader action
 *     cluster (Add Player primary · Schedule / Create Qualifier secondary) as
 *     ONE shared Button vocabulary — no `.pill-soft`-on-Button, no bespoke Links.
 *   • Date range is a quiet Segmented control in a calm toolbar band (preserves
 *     the ?range router.push contract — logic unchanged).
 *   • NEW CoachHelm signal strip is the ONE glass-hero (InsightCard variant=hero)
 *     + a What's New / Open CoachHelm entry — fixing "AI absent from home". It is
 *     sourced ONLY from counts that exist (see coach-signal.ts); it NEVER renders
 *     an authoritative effectiveness/prediction-accuracy figure (data-gap:high).
 *   • Team KPIs are matte MetricCards that show honest insufficient-data when
 *     round coverage is low (never authoritative zeros, data-gap:medium).
 *   • Recent Rounds becomes a clean DataTable; Performance Trend + Team Pulse +
 *     Top Performers collapse into one calm "Team" region on matte Surfaces.
 *   • Coach-without-team becomes an OnboardingStep funnel, not a zeroed page.
 *
 * Rendered inside the `.fairway-ds` scope on `bg-canvas`. Exactly ONE glass
 * surface (the hero strip); every content card is matte. Single h1; slow
 * cinematic motion via the primitives' own reveal (honors reduced motion).
 * ========================================================================== */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ViewHeader,
  Surface,
  Inset,
  MetricCard,
  InsightCard,
  DataTable,
  Segmented,
  Button,
  StatusPill,
  Avatar,
  InlineNotice,
  EmptyState,
  InsufficientData,
  OnboardingStep,
  OnboardingSteps,
  TrendChart,
  type ColumnDef,
  type TrendPoint,
} from '@/components/fairway';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconPlus,
  IconCopy,
  IconCheck,
  IconGolf,
  IconTarget,
  IconSparkles,
  IconArrowRight,
} from '@/components/icons';
import { Users as LucideUsers, Flag as LucideFlag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JoinRequestAlert } from '@/components/golf/roster/JoinRequestAlert';
import type {
  CoachDashboardPayload,
  DashboardDateRange,
} from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/CoachDashboard';
import { deriveCoachSignal } from './coach-signal';

/* ──────────────────────────────────────────────────────────────────────────
 * Props — identical contract to the legacy CoachDashboard
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayCoachDashboardProps {
  data: CoachDashboardData;
  enhancedData?: CoachDashboardPayload | null;
  dateRange?: DashboardDateRange;
}

const RANGE_OPTIONS: { value: DashboardDateRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'season', label: 'Season' },
  { value: 'all', label: 'All' },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Recent-round row shape (from the existing data contract)
 * ────────────────────────────────────────────────────────────────────────── */

type RoundRow = CoachDashboardData['recentRounds'][number];

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Pin to UTC: round_date is a date-only column, so format it the same on
  // the server and the client to avoid a hydration mismatch (React #418) and
  // an off-by-one day for clients west of UTC.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayCoachDashboard({
  data,
  enhancedData,
  dateRange: initialRange = 'all',
}: FairwayCoachDashboardProps) {
  const { coach, team, stats, recentRounds, topPlayers, teamScoringTrend } = data;
  const router = useRouter();

  const [range, setRange] = useState<DashboardDateRange>(initialRange);
  const [copied, setCopied] = useState(false);

  const firstName = coach.full_name?.split(' ')[0] || 'Coach';

  // PRESERVED LOGIC: range change keeps the force-dynamic ?range re-fetch
  // contract (router.push). Presentation is calm; the contract is unchanged.
  const handleRangeChange = useCallback(
    (next: string) => {
      const value = next as DashboardDateRange;
      setRange(value);
      router.push(value === 'all' ? '/golf/dashboard' : `/golf/dashboard?range=${value}`);
    },
    [router],
  );

  // PRESERVED LOGIC: invite-code copy-to-clipboard handler (same behavior as
  // the legacy InviteCodeCard).
  const handleCopy = useCallback(async () => {
    const code = team?.join_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [team?.join_code]);

  const signal = useMemo(
    () => deriveCoachSignal(enhancedData, stats.rosterSize),
    [enhancedData, stats.rosterSize],
  );

  // ── COACH-WITHOUT-TEAM → onboarding funnel (not a zeroed dashboard) ──────
  if (!team) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 md:px-8 md:py-14">
        <ViewHeader
          eyebrow="Coach Dashboard"
          title={`Welcome, ${firstName}`}
          description="Create or join a team to unlock your roster, calendar, qualifiers and the CoachHelm intelligence layer."
        />
        <Surface elevation="border" padding="lg">
          <OnboardingSteps label="Get your team set up">
            <OnboardingStep
              index={1}
              status="active"
              title="Create or join a team"
              description="Set up your program so rounds, events and stats have a home."
              action={
                <Button variant="primary" size="sm" asChild>
                  <Link href="/golf/dashboard/team">Set up team</Link>
                </Button>
              }
            />
            <OnboardingStep
              index={2}
              status="upcoming"
              title="Invite your roster"
              description="Share a join code so players can log rounds."
            />
            <OnboardingStep
              index={3}
              status="upcoming"
              title="Log the first rounds"
              description="CoachHelm starts surfacing signals as activity builds."
              hasConnector={false}
            />
          </OnboardingSteps>
        </Surface>
      </div>
    );
  }

  // ── Honest KPI coverage gate (data-gap:medium) ───────────────────────────
  // Team aggregates are only trustworthy once a few players have rounds. Use
  // the real value when present; otherwise show insufficient-data, NEVER a
  // zero presented as a real team number.
  const roundsLogged = recentRounds.length;
  const scoringAvg = enhancedData?.sparklines.scoringAvg.value ?? stats.teamScoringAverage;
  const girValue = enhancedData?.sparklines.girPct.value ?? null;
  const puttsValue = enhancedData?.sparklines.puttsPerRound.value ?? null;

  const hasTrend = !!teamScoringTrend && teamScoringTrend.length >= 2;
  const trendPoints: TrendPoint[] = hasTrend
    ? teamScoringTrend!.map((p) => ({ x: p.label, y: p.value }))
    : [];
  const trendFirst = trendPoints[0];
  const trendLast = trendPoints[trendPoints.length - 1];
  // Only surface a directional takeaway when the swing clears noise (>= 0.75
  // strokes). A sub-noise drift (e.g. 76.3 → 76.0) reads as flat, not a trend.
  const trendTakeaway =
    trendFirst && trendLast && Math.abs(trendLast.y - trendFirst.y) >= 0.75
      ? trendLast.y < trendFirst.y
        ? 'Trending lower — the team is scoring better over the window.'
        : 'Scoring average has drifted up over the window.'
      : undefined;

  const showInviteNotice =
    !!team.join_code && stats.rosterSize < 20;
  const rosterFull = !!team.join_code && stats.rosterSize >= 20;

  // Recent-rounds DataTable columns
  const roundColumns: ColumnDef<RoundRow, unknown>[] = [
    {
      accessorKey: 'player_name',
      header: 'Player',
      meta: { noWrap: true },
      cell: (ctx) => {
        const row = ctx.row.original;
        return (
          <span className="inline-flex items-center gap-2.5">
            <Avatar name={row.player_name} src={row.player_avatar_url} size="sm" />
            <span className="font-medium text-text-primary">{row.player_name}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'course_name',
      header: 'Course',
      meta: { noWrap: true },
      cell: (ctx) => (
        <span className="text-text-secondary">{ctx.getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'total_score',
      header: 'Score',
      meta: { align: 'right', numeric: true },
    },
    {
      accessorKey: 'total_to_par',
      header: 'To Par',
      meta: { align: 'right', numeric: true },
      cell: (ctx) => formatToPar(ctx.getValue() as number),
    },
    {
      accessorKey: 'round_date',
      header: 'Date',
      meta: { align: 'right', noWrap: true },
      cell: (ctx) => (
        <span className="text-text-tertiary">{shortDate(ctx.getValue() as string)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-5 py-8 md:gap-10 md:px-8 md:py-10">
      {/* ── 1 · MASTHEAD — single h1 + promoted action cluster ─────────────── */}
      <ViewHeader
        eyebrow="Coach Dashboard"
        title={`Good day, ${firstName}`}
        description={
          stats.rosterSize === 0
            ? 'Invite players to start tracking rounds, qualifiers and team performance.'
            : `${team.name} · ${stats.rosterSize} ${stats.rosterSize === 1 ? 'player' : 'players'} on the roster${
                stats.upcomingEvents > 0
                  ? ` · ${stats.upcomingEvents} upcoming ${stats.upcomingEvents === 1 ? 'event' : 'events'}`
                  : ''
              }`
        }
        secondaryActions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/golf/dashboard/calendar">
                <IconCalendar size={16} />
                <span>Schedule</span>
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/golf/dashboard/qualifiers">
                <IconFlag size={16} />
                <span>Qualifier</span>
              </Link>
            </Button>
          </>
        }
        primaryAction={
          <Button variant="primary" asChild>
            <Link href="/golf/dashboard/roster">
              <IconPlus size={16} />
              <span>Add Player</span>
            </Link>
          </Button>
        }
      />

      {/* ── 2 · Quiet toolbar band: date-range scope (calm, not glass) ─────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
          Window
        </span>
        <Segmented
          value={range}
          onValueChange={handleRangeChange}
          options={RANGE_OPTIONS}
          aria-label="Performance window"
        />
      </div>

      {/* Roster join-request approvals — preserved logic (roster.ts handlers) */}
      <JoinRequestAlert />

      {/* ── 3 · THE ONE GLASS HERO — CoachHelm signal strip ────────────────── */}
      <InsightCard
        variant="hero"
        priority={signal.priority}
        overline={signal.overline}
        title={signal.title}
        icon={<IconSparkles size={20} />}
        empty={signal.insufficient}
        emptyMessage={signal.body}
        actions={
          <>
            <Button variant="primary" size="sm" asChild>
              <Link href="/golf/dashboard/intelligence">
                <span>Open CoachHelm</span>
                <IconArrowRight size={16} />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/golf/dashboard/whats-new">What&apos;s New</Link>
            </Button>
          </>
        }
      >
        {signal.body}
      </InsightCard>

      {/* ── 4 · TEAM KPIs — matte MetricCards, honest insufficient-data ────── */}
      <section aria-label="Team performance" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {scoringAvg != null ? (
            <MetricCard
              label="Scoring Avg"
              value={Number(scoringAvg.toFixed(1))}
              decimals={1}
              icon={<IconChartBar size={18} />}
              goodDirection="down"
              footnote={`${roundsLogged} ${roundsLogged === 1 ? 'round' : 'rounds'} in window`}
            />
          ) : (
            <Surface elevation="border" padding="sm">
              <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                Scoring Avg
              </span>
              <InsufficientData compact unit="rounds" current={roundsLogged} required={3} className="mt-3" />
            </Surface>
          )}

          {girValue != null ? (
            <MetricCard
              label="GIR %"
              value={Number(girValue.toFixed(0))}
              suffix="%"
              icon={<IconTarget size={18} />}
              goodDirection="up"
            />
          ) : (
            <Surface elevation="border" padding="sm">
              <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">GIR %</span>
              <InsufficientData compact unit="rounds" current={roundsLogged} required={3} className="mt-3" />
            </Surface>
          )}

          {puttsValue != null ? (
            <MetricCard
              label="Putts / Rd"
              value={Number(puttsValue.toFixed(1))}
              decimals={1}
              icon={<IconGolf size={18} />}
              goodDirection="down"
            />
          ) : (
            <Surface elevation="border" padding="sm">
              <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                Putts / Rd
              </span>
              <InsufficientData compact unit="rounds" current={roundsLogged} required={3} className="mt-3" />
            </Surface>
          )}

          {/* Roster is a real count (not a derived aggregate) — always honest. */}
          <MetricCard
            label="Roster"
            value={stats.rosterSize}
            icon={<IconUsers size={18} />}
            footnote={
              stats.activeQualifiers > 0
                ? `${stats.activeQualifiers} active ${stats.activeQualifiers === 1 ? 'qualifier' : 'qualifiers'}`
                : undefined
            }
          />
        </div>

        {/* Invite + roster-cap notices as quiet matte status, not heavy cards */}
        {showInviteNotice ? (
          <InlineNotice
            tone="info"
            icon={LucideUsers}
            title="Share your invite code"
            action={
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                <span className="font-fw-mono tracking-[0.18em]">
                  {copied ? 'Copied' : team.join_code}
                </span>
              </Button>
            }
          >
            Players join from the welcome screen with this code.
          </InlineNotice>
        ) : null}
        {rosterFull ? (
          <InlineNotice tone="warning" title="Roster full">
            Your invite code is hidden because the roster has reached the 20-player limit.
          </InlineNotice>
        ) : null}
      </section>

      {/* ── 5 · RECENT ROUNDS — clean DataTable ────────────────────────────── */}
      <section aria-label="Recent rounds" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Recent Rounds</h2>
          <Link
            href="/golf/dashboard/rounds"
            className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
          >
            View all
            <IconArrowRight size={14} />
          </Link>
        </div>
        {recentRounds.length === 0 ? (
          <Surface elevation="border" padding="md">
            <EmptyState
              variant="subtle"
              icon={LucideFlag}
              title={range !== 'all' ? 'No rounds in this window' : 'No rounds logged yet'}
              description={
                range !== 'all'
                  ? 'Try a wider window, or have players log rounds from their dashboard.'
                  : 'Players can submit rounds from their dashboard — they’ll appear here.'
              }
            />
          </Surface>
        ) : (
          <DataTable<RoundRow>
            data={recentRounds.slice(0, 8)}
            columns={roundColumns}
            ariaLabel="Recent team rounds"
            getRowId={(r) => r.id}
            density="comfortable"
          />
        )}
      </section>

      {/* ── 6 · TEAM region — Trend + Pulse + Top Performers (matte) ────────── */}
      <section aria-label="Team" className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Performance trend (reskin-preserve-logic: same teamScoringTrend) */}
        <div className="lg:col-span-3">
          {hasTrend ? (
            <TrendChart
              title="Performance Trend"
              overline="Team scoring average"
              data={trendPoints}
              valueFormatter={(v) => v.toFixed(1)}
              takeaway={trendTakeaway}
            />
          ) : (
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Performance Trend
              </h3>
              <InsufficientData
                title="Trend appears as rounds build"
                description="Trends need rounds across multiple months. Invite players and keep logging."
              />
              <div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/golf/dashboard/roster">
                    <IconPlus size={16} />
                    <span>Invite Players</span>
                  </Link>
                </Button>
              </div>
            </Surface>
          )}
        </div>

        {/* Team pulse + top performers stacked */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <TeamPulsePanel pulse={enhancedData?.teamPulse} />

          <Surface elevation="border" padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Top Performers
              </h3>
              <Link
                href="/golf/dashboard/stats/team"
                className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
              >
                Rankings
                <IconArrowRight size={14} />
              </Link>
            </div>
            {topPlayers.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {topPlayers.slice(0, 5).map((p, i) => (
                  <li key={p.id}>
                    <Inset
                      padding="sm"
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'grid h-6 w-6 shrink-0 place-items-center rounded-full font-fw-mono text-caption font-medium tabular-nums',
                            i === 0
                              ? 'bg-accent-500 text-text-on-accent'
                              : 'bg-surface text-text-tertiary',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate font-fw-sans text-body font-medium text-text-primary">
                          {p.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="font-fw-mono text-body font-medium tabular-nums text-text-primary">
                          {p.avg_score.toFixed(1)}
                        </span>
                        <span className="font-fw-sans text-caption text-text-tertiary">
                          {p.rounds} rd
                        </span>
                      </span>
                    </Inset>
                  </li>
                ))}
              </ul>
            ) : (
              <InsufficientData
                compact
                title="No leaderboard yet"
                description="Player averages appear once rounds are logged."
              />
            )}
          </Surface>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Team pulse — quiet matte panel (replaces the heavy TeamPulseCard).
 * Honest: shows insufficient-data when there is no trend signal yet.
 * ────────────────────────────────────────────────────────────────────────── */

function TeamPulsePanel({ pulse }: { pulse?: CoachDashboardPayload['teamPulse'] }) {
  const improving = pulse?.improving ?? 0;
  const stable = pulse?.stable ?? 0;
  const declining = pulse?.declining ?? 0;
  const roundsThisWeek = pulse?.roundsThisWeek ?? 0;
  const tracked = improving + stable + declining;

  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">Team Pulse</h3>
        {roundsThisWeek > 0 ? (
          <StatusPill tone="accent" dot>
            {roundsThisWeek} this week
          </StatusPill>
        ) : null}
      </div>

      {tracked === 0 ? (
        <InsufficientData
          compact
          title="No movement to read yet"
          description="Pulse compares recent rounds. It fills in as players log activity."
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-fw-success">
              {improving}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Improving</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-text-secondary">
              {stable}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Stable</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-fw-warning">
              {declining}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Declining</span>
          </Inset>
        </div>
      )}

      {pulse?.topMover && pulse.topMover.delta !== 0 ? (
        <Inset padding="sm" className="flex items-center justify-between gap-3">
          <span className="font-fw-sans text-body-sm text-text-secondary">
            Top mover · <span className="font-medium text-text-primary">{pulse.topMover.name}</span>
          </span>
          <span
            className={cn(
              'font-fw-mono text-body-sm font-medium tabular-nums',
              // delta is a POSITIVE improvement magnitude (olderAvg - recentAvg),
              // so a positive delta means the player improved → success green.
              pulse.topMover.delta > 0 ? 'text-fw-success' : 'text-fw-warning',
            )}
          >
            {pulse.topMover.delta > 0 ? '−' : '+'}
            {Math.abs(pulse.topMover.delta).toFixed(1)}
          </span>
        </Inset>
      ) : null}
    </Surface>
  );
}

'use client';

/**
 * ============================================================================
 * FairwayCoachDashboard: the coach home as a field sheet
 * ----------------------------------------------------------------------------
 * Composition per docs/design/fairway-facelift/LANGUAGE.md:
 *   1. Masthead, bare: date and team eyebrow with the actions, the greeting,
 *      the verdict sentence built from the payload, a facts line.
 *   2. The stage, the one Surface: ScoreField (every player's rounds on a
 *      shared date axis) with the window control in its header and the team
 *      readouts (scoring, GIR, putts, rounds) in a right column.
 *   3. The ledger row, bare columns: Today, Attention, Latest.
 *   4. Recent rounds as a dense table.
 * No hero metric tiles, no chart in a card, no client-only breakpoint branch
 * (phone layouts are CSS gated). The no-team onboarding branch, join request
 * alert and invite notices are preserved from the previous composition.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ViewHeader,
  Surface,
  Segmented,
  Button,
  IconButton,
  Menu,
  InlineNotice,
  EmptyState,
  OnboardingStep,
  OnboardingSteps,
} from '@/components/fairway';
import { ScoreField, scoreFieldCap } from '@/components/fairway/modules';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { computeSeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { IconFlag, IconPlus, IconCopy, IconCheck, IconMoreHorizontal } from '@/components/icons';
import { getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import { Users as LucideUsers, Flag as LucideFlag } from 'lucide-react';
import { FairwayJoinRequestAlert } from '@/components/fairway/pages/roster/FairwayJoinRequestAlert';
import { NotificationsLatestModule } from '@/components/fairway/notifications';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import type { CoachDashboardPayload, DashboardDateRange } from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { DayScheduleEvent } from './DaySchedule';
import { TodayPanel } from './TodayPanel';
import { attentionOrder, buildVerdict, fieldDomain, rollupPlayers, sortByStanding } from './coach-home-logic';
import { AttentionLedger, FieldReadouts, RoundsLedgerTable, SectionHead, VerdictLine, type ReadoutItem } from './coach-home-parts';

export interface FairwayCoachDashboardProps {
  data: CoachDashboardData;
  enhancedData?: CoachDashboardPayload | null;
  dateRange?: DashboardDateRange;
  joinRequests?: JoinRequestData[];
  greeting?: string;
  todayLabel?: string;
}

const RANGE_OPTIONS: { value: DashboardDateRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'season', label: 'Season' },
  { value: 'all', label: 'All' },
];

const RANGE_SENTENCE: Record<DashboardDateRange, string> = {
  '7d': 'the last 7 days',
  '30d': 'the last 30 days',
  '90d': 'the last 90 days',
  season: 'this season',
  all: 'all time',
};

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FairwayCoachDashboard({
  data,
  enhancedData,
  dateRange: initialRange = 'all',
  joinRequests,
  greeting: serverGreeting,
  todayLabel,
}: FairwayCoachDashboardProps) {
  const { coach, team, stats, recentRounds, topPlayers } = data;
  const teamStatsUnavailable = enhancedData?.teamStatsUnavailable ?? false;
  const router = useRouter();
  const badges = useNotificationBadges();
  const [range, setRange] = useState<DashboardDateRange>(initialRange);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRange(initialRange);
  }, [initialRange]);

  const firstName = coach.full_name?.split(' ')[0] || 'Coach';
  const tzForGreeting = enhancedData?.timezone;
  const [clientGreeting, setClientGreeting] = useState<string | null>(null);
  useEffect(() => {
    if (serverGreeting) return;
    const tz = tzForGreeting || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      setClientGreeting(getGreeting(timeOfDayForHour(getCurrentDecimalHourInTz(tz))));
    } catch {
      setClientGreeting('Welcome back');
    }
  }, [serverGreeting, tzForGreeting]);
  const greeting = `${serverGreeting ?? clientGreeting ?? 'Welcome back'}, ${firstName}.`;

  const handleRangeChange = useCallback(
    (next: string) => {
      const value = next as DashboardDateRange;
      setRange(value);
      router.push(value === 'all' ? '/golf/dashboard' : `/golf/dashboard?range=${value}`);
    },
    [router],
  );

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

  /* ── Stage data ─────────────────────────────────────────────────────── */
  const rollups = useMemo(
    () => rollupPlayers(recentRounds, enhancedData?.roster, topPlayers),
    [recentRounds, enhancedData?.roster, topPlayers],
  );
  const fieldRows = useMemo(() => sortByStanding(rollups), [rollups]);
  const attentionRows = useMemo(() => attentionOrder(rollups), [rollups]);
  const today = enhancedData?.today || localToday();
  const domain = useMemo(
    () => fieldDomain(rollups, enhancedData?.windowStart, today),
    [rollups, enhancedData?.windowStart, today],
  );
  const cap = useMemo(() => scoreFieldCap(fieldRows), [fieldRows]);
  const roundsLogged = recentRounds.length;

  const scheduleEvents: DayScheduleEvent[] = useMemo(() => {
    const toScheduleEvent = (e: { id: string; title: string; event_type: string; start_time: string; end_time?: string | null; location: string | null }): DayScheduleEvent => ({
      id: e.id,
      title: e.title,
      event_type: e.event_type,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
    });
    const merged = new Map<string, DayScheduleEvent>();
    for (const e of enhancedData?.todayEvents ?? []) merged.set(e.id, toScheduleEvent(e));
    for (const e of enhancedData?.calendarEvents ?? []) {
      if (!merged.has(e.id)) merged.set(e.id, toScheduleEvent(e));
    }
    return Array.from(merged.values());
  }, [enhancedData?.todayEvents, enhancedData?.calendarEvents]);

  const readouts: ReadoutItem[] = useMemo(() => {
    const sp = enhancedData?.sparklines;
    // The series under each readout is `teamSeries`, NOT `sparklines[].sparkline`.
    // The sparkline is the last five individual rounds by whoever logged them,
    // so a first-to-last delta across it is the gap between two unrelated rounds
    // by two different players — that is how this readout once claimed the team
    // gained 44.5 points of GIR. `teamSeries` cuts the window into consecutive
    // buckets and aggregates each the way the headline above it is aggregated,
    // so the arrow means what a coach reads it to mean.
    const ts = enhancedData?.teamSeries;
    const scoringSeries = ts?.scoringAvg ?? [];
    const girSeries = ts?.girPct ?? [];
    const puttsSeries = ts?.puttsPerRound ?? [];
    const roundsInWindow = ts?.roundsInWindow ?? 0;
    const spanLabel = roundsInWindow > 0 ? `${roundsInWindow} round${roundsInWindow === 1 ? '' : 's'}` : undefined;
    const scoringAvg = sp?.scoringAvg.value ?? stats.teamScoringAverage;
    const thisWeek = enhancedData?.teamPulse.roundsThisWeek;
    return [
      {
        key: 'scoring',
        label: 'Scoring avg',
        value: scoringAvg != null ? scoringAvg.toFixed(1) : null,
        series: scoringSeries,
        goodDirection: 'down',
        spanLabel,
        delta: computeSeriesTrend(scoringSeries, { goodDirection: 'down' }),
      },
      {
        key: 'gir',
        label: 'Greens in regulation',
        value: sp?.girPct.value != null ? sp.girPct.value.toFixed(1) : null,
        unit: '%',
        series: girSeries,
        goodDirection: 'up',
        spanLabel,
        delta: computeSeriesTrend(girSeries, { goodDirection: 'up' }),
      },
      {
        key: 'putts',
        label: 'Putts per round',
        value: sp?.puttsPerRound.value != null ? sp.puttsPerRound.value.toFixed(1) : null,
        series: puttsSeries,
        goodDirection: 'down',
        spanLabel,
        delta: computeSeriesTrend(puttsSeries, { goodDirection: 'down' }),
      },
      {
        key: 'rounds',
        label: 'Rounds',
        value: String(roundsLogged),
        note: thisWeek == null ? RANGE_SENTENCE[range] : `${thisWeek} this week`,
      },
    ];
  }, [enhancedData?.sparklines, enhancedData?.teamSeries, enhancedData?.teamPulse.roundsThisWeek, stats.teamScoringAverage, roundsLogged, range]);

  const verdictParts = useMemo(() => {
    const leader = fieldRows.find((r) => r.avg != null);
    const worst = attentionRows.find((r) => r.trend?.direction === 'declining');
    return buildVerdict({
      todayEventCount: enhancedData?.todayEvents.length ?? 0,
      pulse: enhancedData?.teamPulse,
      leader: leader && leader.avg != null ? { id: leader.id, name: leader.name, avg: leader.avg } : null,
      worstSlide: worst?.trend ? { id: worst.id, name: worst.name, delta: worst.trend.delta } : null,
      signals: badges.coachhelm,
      roundsInWindow: roundsLogged,
      rangeIsAll: range === 'all',
    });
  }, [fieldRows, attentionRows, enhancedData?.todayEvents.length, enhancedData?.teamPulse, badges.coachhelm, roundsLogged, range]);

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
            <OnboardingStep index={2} status="upcoming" title="Invite your roster" description="Share a join code so players can log rounds." />
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

  const canInvite = !!team.join_code && team.join_code !== 'DEMO01';
  const showInviteNotice = canInvite && stats.rosterSize != null && stats.rosterSize < 3;
  const rosterFull = canInvite && stats.rosterSize != null && stats.rosterSize >= 20;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? '';
  const facts = [
    stats.rosterSize != null ? `${stats.rosterSize} ${stats.rosterSize === 1 ? 'player' : 'players'}` : null,
    stats.upcomingEvents != null ? `${stats.upcomingEvents} upcoming ${stats.upcomingEvents === 1 ? 'event' : 'events'}` : null,
    stats.activeQualifiers != null ? `${stats.activeQualifiers} active ${stats.activeQualifiers === 1 ? 'qualifier' : 'qualifiers'}` : null,
  ].filter((f): f is string => f != null);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col overflow-x-clip px-5 pt-6 pb-10 md:px-8 md:pt-8 md:pb-28">
      <FairwayJoinRequestAlert requests={joinRequests} />

      {/* ── 1 · Masthead ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className={OVERLINE}>
            {todayLabel ? <>{todayLabel} <span aria-hidden="true">·</span> </> : null}
            {team.name}
          </p>
          <div className="flex items-center gap-2">
            <Menu
              ariaLabel="Dashboard actions"
              align="end"
              trigger={
                <IconButton variant="secondary" size="md" aria-label="More actions">
                  <IconMoreHorizontal size={18} />
                </IconButton>
              }
            >
              <Menu.Item icon={<IconPlus size={16} />} onSelect={() => router.push('/golf/dashboard/roster')}>
                Add player
              </Menu.Item>
              <Menu.Item icon={<IconFlag size={16} />} onSelect={() => router.push('/golf/dashboard/qualifiers')}>
                Qualifiers
              </Menu.Item>
              {canInvite ? (
                <>
                  <Menu.Separator />
                  <Menu.Item
                    icon={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleCopy();
                    }}
                  >
                    {copied ? 'Copied' : 'Invite players'}
                  </Menu.Item>
                </>
              ) : null}
            </Menu>
            <Button variant="primary" asChild>
              <Link href="/golf/dashboard/calendar">
                <IconPlus size={16} />
                <span>New event</span>
              </Link>
            </Button>
          </div>
        </div>
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{greeting}</h1>
        <VerdictLine parts={verdictParts} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
          {facts.map((fact, i) => (
            <span key={fact}>
              {i > 0 ? <span aria-hidden="true" className="mr-3">·</span> : null}
              {fact}
            </span>
          ))}
        </p>
      </header>

      {showInviteNotice || rosterFull ? (
        <div className="mt-6 flex flex-col gap-3">
          {showInviteNotice ? (
            <InlineNotice
              tone="info"
              icon={LucideUsers}
              title="Share your invite code"
              action={
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  <span className="font-fw-mono tracking-[0.18em]">{copied ? 'Copied' : team.join_code}</span>
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
        </div>
      ) : null}

      {/* ── 2 · The stage ─────────────────────────────────────────────────── */}
      <Surface as="section" aria-label="Score field" elevation="border" padding="none" className="mt-10 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4 md:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={OVERLINE}>The team <span aria-hidden="true">·</span> {RANGE_SENTENCE[range]}</p>
            <h2 className="font-fw-display text-h2 text-text-primary">Score field</h2>
            <p className="max-w-[60ch] font-fw-sans text-caption text-text-tertiary">
              Every round in the window by player. Bars rise over par in amber and drop under par in green; par is the line, scale ±{cap}.
            </p>
          </div>
          <div className="hidden md:flex">
            <Segmented value={range} onValueChange={handleRangeChange} options={RANGE_OPTIONS} aria-label="Performance window" size="sm" />
          </div>
          <div className="flex md:hidden">
            <Menu
              ariaLabel="Performance window"
              align="end"
              trigger={
                <Button variant="secondary" size="sm">
                  <span>Window · {rangeLabel}</span>
                </Button>
              }
            >
              {RANGE_OPTIONS.map((option) => (
                <Menu.Item key={option.value} onSelect={() => handleRangeChange(option.value)}>
                  {option.label}
                </Menu.Item>
              ))}
            </Menu>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="order-2 min-w-0 px-5 py-4 md:px-6 md:py-5 xl:order-1">
            {teamStatsUnavailable ? (
              <InlineNotice tone="warning" title="Couldn’t load the team’s rounds">
                Something went wrong reading this team’s rounds. Refresh to try again; nothing has been lost.
              </InlineNotice>
            ) : fieldRows.length === 0 ? (
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title="No players yet"
                description="Invite your roster and the field fills in as rounds are logged."
              />
            ) : roundsLogged === 0 ? (
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title={range !== 'all' ? 'No rounds in this window' : 'No rounds logged yet'}
                description={range !== 'all' ? 'Try a wider window.' : 'Players submit rounds from their dashboard and they land here.'}
                action={
                  range !== 'all' ? (
                    <Button variant="secondary" size="sm" onClick={() => handleRangeChange('all')}>
                      Show all time
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ScoreField rows={fieldRows} domain={domain} cap={cap} />
            )}
          </div>
          <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
            <FieldReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · The ledger row ────────────────────────────────────────────── */}
      {/* Ledger spans: even thirds at xl, unequal 5/3/4 from 2xl. At 1280 the
          3-span Attention column clipped every player name to "Jackson ..." and
          the Latest titles to "Message from Cole Be...". The unequal split is
          the intended reading rhythm, but it only has the room for it once the
          row is wide enough; below that, equal columns beat clipped names. */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        <div className="xl:col-span-4 xl:pr-8 2xl:col-span-5">
          <TodayPanel
            todayEvents={enhancedData?.todayEvents ?? []}
            scheduleEvents={scheduleEvents}
            scheduleError={enhancedData?.todayScheduleError ?? false}
            timezone={enhancedData?.timezone}
          />
        </div>
        <div className="xl:col-span-4 xl:px-8 2xl:col-span-3">
          <AttentionLedger pulse={enhancedData?.teamPulse} rows={attentionRows} unavailable={teamStatsUnavailable} />
        </div>
        <div className="md:col-span-2 xl:col-span-4 xl:pl-8">
          <NotificationsLatestModule frame="bare" />
        </div>
      </div>

      {/* ── 4 · Recent rounds ─────────────────────────────────────────────── */}
      <section aria-label="Recent rounds" className="mt-12 flex flex-col gap-3">
        <SectionHead title="Recent rounds" count={roundsLogged} action={{ label: 'All rounds', href: '/golf/dashboard/rounds' }} />
        {recentRounds.length === 0 ? (
          <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
            {teamStatsUnavailable
              ? 'Rounds could not be loaded. Refresh to try again.'
              : range !== 'all'
                ? 'No rounds in this window.'
                : 'No rounds logged yet.'}
          </p>
        ) : (
          <RoundsLedgerTable rounds={recentRounds.slice(0, 10)} />
        )}
      </section>
    </div>
  );
}

import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchGolfTab } from '@/lib/admin/data/golf';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
import type { RollupAFeatureAdoptionPayload, FeatureCountPair } from '@/app/golf/actions/admin/rollup-a';
import { Surface, StatStrip, StatTile, TrendChart, type StatTileProps } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData } from '../_components/PanelStates';
import { KpiTile } from '../_components/KpiTile';
import { TeamHealthTable } from '../_components/TeamHealthTable';
import { AutoRefresh } from '../_components/AutoRefresh';
import { FeatureHealthRollup } from '../_components/FeatureHealthRollup';

export const dynamic = 'force-dynamic';

// StatTile's `format` takes number-flow's `Format` (Intl.NumberFormatOptions
// minus scientific/engineering notation) — narrow at the boundary like KpiTile does.
const USD_FORMAT = { style: 'currency', currency: 'USD' } as StatTileProps['format'];
const PERCENT_FORMAT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 };

/** "N of D (P%)" for an onboarding-style ratio row — no fabricated 0% when
 *  the denominator is zero, an honest `null` instead (caller renders a
 *  plain "no ... yet" string in that case). */
function ratioLabel(numerator: number, denominator: number): string | null {
  if (denominator <= 0) return null;
  const pct = Math.round((numerator / denominator) * 100);
  return `${numerator} of ${denominator} (${pct}%)`;
}

/** Ordered, human-labeled view over `RollupAFeatureAdoptionPayload` — every
 *  key in the payload has a row here, so a TS error (not a silent drop) is
 *  the failure mode if a future feature is added upstream and forgotten here. */
const FEATURE_ADOPTION_ROWS: ReadonlyArray<{
  key: keyof Omit<RollupAFeatureAdoptionPayload, 'generatedAt'>;
  label: string;
}> = [
  { key: 'qualifiers', label: 'Qualifiers' },
  { key: 'events', label: 'Calendar events' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'messages', label: 'Messages' },
  { key: 'documents', label: 'Documents' },
  { key: 'travel', label: 'Travel itineraries' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

// Dateline rule — replaces the retired border-l-2 "key panel" left-edge
// stripe. Chrome, not a status signal: a helm-green h-[2px] w-7 rounded-full
// rule above the card title.
function KeyPanelRule() {
  return <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />;
}

async function GolfBody() {
  const [tab, featureHealth] = await Promise.all([fetchGolfTab(), fetchFeatureHealth()]);
  const r = tab.rollup.rounds;
  const ch = tab.rollup.coachhelm;
  const u = tab.rollup.users;
  const adoption = tab.rollup.featureAdoption;

  const roundsTrend = r.roundsByWeek.map((w) => ({ x: w.week, y: w.count }));

  // Feature health cross-link (golf half) — same summarizeFeatureHealth()
  // pattern as admin/baseball/page.tsx, filtered to app='golfhelm'.
  const golfFeatureHealth = summarizeFeatureHealth(
    {
      features: featureHealth.features.filter((f) => f.app === 'golfhelm'),
      generatedAt: featureHealth.generatedAt,
      degraded: featureHealth.degraded,
    },
    new Date(),
  );

  // New-user signup cohorts, oldest → newest (cohortWeeks.w4 = 28→21d ago,
  // ...w1 = most recent 7 days) — read left-to-right as a timeline.
  const cohortRows: { label: string; count: number }[] = [
    { label: '28–21d ago', count: u.cohortWeeks.w4.length },
    { label: '21–14d ago', count: u.cohortWeeks.w3.length },
    { label: '14–7d ago', count: u.cohortWeeks.w2.length },
    { label: 'Last 7d', count: u.cohortWeeks.w1.length },
  ];

  return (
    <div className="space-y-6">
      {/* Activity pulse */}
      <section className="space-y-4">
        <SectionLabel>Activity pulse</SectionLabel>
        <StatStrip count={7} columns={4} mdColumns={4} ariaLabel="Activity pulse KPIs">
          <KpiTile
            label="Rounds this week"
            value={r.roundsThisWeek}
            delta={r.roundsThisWeek - r.roundsLastWeek}
            href="/admin/golf"
            trendData={r.roundsByWeek.slice(-8).map((w) => w.count)}
          />
          <KpiTile label="Rounds today" value={r.roundsToday} href="/admin/golf" />
          <KpiTile
            label="Insights this week"
            value={ch.insightsThisWeek}
            href="/admin/golf"
            trendData={ch.insightsByWeek.slice(-8).map((w) => w.count)}
          />
          <KpiTile
            label="Insight failures 7d"
            value={ch.insightsFailed7d}
            href="/admin/errors?sport=golf"
            tone={ch.insightsFailed7d > 0 ? 'warning' : 'neutral'}
            goodDirection="down"
          />
          {/* DAU/WAU/MAU — computed by get_admin_rounds_rollup alongside
              roundsThisWeek/roundsToday above but never rendered until now
              (bridge-golf-rollup-wiring Finding 2). */}
          <KpiTile label="Active users 24h (DAU)" value={r.activeUsers24h} href="/admin/users?sport=golf" />
          <KpiTile label="Active users 7d (WAU)" value={r.activeUsers7d} href="/admin/users?sport=golf" />
          <KpiTile label="Active users 30d (MAU)" value={r.activeUsers30d} href="/admin/users?sport=golf" />
        </StatStrip>
        {/* No valueFormatter on TrendChart: functions can't cross the RSC boundary
            from this server component, and the data is already integer counts. */}
        {roundsTrend.length > 0 ? (
          <TrendChart title="Rounds per week (12w)" data={roundsTrend} height={180} />
        ) : (
          <PanelNoData
            label="No round history yet"
            description="The 12-week rounds trend appears once teams start logging rounds."
          />
        )}
      </section>

      {/* Activation & adoption — onboarding funnel, weekly signup cohorts,
          and per-feature usage were all computed by fetchAdminRollupA()
          (RollupAUsersPayload / RollupAFeatureAdoptionPayload) and silently
          discarded before this fix (bridge-golf-rollup-wiring Finding 1). */}
      <Surface padding="sm">
        <SectionLabel>Activation & adoption</SectionLabel>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
              Onboarding
            </h3>
            <ul className="divide-y divide-warm-200/60 text-sm">
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-warm-700">Coaches onboarded</span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {ratioLabel(u.coachesOnboarded, u.totalCoaches) ?? 'no coaches yet'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-warm-700">Players onboarded</span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {ratioLabel(u.playersOnboarded, u.totalPlayers) ?? 'no players yet'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-warm-700">Players pending onboarding</span>
                <span className="font-fw-mono text-xs font-semibold tabular-nums text-warm-900">
                  {u.playersPending}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-warm-700">Active teams</span>
                <span className="font-fw-mono text-xs font-semibold tabular-nums text-warm-900">
                  {u.activeTeamCount}
                </span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
              New user cohorts (last 4 weeks)
            </h3>
            <ul className="divide-y divide-warm-200/60 text-sm">
              {cohortRows.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-warm-700">{row.label}</span>
                  <span className="font-fw-mono text-xs font-semibold tabular-nums text-warm-900">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
            Feature adoption (all-time / 30d)
          </h3>
          <ul className="grid gap-x-6 gap-y-1 divide-y divide-warm-200/60 text-sm sm:grid-cols-2 sm:divide-y-0">
            {FEATURE_ADOPTION_ROWS.map(({ key, label }) => {
              const pair: FeatureCountPair = adoption[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-2 sm:border-b sm:border-warm-200/60">
                  <span className="text-warm-700">{label}</span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                    <span className="font-semibold text-warm-900">{pair.total}</span> total ·{' '}
                    {pair.last30d} in 30d
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Surface>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Lift Lab — cross-sport strength program, golf half (baseball's
            counterpart lives in admin/baseball/page.tsx). */}
        <Surface padding="sm">
          <SectionLabel>Lift Lab</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatTile label="Sessions 30d" value={tab.liftLab.sessions30d} tone="neutral" mono />
            <StatTile label="Active athletes 30d" value={tab.liftLab.activeAthletes30d} tone="neutral" mono />
          </div>
        </Surface>

        {/* Feature health cross-link — GolfHelm slice of the platform-wide
            board, filtered by app='golfhelm' (feature-registry.ts). */}
        <Surface padding="sm">
          <SectionLabel>Feature health</SectionLabel>
          <div className="mt-3">
            <FeatureHealthRollup summary={golfFeatureHealth} />
          </div>
          <p className="mt-3 text-xs text-warm-500">
            GolfHelm features only — full cross-sport board lives at{' '}
            <Link href="/admin/health" className="text-accent-700 underline">
              /admin/health →
            </Link>
          </p>
        </Surface>
      </div>

      {/* Teams health */}
      <Surface padding="sm">
        <SectionLabel>Teams health</SectionLabel>
        <div className="mt-3">
          {tab.teams.length === 0 ? (
            <PanelNoData label="No golf teams yet" description="Teams appear here once a coach creates one." />
          ) : (
            <TeamHealthTable teams={tab.teams} />
          )}
        </div>
        <p className="mt-2 text-xs text-warm-500">
          Errors 7d comes from <span className="font-fw-mono">admin_events.team_id</span> — 0s are expected
          until every emitter tags a team, not a broken feed.
        </p>
      </Surface>

      {/* CoachHelm engine health — key panel: the AI engine that makes
          CoachHelm worth paying for, so it earns the same 2px green left
          edge as the overview's Feature health rollup. */}
      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>CoachHelm engine health</SectionLabel>
        <p className="mt-2 text-sm text-warm-700">
          Last insight generated:{' '}
          <span className="font-fw-mono text-warm-900">
            {ch.lastInsightAt ? new Date(ch.lastInsightAt).toLocaleString() : 'never'}
          </span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Predictions 30d" value={ch.predictions30d} tone="neutral" mono />
          <StatTile label="Patterns 30d" value={ch.patterns30d} tone="neutral" mono />
          <StatTile label="Reviews this week" value={ch.reviewsThisWeek} tone="neutral" mono />
          <StatTile label="Coach philosophies set" value={ch.coachPhilosophyCount} tone="neutral" mono />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
              Insight effectiveness
            </h3>
            {ch.insightEffectiveness.length === 0 ? (
              <PanelNoData
                label="Not enough outcomes yet"
                description="Effectiveness needs acted-on insights with a tracked outcome — sparse here is expected while CoachHelm is new, not broken."
              />
            ) : (
              <ul className="divide-y divide-warm-200/60 text-sm">
                {ch.insightEffectiveness.map((row) => (
                  <li key={row.insight_type} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-warm-800">{row.insight_type}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                      {row.effectiveness_score != null
                        ? new Intl.NumberFormat(undefined, PERCENT_FORMAT).format(row.effectiveness_score)
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
              Model performance
            </h3>
            {ch.modelPerformance.length === 0 ? (
              <PanelNoData
                label="No model performance rows yet"
                description="Accuracy/calibration populate once a prediction model has resolved outcomes to score against."
              />
            ) : (
              <ul className="divide-y divide-warm-200/60 text-sm">
                {ch.modelPerformance.map((row) => (
                  <li key={row.model_type} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-warm-800">{row.model_type}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                      {row.accuracy_rate != null
                        ? new Intl.NumberFormat(undefined, PERCENT_FORMAT).format(row.accuracy_rate)
                        : '—'}{' '}
                      · {row.predictions_made ?? 0} predictions
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Surface>

      <div className="grid gap-4 md:grid-cols-2">
        {/* AI / LLM spend */}
        <Surface padding="sm">
          <SectionLabel>AI / LLM spend (30d)</SectionLabel>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Spend 30d" value={tab.llm.cost30d} format={USD_FORMAT} tone="neutral" mono />
            <StatTile label="Calls 30d" value={tab.llm.calls30d} tone="neutral" mono />
            <StatTile
              label="Budget remaining today"
              value={tab.llm.budgetRemaining ?? undefined}
              starved={tab.llm.budgetRemaining === null}
              starvedTitle="No budget rows today"
              starvedDescription="No coach has an LLM budget row for today yet — this table tracks per-coach, per-day spend caps."
              format={USD_FORMAT}
              tone="neutral"
              mono
            />
          </div>
        </Surface>

        {/* Demo & leads — id="demo" is a real anchor: the V2 activity feed
            (src/lib/admin/data/activity.ts) links demo_session items here
            via `/admin/golf#demo`. */}
        <Surface padding="sm" id="demo">
          <SectionLabel>Demo & leads</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatTile label="Demo sessions 30d" value={tab.demos.demoSessions30d} tone="neutral" mono />
            <StatTile label="Inbound requests" value={tab.demos.demoRequests} tone="neutral" mono />
          </div>
          <p className="mt-3 text-xs text-warm-500">
            Outreach and pipeline management live in the CRM —{' '}
            <a href="/golf/admin/crm" className="text-accent-700 underline">
              open CRM →
            </a>
          </p>
        </Surface>
      </div>

      {/* Tracer link-out */}
      <Surface as={Link} href="/admin/golf/tracer" interactive padding="sm" className="block">
        <p className="text-sm font-medium text-accent-700">Tracer data-quality suite →</p>
        <p className="text-xs text-warm-500">
          Read-only diagnostics today (player round data quality + recent incidents). Write fixes
          (recalculate totals/GIR/strokes gained, resolve stuck rounds) land in W14.
        </p>
      </Surface>
    </div>
  );
}

export default async function GolfAdminPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Golf">
        <GolfBody />
      </PanelBoundary>
    </div>
  );
}

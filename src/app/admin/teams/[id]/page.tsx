import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchTeamDetail } from '@/lib/admin/data/team-detail';
import { fetchTeamPageExtras } from '@/lib/admin/data/team-page-extras';
import { computeTeamGrade, computeTeamComputedInsights, type TeamGrade } from '@/lib/admin/data/team-grade';
import { classifyTeamHealth, type TeamHealth } from '@/lib/admin/data/golf';
import { Surface, StatusPill, Badge, TrendChart, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';
import { RosterTable, type RosterDisplayRow } from './RosterTable';

export const dynamic = 'force-dynamic';

const HEALTH_TONE: Record<TeamHealth, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  cooling: 'warning',
  dormant: 'danger',
};

const GRADE_TONE: Record<TeamGrade, string> = {
  A: 'border-accent-500 bg-accent-50 text-accent-700',
  B: 'border-accent-300 bg-accent-50 text-accent-700',
  C: 'border-fw-warning bg-fw-warning-bg text-warm-800',
  D: 'border-fw-danger bg-fw-danger-bg text-fw-danger',
};

const ERROR_SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">{children}</h2>;
}

/**
 * GREEN CONTRACT: heavy graphite (warm-900, bold, tabular) numerals — never
 * the green Numeric face other admin panels default to — with the green
 * accent spent on the section rule + a "key panel" left edge instead.
 */
function GraphiteStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-fw-md bg-surface-sunken p-4">
      <span
        className={cn(
          'font-fw-mono text-2xl font-bold tabular-nums',
          tone === 'danger' ? 'text-fw-danger' : 'text-warm-900',
        )}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-widest text-warm-500">{label}</span>
    </div>
  );
}

// "Key panel" chrome: a 2px helm-green left edge on the structural cards of
// this page (header, activity, coachhelm) — a chrome constant, not a status
// signal, so it applies regardless of whether the panel's content is good or
// bad news.
const KEY_PANEL = 'border-l-2 border-l-accent-500';

async function TeamDetailBody({ teamId }: { teamId: string }) {
  const detail = await fetchTeamDetail(teamId);

  if (!detail.team) {
    return (
      <PanelNoData
        label="Team not found"
        description="This team doesn't exist, or belongs to a sport this page doesn't cover yet."
      />
    );
  }

  const { team, coaches, roster, activityDaily, errors, coachhelm, teamLastActivity } = detail;
  const coachIds = coaches.map((c) => c.id);
  const extras = await fetchTeamPageExtras({ teamId, organizationId: team.organizationId, coachIds });

  const now = new Date();
  const health = classifyTeamHealth(teamLastActivity, now);
  const rounds30d = activityDaily.reduce((sum, d) => sum + d.rounds, 0);
  const logins30d = activityDaily.reduce((sum, d) => sum + d.logins, 0);
  const activeCount = roster.filter((r) => r.activityStatus === 'active').length;
  const dormantRosterRatio = roster.length > 0 ? roster.filter((r) => r.activityStatus === 'dormant').length / roster.length : 0;
  const grade = computeTeamGrade({ health, errors7d: extras.errors7d, dormantRosterRatio });
  const computedInsights = computeTeamComputedInsights(roster, rounds30d, extras.errors7d);
  const roundsTrend = activityDaily.map((d) => ({ x: d.date.slice(5), y: d.rounds }));

  const rosterDisplay: RosterDisplayRow[] = roster.map((r) => {
    const scoreEntry = extras.roundScoresByPlayer.get(r.playerId);
    return {
      playerId: r.playerId,
      name: r.fullName ?? r.email ?? 'Unnamed player',
      jerseyNumber: r.jerseyNumber,
      lastRoundScore: scoreEntry?.score ?? null,
      lastRoundToPar: scoreEntry?.toPar ?? null,
      rounds30d: r.rounds30d,
      activityStatus: r.activityStatus,
      href: r.href,
    };
  });

  return (
    <div className="space-y-6">
      <Surface padding="sm" className={KEY_PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-warm-900">{team.name}</h1>
              <StatusPill tone={HEALTH_TONE[health]} dot size="sm">
                {health}
              </StatusPill>
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 font-fw-mono text-xs font-bold',
                  GRADE_TONE[grade],
                )}
                title={`Team grade: ${grade}`}
              >
                {grade}
              </span>
            </div>
            <p className="mt-1 text-sm text-warm-600">
              {extras.organizationName ?? 'No organization'} · {team.gender} ·{' '}
              {team.season ?? 'no season set'} {team.seasonActive ? '(active)' : '(off-season)'}
            </p>
            {coaches.length > 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-warm-500">Coaches:</span>
                {coaches.map((c) => (
                  <Link key={c.id} href={c.href} className="text-accent-700 underline-offset-2 hover:underline">
                    {c.fullName ?? c.email ?? 'Unnamed coach'}
                    {c.isPrimary ? ' (primary)' : ''}
                  </Link>
                ))}
              </p>
            ) : (
              <p className="mt-2 text-sm text-warm-500">No coaches assigned</p>
            )}
          </div>
        </div>

        {computedInsights.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {computedInsights.map((insight) => (
              <Badge key={insight} tone="accent" variant="outline">
                {insight}
              </Badge>
            ))}
          </div>
        ) : null}
      </Surface>

      <section className="space-y-4">
        <SectionLabel>30-day activity</SectionLabel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <GraphiteStat label="Rounds 30d" value={rounds30d} />
          <GraphiteStat label="Active / roster" value={`${activeCount}/${roster.length}`} />
          <GraphiteStat label="Logins 30d" value={logins30d} />
          <GraphiteStat
            label="Last activity"
            value={teamLastActivity ? <LocalTime iso={teamLastActivity} variant="datetime" /> : 'never'}
          />
        </div>
        {roundsTrend.length > 0 ? (
          <TrendChart title="Rounds per day (30d)" data={roundsTrend} height={180} />
        ) : (
          <PanelNoData label="No round history yet" description="The 30-day trend appears once players log rounds." />
        )}
      </section>

      <Surface padding="sm">
        <SectionLabel>Roster ({roster.length})</SectionLabel>
        <div className="mt-3">
          {roster.length === 0 ? (
            <PanelNoData label="No active roster" description="Players appear here once they join this team." />
          ) : (
            <RosterTable roster={rosterDisplay} />
          )}
        </div>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Team errors</SectionLabel>
        <div className="mt-3">
          {errors.length === 0 ? (
            <PanelAllClear label="No recent errors for this team" checkedAt={new Date().toISOString()} />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {errors.map((e) => (
                <li key={e.fingerprint} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <StatusPill tone={ERROR_SEVERITY_TONE[e.severity] ?? 'neutral'} dot size="sm">
                    {e.severity}
                  </StatusPill>
                  <Link
                    href={e.href}
                    className="min-w-0 flex-1 basis-full truncate text-warm-900 hover:underline sm:basis-auto"
                  >
                    {e.title}
                  </Link>
                  <span className="font-fw-mono text-xs font-semibold tabular-nums text-fw-danger">
                    {e.occurrences}×
                  </span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    <LocalTime iso={e.lastSeen} variant="datetime" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>

      <Surface padding="sm" className={KEY_PANEL}>
        <SectionLabel>CoachHelm</SectionLabel>
        <div className="mt-3">
          {coaches.length === 0 || extras.coachhelmInsights === null ? (
            <PanelNoData
              label="CoachHelm not applicable"
              description="This team has no coaches assigned, so there's no insight/spend activity to show."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <GraphiteStat label="Insights 30d" value={extras.coachhelmInsights.insights30d} />
              <GraphiteStat
                label="Acknowledged"
                value={
                  extras.coachhelmInsights.acknowledgedPct !== null
                    ? `${Math.round(extras.coachhelmInsights.acknowledgedPct * 100)}%`
                    : '—'
                }
              />
              <GraphiteStat label="LLM calls 30d" value={coachhelm?.calls30d ?? 0} />
              <GraphiteStat
                label="LLM spend 30d"
                value={new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
                  coachhelm?.cost30d ?? 0,
                )}
              />
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  return (
    <div className="space-y-4">
      <Link href="/admin/golf" className="text-xs text-warm-500 underline">
        ← Golf
      </Link>
      <PanelBoundary title="Team detail">
        <TeamDetailBody teamId={id} />
      </PanelBoundary>
    </div>
  );
}

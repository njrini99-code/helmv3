import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchTeamDetail } from '@/lib/admin/data/team-detail';
import { coachDisplayName, buildCoachDisambiguator } from './coach-display';
import { fetchTeamPageExtras } from '@/lib/admin/data/team-page-extras';
import { computeTeamGrade, computeTeamComputedInsights, type TeamGrade } from '@/lib/admin/data/team-grade';
import { classifyTeamHealth, type TeamHealth } from '@/lib/admin/data/golf';
import {
  fetchTeamDetailExtras,
  sumRecentDays,
  summarizeErrorHealth,
  type InFlightTier,
  type QualifierBucket,
} from '@/lib/admin/data/team-detail-extras';
import { Surface, StatusPill, Badge, TrendChart, InlineNotice, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelAllClear, PanelNoData } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';
import { RosterTable, type RosterDisplayRow } from './RosterTable';

export const dynamic = 'force-dynamic';

const HEALTH_TONE: Record<TeamHealth, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  cooling: 'warning',
  dormant: 'danger',
};

// UNKNOWN is neutral, deliberately. It is not a bad grade — it means the
// inputs could not be established, and colouring it like a failing team would
// be its own false claim in the other direction.
const GRADE_TONE: Record<TeamGrade, string> = {
  UNKNOWN: 'border-warm-300 bg-warm-50 text-warm-600',
  A: 'border-accent-500 bg-accent-50 text-accent-700',
  B: 'border-accent-300 bg-accent-50 text-accent-700',
  C: 'border-fw-warning bg-fw-warning-bg text-warm-800',
  D: 'border-fw-danger bg-fw-danger-bg text-fw-danger-ink',
};

const ERROR_SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

const QUALIFIER_BUCKET_TONE: Record<QualifierBucket, FwStatusTone> = {
  open: 'accent',
  closed: 'neutral',
  unknown: 'warning',
};

// Attention-first: an abandoned autosave (quietly dead, nobody watching) is
// the one worth an operator's eyes before a merely-stuck one, which in turn
// outranks a round that is simply, healthily, still being played.
const IN_FLIGHT_TIER_TONE: Record<InFlightTier, FwStatusTone> = {
  abandoned: 'danger',
  stuck: 'warning',
  live: 'success',
};
const IN_FLIGHT_TIER_LABEL: Record<InFlightTier, string> = {
  abandoned: 'abandoned',
  stuck: 'stuck',
  live: 'live',
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
          tone === 'danger' ? 'text-fw-danger-ink' : 'text-warm-900',
        )}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-widest text-warm-500">{label}</span>
    </div>
  );
}

// "Key panel" chrome: a dateline rule (h-[2px] w-7 rounded-full, helm-green)
// above the title of the structural cards of this page (header, activity,
// coachhelm) — a chrome constant, not a status signal, so it applies
// regardless of whether the panel's content is good or bad news. Replaces
// the retired border-l-2 left-edge stripe.
function KeyPanelRule() {
  return <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />;
}

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

  const { team, coaches, roster, activityDaily, errors, coachhelm, teamLastActivity, degraded } = detail;
  const coachIds = coaches.map((c) => c.id);
  // Active-roster display info, reused by the extras module for in-flight
  // rounds so it never re-queries a player already fetched for the roster.
  const rosterIndex = new Map(roster.map((r) => [r.playerId, { name: r.fullName ?? r.email, href: r.href }]));
  const [extras, teamExtras] = await Promise.all([
    fetchTeamPageExtras({ teamId, organizationId: team.organizationId, coachIds }),
    fetchTeamDetailExtras({ teamId, rosterIndex }),
  ]);
  const { qualifiers, inFlight } = teamExtras;
  const allDegraded = [
    ...degraded,
    ...teamExtras.degraded,
    // An unreadable 7-day error count degrades this page the same way any other
    // unreadable panel does. Before 2026-08-30 it resolved to 0 and graded the
    // team 'A' — the banner below already promises panels show "unknown, not
    // zero", and this is the one that did not keep that promise.
    ...(extras.errors7d === null ? ['errors7d'] : []),
  ];

  const now = new Date();
  const health = classifyTeamHealth(teamLastActivity, now);
  const rounds30d = activityDaily.reduce((sum, d) => sum + d.rounds, 0);
  const rounds7d = sumRecentDays(activityDaily, 7);
  const logins30d = activityDaily.reduce((sum, d) => sum + d.logins, 0);
  const activeCount = roster.filter((r) => r.activityStatus === 'active').length;
  const dormantRosterRatio = roster.length > 0 ? roster.filter((r) => r.activityStatus === 'dormant').length / roster.length : 0;
  const grade = computeTeamGrade({ health, errors7d: extras.errors7d, dormantRosterRatio });
  const computedInsights = computeTeamComputedInsights(roster, rounds30d, extras.errors7d);
  const roundsTrend = activityDaily.map((d) => ({ x: d.date.slice(5), y: d.rounds }));
  const errorHealth = summarizeErrorHealth(errors);

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
      {/* Every section falls back to empty/null on a query failure so the page
          still renders — but empty and unavailable then look identical, and on
          an observability surface that reads as "this team is clean" at exactly
          the moment it is not (fetchTeamDetail's own `degraded` doc comment). */}
      {allDegraded.length > 0 ? (
        <InlineNotice tone="warning" title="Some sections could not be loaded">
          {allDegraded.join(', ')} failed to load this request — those panels are showing unknown, not zero. Reload
          to retry.
        </InlineNotice>
      ) : null}
      <Surface padding="sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <KeyPanelRule />
            <div className="flex flex-wrap items-center gap-2">
              {/* `min-w-0` on an h1 that's itself a flex item — without it
                  `truncate`'s text-overflow:ellipsis never engages, since a
                  flex item's default min-width:auto keeps it at its full
                  content size. Long team names would otherwise just push
                  the health pill/grade badge onto their own row instead of
                  truncating. */}
              <h1 className="min-w-0 truncate text-xl font-semibold text-warm-900">{team.name}</h1>
              <StatusPill tone={HEALTH_TONE[health]} dot size="sm">
                {health}
              </StatusPill>
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 font-fw-mono text-xs font-bold',
                  GRADE_TONE[grade],
                )}
                title={
                  grade === 'UNKNOWN'
                    ? 'Team grade unavailable — the 7-day error count could not be read, and an unread count is not zero.'
                    : `Team grade: ${grade}`
                }
              >
                {grade === 'UNKNOWN' ? '—' : grade}
              </span>
              <Link
                href={`/admin/thread/team/${teamId}`}
                className="text-xs text-accent-700 underline-offset-2 hover:underline"
              >
                View journey →
              </Link>
            </div>
            <p className="mt-1 text-sm text-warm-600">
              {extras.organizationName ?? 'No organization'} · {team.gender} ·{' '}
              {team.season ?? 'no season set'} {team.seasonActive ? '(active)' : '(off-season)'}
            </p>
            {coaches.length > 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-warm-500">Coaches:</span>
                {coaches.map((c) => {
                  const disambiguator = buildCoachDisambiguator(c, coaches);
                  return (
                    <Link key={c.id} href={c.href} className="text-accent-700 underline-offset-2 hover:underline">
                      {coachDisplayName(c)}
                      {disambiguator ? ` (${disambiguator})` : ''}
                      {c.isPrimary ? ' (primary)' : ''}
                    </Link>
                  );
                })}
              </p>
            ) : (
              <p className="mt-2 text-sm text-warm-500">No coaches assigned</p>
            )}
            {/* Identity strip: id/created/join-code presence. Every one of
                these fields was already fetched by the pinned data-lane
                module (fetchTeamDetail) but none was ever rendered on this
                page — a superadmin diagnosing a signup problem had to go
                straight to the database to see the team's own id or whether
                a join code is even set. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-mono text-xs text-warm-500">
              <span title={team.id}>id {team.id.slice(0, 8)}…</span>
              <span aria-hidden>·</span>
              <span>
                created{' '}
                {team.createdAt ? <LocalTime iso={team.createdAt} variant="date" /> : 'unknown'}
              </span>
              <span aria-hidden>·</span>
              {team.joinCode ? (
                <span>
                  join code <span className="font-semibold text-warm-900">{team.joinCode}</span>
                </span>
              ) : (
                <StatusPill tone="danger" size="sm">
                  no join code set
                </StatusPill>
              )}
            </p>
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
        <SectionLabel>Activity</SectionLabel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <GraphiteStat label="Rounds 7d" value={rounds7d} />
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
        <SectionLabel>Autosaves in flight ({inFlight.total})</SectionLabel>
        <div className="mt-3">
          {allDegraded.includes('inFlightRounds') ? (
            <PanelNoData
              label="In-flight rounds unavailable"
              description="The in-progress round query failed this request — this is not an all-clear."
            />
          ) : inFlight.total === 0 ? (
            <PanelAllClear label="No rounds currently in progress" checkedAt={new Date().toISOString()} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <GraphiteStat label="Live" value={inFlight.live} />
                <GraphiteStat label="Stuck (1–24h idle)" value={inFlight.stuck} tone={inFlight.stuck > 0 ? 'danger' : 'default'} />
                <GraphiteStat
                  label="Abandoned (24h+ idle)"
                  value={inFlight.abandoned}
                  tone={inFlight.abandoned > 0 ? 'danger' : 'default'}
                />
              </div>
              <ul className="mt-3 divide-y divide-warm-200/60">
                {inFlight.items.map((r) => (
                  <li key={r.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <StatusPill tone={IN_FLIGHT_TIER_TONE[r.tier]} dot size="sm">
                      {IN_FLIGHT_TIER_LABEL[r.tier]}
                    </StatusPill>
                    {r.href ? (
                      <Link href={r.href} className="min-w-0 flex-1 basis-full truncate text-warm-900 hover:underline sm:basis-auto">
                        {r.playerName ?? 'Unnamed player'}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 basis-full truncate text-warm-500 sm:basis-auto">
                        {r.playerName ?? 'Unknown player'}
                      </span>
                    )}
                    <span className="text-xs text-warm-500">
                      {r.courseName ?? 'no course'} · hole {r.currentHole ?? '—'}
                    </span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {r.updatedAt ? <LocalTime iso={r.updatedAt} variant="datetime" /> : 'no autosave recorded'}
                    </span>
                  </li>
                ))}
              </ul>
              {inFlight.truncated ? (
                <p className="mt-2 text-xs text-warm-500">
                  Showing the {inFlight.items.length} oldest in-progress rounds — more may exist past this bound.
                </p>
              ) : null}
            </>
          )}
        </div>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Qualifiers ({qualifiers.total})</SectionLabel>
        <div className="mt-3">
          {allDegraded.includes('qualifiers') ? (
            <PanelNoData
              label="Qualifiers unavailable"
              description="The qualifiers query failed this request — this is not an all-clear."
            />
          ) : qualifiers.total === 0 ? (
            <PanelNoData label="No qualifiers yet" description="Qualifiers appear here once a coach creates one for this team." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <GraphiteStat label="Open" value={qualifiers.open} />
                <GraphiteStat label="Closed" value={qualifiers.closed} />
                <GraphiteStat
                  label="Entries with a round"
                  value={`${qualifiers.entriesWithRound}/${qualifiers.entriesTotal}`}
                />
                <GraphiteStat label="Unrecognized status" value={qualifiers.unknownStatus} tone={qualifiers.unknownStatus > 0 ? 'danger' : 'default'} />
              </div>
              <ul className="mt-3 divide-y divide-warm-200/60">
                {qualifiers.items.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <StatusPill tone={QUALIFIER_BUCKET_TONE[q.bucket]} dot size="sm">
                      {q.status ?? 'unknown'}
                    </StatusPill>
                    <span className="min-w-0 flex-1 basis-full truncate text-warm-900 sm:basis-auto">{q.name}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {q.entriesWithRound}/{q.entriesTotal} rounds linked · {q.numRounds}-round format
                    </span>
                  </li>
                ))}
              </ul>
              {qualifiers.truncated ? (
                <p className="mt-2 text-xs text-warm-500">
                  Showing the {qualifiers.items.length} most recent qualifiers — more may exist past this bound.
                </p>
              ) : null}
            </>
          )}
        </div>
      </Surface>

      <Surface padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Team errors</SectionLabel>
          {errorHealth.worstSeverity ? (
            <span className="flex items-center gap-2 text-xs text-warm-500">
              Worst:
              <StatusPill tone={ERROR_SEVERITY_TONE[errorHealth.worstSeverity] ?? 'neutral'} size="sm">
                {errorHealth.worstSeverity}
              </StatusPill>
              {errorHealth.topSignature ? (
                <>
                  · Top signature:{' '}
                  <Link href={errorHealth.topSignature.href} className="text-accent-700 hover:underline">
                    {errorHealth.topSignature.title} ({errorHealth.topSignature.occurrences}×)
                  </Link>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          {errors.length === 0 ? (
            // Never claim all-clear off a failed read — `degraded` carrying
            // 'errors' means we could not look, which is not the same as zero.
            degraded.includes('errors') ? (
              <PanelNoData
                label="Team errors unavailable"
                description="The error query failed this request — this is not an all-clear."
              />
            ) : (
              <PanelAllClear label="No recent errors for this team" checkedAt={new Date().toISOString()} />
            )
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
                  <span className="font-fw-mono text-xs font-semibold tabular-nums text-fw-danger-ink">
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

      <Surface padding="sm">
        <KeyPanelRule />
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
      <PanelBoundary title="Team detail" skeleton={<PanelPageSkeleton rows={8} />}>
        <TeamDetailBody teamId={id} />
      </PanelBoundary>
    </div>
  );
}

'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import {
  IconUsers,
  IconTarget,
  IconAlertCircle,
  IconTrendingUp,
  IconBrain,
} from '@/components/icons';

interface OverviewBriefingProps {
  data: AdminDashboardData;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-sm text-warm-600">{label}</span>
      <span className="text-sm font-semibold text-warm-900 tabular-nums">
        {value === 0 || value === '' ? '\u2014' : value}
      </span>
    </div>
  );
}

function SectionHeading({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-warm-400 mb-3">
      <span className="text-warm-300 flex-shrink-0">{icon}</span>
      {children}
    </h3>
  );
}

function getWeekRangeHeader(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Monday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yearSuffix =
    startOfWeek.getFullYear() !== endOfWeek.getFullYear()
      ? `, ${endOfWeek.getFullYear()}`
      : '';
  return `${fmt(startOfWeek)} \u2014 ${fmt(endOfWeek)}${yearSuffix}, ${endOfWeek.getFullYear()}`;
}

export function OverviewBriefing({ data }: OverviewBriefingProps) {
  const { users, health, growth, errorLogs, errorDetection, playerFunnel } = data;

  // Platform stats
  const totalUsers = Number(users.totalCoaches) + Number(users.totalPlayers) + Number(users.totalAdmins);
  const stuckOnboarding = data.userActivity.summary.stuckInOnboarding;
  const inactiveCoaches = data.userActivity.teams.reduce(
    (sum, team) =>
      sum +
      team.members.filter(
        (m) => m.role === 'coach' && m.daysSinceLastSeen != null && m.daysSinceLastSeen >= 14
      ).length,
    0
  ) +
    data.userActivity.unassigned.filter(
      (u) => u.role === 'coach' && u.daysSinceLastSeen != null && u.daysSinceLastSeen >= 14
    ).length;

  // Rounds
  const roundsThisWeek = Number(health.roundsThisWeek);

  // Stuck rounds: find in-progress rounds (no score yet) from recent rounds
  const stuckRounds = data.activity.recentRounds.filter((r) => {
    if (r.total_score != null) return false; // completed
    if (!r.created_at) return false;
    const idleMs = Date.now() - new Date(r.created_at).getTime();
    const idleHours = Math.floor(idleMs / 3600000);
    return idleHours >= 2; // idle 2+ hours counts as stuck
  });

  // Errors
  const unresolvedIncidents = Number(errorLogs.incidentCounts.open);
  const totalErrors7d = Number(errorLogs.totalErrors7d);
  const topRoute =
    errorDetection.errorsByRoute.length > 0
      ? errorDetection.errorsByRoute[0]
      : null;
  const hasErrors = unresolvedIncidents > 0 || totalErrors7d > 0;

  // Growth / Funnel
  const funnel = playerFunnel.funnel;
  const signupStage = funnel.find((s) => s.stage.toLowerCase().includes('sign'));
  const activeStage = funnel.find((s) => s.stage.toLowerCase().includes('active'));
  const signupToActive =
    signupStage && activeStage && signupStage.count > 0
      ? Math.round((activeStage.count / signupStage.count) * 100)
      : null;

  // Biggest dropoff
  let biggestDropoff: { from: string; to: string; pct: number } | null = null;
  for (let i = 1; i < funnel.length; i++) {
    const current = funnel[i];
    const previous = funnel[i - 1];
    if (!current || !previous) continue;
    const drop = current.dropoffPct;
    if (!biggestDropoff || drop > biggestDropoff.pct) {
      biggestDropoff = {
        from: formatStageLabel(previous.stage),
        to: formatStageLabel(current.stage),
        pct: Math.round(drop),
      };
    }
  }

  const roundGrowthRate = Number(growth.roundGrowthRate);

  // CoachHelm
  const insightsThisWeek = Number(health.insightsThisWeek);
  const reviewsThisWeek = Number(health.roundReviewsThisWeek);
  const coachesUsingInsights = Number(data.engagement.coachesUsingInsights);

  return (
    <div className="space-y-8">
      {/* This Week date range header */}
      <div className="text-xs font-medium text-warm-400 tracking-wide">
        {getWeekRangeHeader()}
      </div>

      {/* Platform */}
      <section>
        <SectionHeading icon={<IconUsers size={14} />}>Platform</SectionHeading>
        <div className="pl-1">
          <StatRow
            label="Total users"
            value={
              totalUsers > 0
                ? `${totalUsers} total \u2014 ${Number(users.totalCoaches)} coaches, ${Number(users.totalPlayers)} players, ${Number(users.totalAdmins)} admin`
                : '\u2014'
            }
          />
          <StatRow
            label="Weekly active"
            value={
              Number(data.userActivity.summary.activeThisWeek) > 0
                ? `${Number(data.userActivity.summary.activeThisWeek)} active this week`
                : '\u2014'
            }
          />
          {stuckOnboarding > 0 && (
            <StatRow
              label="Stuck onboarding"
              value={`${stuckOnboarding} stuck in onboarding > 7 days`}
            />
          )}
          {inactiveCoaches > 0 && (
            <StatRow
              label="Inactive coaches"
              value={`${inactiveCoaches} coach${inactiveCoaches !== 1 ? 'es' : ''} inactive > 14 days`}
            />
          )}
        </div>
      </section>

      {/* Rounds */}
      <section>
        <SectionHeading icon={<IconTarget size={14} />}>Rounds</SectionHeading>
        <div className="pl-1">
          <StatRow label="This week" value={roundsThisWeek || '\u2014'} />
          {stuckRounds.length > 0 &&
            stuckRounds.map((r) => {
              const idleMs = Date.now() - new Date(r.created_at!).getTime();
              const idleHours = Math.floor(idleMs / 3600000);
              const idleLabel =
                idleHours >= 24
                  ? `${Math.floor(idleHours / 24)}d idle`
                  : `${idleHours}h idle`;
              return (
                <StatRow
                  key={r.id}
                  label="Stuck"
                  value={`${r.player_name}${r.course_name ? ` at ${r.course_name}` : ''} \u2014 ${idleLabel}`}
                />
              );
            })}
        </div>
      </section>

      {/* Errors — only show if there are issues */}
      {hasErrors && (
        <section>
          <SectionHeading icon={<IconAlertCircle size={14} />}>Errors</SectionHeading>
          <div className="pl-1">
            {unresolvedIncidents > 0 && (
              <StatRow label="Unresolved" value={`${unresolvedIncidents} incident${unresolvedIncidents !== 1 ? 's' : ''}`} />
            )}
            {totalErrors7d > 0 && (
              <StatRow label="Errors (7d)" value={totalErrors7d} />
            )}
            {topRoute && (
              <StatRow
                label="Top affected route"
                value={`${topRoute.route} (${topRoute.count})`}
              />
            )}
          </div>
        </section>
      )}

      {/* Growth */}
      <section>
        <SectionHeading icon={<IconTrendingUp size={14} />}>Growth</SectionHeading>
        <div className="pl-1">
          {signupToActive != null ? (
            <StatRow label="Signup \u2192 Active" value={`${signupToActive}%`} />
          ) : (
            <StatRow label="Signup \u2192 Active" value={'\u2014'} />
          )}
          {biggestDropoff && (
            <StatRow
              label="Biggest dropoff"
              value={`${biggestDropoff.from} \u2192 ${biggestDropoff.to} (${biggestDropoff.pct}%)`}
            />
          )}
          <StatRow
            label="Round volume trend"
            value={
              roundGrowthRate === 0
                ? 'Flat WoW'
                : `${roundGrowthRate > 0 ? '+' : ''}${roundGrowthRate}% WoW`
            }
          />
        </div>
      </section>

      {/* CoachHelm */}
      <section>
        <SectionHeading icon={<IconBrain size={14} />}>CoachHelm</SectionHeading>
        <div className="pl-1">
          <StatRow label="Insights generated" value={insightsThisWeek || '\u2014'} />
          <StatRow label="Round reviews" value={reviewsThisWeek || '\u2014'} />
          <StatRow label="Coaches using insights" value={coachesUsingInsights || '\u2014'} />
        </div>
      </section>
    </div>
  );
}

function formatStageLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

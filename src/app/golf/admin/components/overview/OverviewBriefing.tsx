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

  // Errors — only show card if there are OPEN incidents
  const unresolvedIncidents = Number(errorLogs.incidentCounts.open);
  const totalErrors7d = Number(errorLogs.totalErrors7d);
  const topRoute =
    errorDetection.errorsByRoute.length > 0
      ? errorDetection.errorsByRoute[0]
      : null;
  const showErrorsCard = unresolvedIncidents > 0;

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
    <div className="space-y-4">
      {/* This Week date range header */}
      <div className="text-xs font-medium text-warm-400 tracking-wide">
        {getWeekRangeHeader()}
      </div>

      {/* 2-column grid for main cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform Card */}
        <div className="glass-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconUsers size={16} className="text-warm-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-warm-400">Platform</h3>
          </div>
          <div className="space-y-0">
            <StatRow
              label="Total users"
              value={
                totalUsers > 0
                  ? `${totalUsers} total — ${Number(users.totalCoaches)} coaches, ${Number(users.totalPlayers)} players`
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
                value={`${stuckOnboarding} stuck > 7 days`}
              />
            )}
            {inactiveCoaches > 0 && (
              <StatRow
                label="Inactive coaches"
                value={`${inactiveCoaches} coach${inactiveCoaches !== 1 ? 'es' : ''} inactive > 14d`}
              />
            )}
          </div>
        </div>

        {/* Rounds Card */}
        <div className="glass-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconTarget size={16} className="text-warm-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-warm-400">Rounds</h3>
          </div>
          <div className="space-y-0">
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
                    value={`${r.player_name}${r.course_name ? ` at ${r.course_name}` : ''} — ${idleLabel}`}
                  />
                );
              })}
          </div>
        </div>

        {/* Errors Card — only show if open incidents exist */}
        {showErrorsCard && (
          <div className="glass-premium rounded-2xl p-5 border border-red-200/30">
            <div className="flex items-center gap-2 mb-4">
              <IconAlertCircle size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-red-400">Errors</h3>
            </div>
            <div className="space-y-0">
              <StatRow label="Unresolved" value={`${unresolvedIncidents} incident${unresolvedIncidents !== 1 ? 's' : ''}`} />
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
          </div>
        )}

        {/* Growth Card */}
        <div className="glass-premium rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconTrendingUp size={16} className="text-warm-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-warm-400">Growth</h3>
          </div>
          <div className="space-y-0">
            {signupToActive != null ? (
              <StatRow label={`Signup \u2192 Active`} value={`${signupToActive}%`} />
            ) : (
              <StatRow label={`Signup \u2192 Active`} value={'\u2014'} />
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
        </div>
      </div>

      {/* CoachHelm — full width */}
      <div className="glass-premium rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <IconBrain size={16} className="text-warm-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-warm-400">CoachHelm</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
          <StatRow label="Insights generated" value={insightsThisWeek || '\u2014'} />
          <StatRow label="Round reviews" value={reviewsThisWeek || '\u2014'} />
          <StatRow label="Coaches using insights" value={coachesUsingInsights || '\u2014'} />
        </div>
      </div>
    </div>
  );
}

function formatStageLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

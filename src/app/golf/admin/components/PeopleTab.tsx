'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconUsers, IconWarning, IconUserX, IconCheckCircle2, IconMail, IconDownload, IconClock } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { TeamHealthCards } from './TeamHealthCards';
import { TeamUserDirectory } from './TeamUserDirectory';
import { UserDetailPanel } from './UserDetailPanel';
import { BulkEmailModal } from '@/app/golf/admin/crm/components/BulkEmailModal';
import { Button } from '@/components/ui/button';

/** Recipient shape consumed by BulkEmailModal.prefilledRecipients. */
type ReengagePrefill = { email: string; name?: string | null; coach_id?: string | null };

interface Props {
  data: AdminDashboardData;
}

type ViewMode = 'all' | 'coaches' | 'players' | 'teams' | 'at_risk';

function isAtRisk(member: { daysSinceLastSeen: number | null; activityStatus: string }): boolean {
  return (member.daysSinceLastSeen !== null && member.daysSinceLastSeen > 14) || member.activityStatus === 'never';
}

function countAtRiskUsers(teams: AdminDashboardData['userActivity']['teams'], unassigned: AdminDashboardData['userActivity']['unassigned']): number {
  let count = 0;
  for (const team of teams) {
    for (const m of team.members) {
      if (isAtRisk(m)) count++;
    }
  }
  for (const u of unassigned) {
    if (isAtRisk(u)) count++;
  }
  return count;
}

export function PeopleTab({ data }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedAtRiskIds, setSelectedAtRiskIds] = useState<Set<string>>(new Set());
  // Re-engagement launcher state. When non-null, BulkEmailModal opens with
  // these prefilled recipients (the inactive 14d+ users). The modal's
  // prefilledRecipients flow synthesizes Coach objects internally so we can
  // pass `coaches=[]` and let the prefills drive the entire send path.
  const [reengageRecipients, setReengageRecipients] = useState<ReengagePrefill[] | null>(null);

  const { userActivity, userDirectory } = data;
  const { summary } = userActivity;

  // Build the inactive-14d+ recipient list from the existing user directory.
  // Source of truth for the "INACTIVE 14d+" KPI is `summary.inactivePlus14d`,
  // which the Wave-1 audit confirmed maps to users with daysSinceLastSeen >= 14.
  // We mirror that filter here and require an email so the send path actually
  // has somewhere to send to.
  const inactive14dRecipients = useMemo<ReengagePrefill[]>(() => {
    const out: ReengagePrefill[] = [];
    const seenEmails = new Set<string>();
    const collect = (m: { email: string; name: string | null; daysSinceLastSeen: number | null }) => {
      if (!m.email) return;
      if (m.daysSinceLastSeen === null || m.daysSinceLastSeen < 14) return;
      const key = m.email.toLowerCase();
      if (seenEmails.has(key)) return;
      seenEmails.add(key);
      out.push({ email: m.email, name: m.name });
    };
    for (const team of userActivity.teams) {
      for (const m of team.members) collect(m);
    }
    for (const u of userActivity.unassigned) collect(u);
    return out;
  }, [userActivity.teams, userActivity.unassigned]);

  function handleLaunchReengagement() {
    if (inactive14dRecipients.length === 0) return;
    setReengageRecipients(inactive14dRecipients);
  }

  const atRiskCount = useMemo(() => countAtRiskUsers(userActivity.teams, userActivity.unassigned), [userActivity.teams, userActivity.unassigned]);

  // Filter teams based on viewMode
  const filteredTeams = useMemo(() => {
    if (viewMode === 'teams' || viewMode === 'all') return userActivity.teams;
    if (viewMode === 'coaches') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => m.role === 'coach'),
        memberCount: t.members.filter(m => m.role === 'coach').length,
      })).filter(t => t.members.length > 0);
    }
    if (viewMode === 'players') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => m.role === 'player'),
        memberCount: t.members.filter(m => m.role === 'player').length,
      })).filter(t => t.members.length > 0);
    }
    if (viewMode === 'at_risk') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => isAtRisk(m)),
        memberCount: t.members.filter(m => isAtRisk(m)).length,
      })).filter(t => t.members.length > 0);
    }
    return userActivity.teams;
  }, [userActivity.teams, viewMode]);

  const filteredUnassigned = useMemo(() => {
    if (viewMode === 'teams') return userActivity.unassigned;
    if (viewMode === 'coaches') return userActivity.unassigned.filter(u => u.role === 'coach');
    if (viewMode === 'players') return userActivity.unassigned.filter(u => u.role === 'player');
    if (viewMode === 'at_risk') return userActivity.unassigned.filter(u => isAtRisk(u));
    return userActivity.unassigned;
  }, [userActivity.unassigned, viewMode]);

  // Collect all at-risk user IDs for bulk selection
  const allAtRiskIds = useMemo(() => {
    const ids: string[] = [];
    for (const team of userActivity.teams) {
      for (const m of team.members) {
        if (isAtRisk(m)) ids.push(m.id);
      }
    }
    for (const u of userActivity.unassigned) {
      if (isAtRisk(u)) ids.push(u.id);
    }
    return ids;
  }, [userActivity.teams, userActivity.unassigned]);

  function handleSelectAll() {
    if (selectedAtRiskIds.size === allAtRiskIds.length) {
      setSelectedAtRiskIds(new Set());
    } else {
      setSelectedAtRiskIds(new Set(allAtRiskIds));
    }
  }

  function handleEmailReengagement() {
    // TODO: integrate with email service to send re-engagement emails
    const ids = Array.from(selectedAtRiskIds.size > 0 ? selectedAtRiskIds : allAtRiskIds);
    void ids; // placeholder until email integration
  }

  function handleExportCsv() {
    // Collect at-risk user data and generate a CSV download
    const rows: { name: string; email: string; role: string; team: string; lastSeen: string; daysSinceLastSeen: string }[] = [];
    for (const team of userActivity.teams) {
      for (const m of team.members) {
        if (isAtRisk(m)) {
          rows.push({
            name: m.name || m.email.split('@')[0] || 'Unknown',
            email: m.email,
            role: m.role,
            team: team.teamName,
            lastSeen: m.last_seen ?? 'Never',
            daysSinceLastSeen: m.daysSinceLastSeen !== null ? String(m.daysSinceLastSeen) : 'N/A',
          });
        }
      }
    }
    for (const u of userActivity.unassigned) {
      if (isAtRisk(u)) {
        rows.push({
          name: u.name || u.email.split('@')[0] || 'Unknown',
          email: u.email,
          role: u.role,
          team: 'Unassigned',
          lastSeen: u.last_seen ?? 'Never',
          daysSinceLastSeen: u.daysSinceLastSeen !== null ? String(u.daysSinceLastSeen) : 'N/A',
        });
      }
    }
    if (rows.length === 0) return;
    const header = 'Name,Email,Role,Team,Last Seen,Days Inactive';
    const csvContent = [header, ...rows.map(r =>
      `"${r.name}","${r.email}","${r.role}","${r.team}","${r.lastSeen}","${r.daysSinceLastSeen}"`
    )].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `at-risk-users-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectTeam(teamId: string) {
    setExpandedTeamId(teamId);
    const el = document.getElementById('team-user-directory');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Compute coach/player counts for tab badges
  const coachCount = useMemo(() => {
    let count = 0;
    for (const team of userActivity.teams) {
      for (const m of team.members) {
        if (m.role === 'coach') count++;
      }
    }
    for (const u of userActivity.unassigned) {
      if (u.role === 'coach') count++;
    }
    return count;
  }, [userActivity.teams, userActivity.unassigned]);

  const playerCount = useMemo(() => {
    let count = 0;
    for (const team of userActivity.teams) {
      for (const m of team.members) {
        if (m.role === 'player') count++;
      }
    }
    for (const u of userActivity.unassigned) {
      if (u.role === 'player') count++;
    }
    return count;
  }, [userActivity.teams, userActivity.unassigned]);

  // Coaches + players is the population that appears in the team/unassigned
  // directory below. summary.totalUsers (from data.users) also counts admins
  // and any user rows without a coach/player record, so the two numbers will
  // disagree on screens like the "never logged in" alert. Use the directory
  // population as the canonical "user" count throughout this tab so the KPIs,
  // tab badges, and alert math stay consistent (51 = 51, not 51 in one spot
  // and 61 elsewhere).
  const directoryUserCount = coachCount + playerCount;

  const viewTabs: { label: string; value: ViewMode; count?: number }[] = [
    { label: 'All Users', value: 'all', count: directoryUserCount },
    { label: 'Coaches', value: 'coaches', count: coachCount },
    { label: 'Players', value: 'players', count: playerCount },
    { label: 'Teams', value: 'teams', count: userActivity.teams.length },
    { label: 'At-Risk', value: 'at_risk', count: atRiskCount },
  ];

  const hasAtRiskUsers = atRiskCount > 0;
  const showAtRiskEmptyState = viewMode === 'at_risk' && !hasAtRiskUsers;

  return (
    <div className="space-y-6">
      {/* View Mode Sub-Tabs */}
      <div className="flex items-center gap-1 p-1 bg-warm-50/60 rounded-full border border-warm-100/50 w-full sm:w-fit overflow-x-auto scrollbar-hide">
        {viewTabs.map((tab) => (
          <Button variant="danger"
            key={tab.value}
            onClick={() => setViewMode(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0',
              viewMode === tab.value
                ? 'bg-cream-50 shadow text-warm-900'
                : 'text-warm-500 hover:text-warm-700 hover:bg-cream-100',
              tab.value === 'at_risk' && atRiskCount > 0 && viewMode !== 'at_risk' && 'text-red-500'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'ml-1.5 text-xs tabular-nums',
                viewMode === tab.value ? 'text-warm-500' : 'text-warm-400',
                tab.value === 'at_risk' && atRiskCount > 0 && 'text-red-400'
              )}>
                {tab.count}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Bulk Action Bar for At-Risk view */}
      {viewMode === 'at_risk' && hasAtRiskUsers && (
        <div className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl',
          'bg-red-50/60 border border-red-200/30',
          'backdrop-blur-sm'
        )}>
          <p className="text-sm font-semibold text-red-800 w-full sm:w-auto">
            {atRiskCount} user{atRiskCount !== 1 ? 's' : ''} at risk
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto overflow-x-auto scrollbar-hide">
            <Button variant="ghost"
              onClick={handleSelectAll}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-cream-50/92 text-warm-700 hover:bg-cream-50 border border-warm-200/50'
              )}
            >
              {selectedAtRiskIds.size === allAtRiskIds.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="danger"
              onClick={handleEmailReengagement}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-red-600 text-white hover:bg-red-700',
                'flex items-center gap-1.5'
              )}
            >
              <IconMail size={12} />
              Email Re-engagement
            </Button>
            <Button variant="ghost"
              onClick={handleExportCsv}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-cream-50/92 text-warm-700 hover:bg-cream-50 border border-warm-200/50',
                'flex items-center gap-1.5'
              )}
            >
              <IconDownload size={12} />
              Export CSV
            </Button>
          </div>
        </div>
      )}

      {/* At-Risk Empty State */}
      {showAtRiskEmptyState && (
        <div className={cn(
          'flex flex-col items-center justify-center py-12 rounded-2xl',
          'bg-primary-50/40 border border-primary-200/30',
          'backdrop-blur-sm'
        )}>
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mb-3">
            <IconCheckCircle2 size={24} className="text-primary-600" />
          </div>
          <p className="text-sm font-semibold text-primary-900">No at-risk users!</p>
          <p className="text-xs text-primary-700 mt-1">All users are active.</p>
        </div>
      )}

      {/* Team Health Cards - hide in at_risk empty state */}
      {!showAtRiskEmptyState && (viewMode === 'all' || viewMode === 'teams') && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-warm-900">Teams</h3>
            <span className="text-xs text-warm-400">{userActivity.teams.length} teams</span>
          </div>
          <TeamHealthCards teams={userActivity.teams} onSelectTeam={handleSelectTeam} />
        </div>
      )}

      {/* Alert Banners - only show in 'all' mode */}
      {viewMode === 'all' && (
        <div className="space-y-2">
          {summary.stuckInOnboarding > 0 && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-2xl',
              'bg-orange-50/80 border border-orange-200/40',
              'backdrop-blur-sm'
            )}>
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconClock size={18} className="text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-orange-900">
                  {summary.stuckInOnboarding} user{summary.stuckInOnboarding !== 1 ? 's' : ''} stuck in onboarding for 7+ days
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  These users signed up but never completed onboarding. Check for UX issues or send a reminder.
                </p>
                <OnboardingStuckList teams={userActivity.teams} unassigned={userActivity.unassigned} />
              </div>
            </div>
          )}

          {summary.neverLoggedIn > 0 && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-2xl',
              'bg-amber-50/80 border border-amber-200/40',
              'backdrop-blur-sm'
            )}>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconUserX size={18} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  {summary.neverLoggedIn} of {directoryUserCount} users have never logged in
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {Math.round((summary.neverLoggedIn / Math.max(directoryUserCount, 1)) * 100)}% never-login rate suggests onboarding needs attention.
                </p>
              </div>
            </div>
          )}

          {summary.inactivePlus14d > 0 && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-2xl',
              'bg-red-50/80 border border-red-200/40',
              'backdrop-blur-sm'
            )}>
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconWarning size={18} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">
                  {summary.inactivePlus14d} users inactive for 14+ days
                </p>
                <p className="text-xs text-red-700 mt-1">
                  These users logged in before but haven&apos;t been back. Re-engagement needed.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Stats Row */}
      {!showAtRiskEmptyState && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Users" value={directoryUserCount} icon={<IconUsers size={14} />} />
          <SummaryCard label="Active Today" value={summary.activeToday} color={summary.activeToday > 0 ? 'green' : undefined} icon={<div className="w-2 h-2 rounded-full bg-primary-500" />} />
          <SummaryCard label="Active 7d" value={summary.activeThisWeek} color={summary.activeThisWeek > 5 ? 'green' : undefined} />
          <SummaryCard label="Never Logged In" value={summary.neverLoggedIn} color={summary.neverLoggedIn > 0 ? 'amber' : undefined} />
          <SummaryCard label="Stuck Onboarding" value={summary.stuckInOnboarding} color={summary.stuckInOnboarding > 0 ? 'orange' : undefined} />
          {/* Churn Risk was a duplicate of Inactive 14d+ (rollup-c sets churnRisk = inactivePlus14d).
              Render a single, clearer card instead of stacking two identical 28s side-by-side. */}
          <SummaryCard
            label="Inactive 14d+"
            value={summary.inactivePlus14d}
            color={summary.inactivePlus14d > 0 ? 'red' : undefined}
            action={
              inactive14dRecipients.length > 0
                ? {
                    label: `Email these ${inactive14dRecipients.length}`,
                    onClick: handleLaunchReengagement,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Bulk Email launcher for Inactive 14d+. We pass `coaches=[]` because the
          modal's prefilledRecipients flow replaces the selection entirely when
          prefills are provided (synthesizes minimal Coach objects internally). */}
      {reengageRecipients && (
        <BulkEmailModal
          coaches={[]}
          prefilledRecipients={reengageRecipients}
          onClose={() => setReengageRecipients(null)}
          onSuccess={() => setReengageRecipients(null)}
        />
      )}

      {/* Team User Directory */}
      {!showAtRiskEmptyState && (
        <div id="team-user-directory">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-warm-900">User Directory</h3>
            <span className="text-xs text-warm-400">
              {viewMode === 'all' ? 'Grouped by team' :
               viewMode === 'coaches' ? 'Coaches only' :
               viewMode === 'players' ? 'Players only' :
               viewMode === 'teams' ? 'Grouped by team' :
               'At-risk users'}
            </span>
          </div>
          <TeamUserDirectory
            teams={filteredTeams}
            unassigned={filteredUnassigned}
            onSelectUser={setSelectedUserId}
            expandedTeamId={expandedTeamId}
          />
        </div>
      )}

      {/* User Detail Slide-Over */}
      {selectedUserId && (
        <UserDetailPanel
          userId={selectedUserId}
          teams={userActivity.teams}
          unassigned={userActivity.unassigned}
          userDirectory={userDirectory}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
  action,
}: {
  label: string;
  value: number;
  color?: string;
  icon?: React.ReactNode;
  /** Optional in-card action — currently used by "Inactive 14d+" to launch
   *  the re-engagement BulkEmailModal pre-filled with those users. */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={cn(
      'p-3 rounded-xl glass-standard',
      'text-center flex flex-col items-center justify-between gap-1.5'
    )}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <p className={cn(
          'text-xl font-bold tabular-nums',
          color === 'green' ? 'text-primary-600' :
          color === 'amber' ? 'text-amber-600' :
          color === 'orange' ? 'text-orange-600' :
          color === 'red' ? 'text-red-600' :
          'text-warm-900'
        )}>{value}</p>
      </div>
      <p className="text-micro text-warm-400 uppercase tracking-wider font-medium">{label}</p>
      {action && (
        <Button variant="danger"
          type="button"
          onClick={action.onClick}
          className={cn(
            'mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-eyebrow font-semibold transition-colors',
            color === 'red'
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-primary-600 text-white hover:bg-primary-700',
          )}
        >
          <IconMail size={11} />
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Shows specific users stuck in onboarding */
function OnboardingStuckList({ teams, unassigned }: {
  teams: AdminDashboardData['userActivity']['teams'];
  unassigned: AdminDashboardData['userActivity']['unassigned'];
}) {
  const stuckUsers: { name: string; email: string; role: string; daysSinceSignup: number }[] = [];

  for (const team of teams) {
    for (const m of team.members) {
      if (!m.onboardingCompleted && m.created_at) {
        const daysSince = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
        if (daysSince > 7) {
          stuckUsers.push({
            name: m.name || m.email.split('@')[0] || 'Unknown',
            email: m.email,
            role: m.role,
            daysSinceSignup: daysSince,
          });
        }
      }
    }
  }

  for (const u of unassigned) {
    if (!u.onboardingCompleted && u.created_at) {
      const daysSince = Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000);
      if (daysSince > 7) {
        stuckUsers.push({
          name: u.name || u.email.split('@')[0] || 'Unknown',
          email: u.email,
          role: u.role,
          daysSinceSignup: daysSince,
        });
      }
    }
  }

  if (stuckUsers.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {stuckUsers.slice(0, 5).map((user) => (
        <div key={user.email} className="flex items-center gap-2 text-xs flex-wrap">
          <span className={cn(
            'px-1.5 py-0.5 rounded text-eyebrow font-semibold uppercase flex-shrink-0',
            user.role === 'coach' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
          )}>
            {user.role}
          </span>
          <span className="font-medium text-orange-800 truncate">{user.name}</span>
          <span className="text-orange-600 flex-shrink-0">signed up {user.daysSinceSignup}d ago</span>
        </div>
      ))}
      {stuckUsers.length > 5 && (
        <p className="text-eyebrow text-orange-500">and {stuckUsers.length - 5} more...</p>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronRight, IconSearch, IconWarning, IconSparkles, IconTarget } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { ActivityDot } from './ActivityDot';
import { timeAgo } from './admin-utils';
import { Button } from '@/components/ui/button';

type TeamMember = AdminDashboardData['userActivity']['teams'][0]['members'][0];
type TeamData = AdminDashboardData['userActivity']['teams'][0];

interface Props {
  teams: AdminDashboardData['userActivity']['teams'];
  unassigned: AdminDashboardData['userActivity']['unassigned'];
  onSelectUser?: (userId: string) => void;
  expandedTeamId?: string | null;
}

const roleColors: Record<string, string> = {
  coach: 'bg-blue-50 text-blue-700',
  player: 'bg-primary-50 text-primary-700',
  admin: 'bg-violet-50 text-violet-700',
};

type RoleFilter = 'all' | 'coach' | 'player' | 'admin';
type ActivityFilter = 'all' | 'active_7d' | 'inactive_30d' | 'never';

type LifecycleStage = 'brand_new' | 'active' | 'at_risk' | 'churned' | 'never';

function computeLifecycleStage(member: { created_at: string; last_seen: string | null; daysSinceLastSeen: number | null; activityStatus: string }): LifecycleStage {
  if (member.last_seen === null || member.activityStatus === 'never') return 'never';

  const createdDaysAgo = Math.floor((Date.now() - new Date(member.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const daysSince = member.daysSinceLastSeen ?? 0;

  if (createdDaysAgo < 7 && daysSince >= createdDaysAgo) return 'brand_new';
  if (daysSince <= 7) return 'active';
  if (daysSince <= 30) return 'at_risk';
  return 'churned';
}

const lifecycleConfig: Record<LifecycleStage, { label: string; className: string }> = {
  brand_new: { label: 'New', className: 'bg-blue-50 text-blue-700' },
  active: { label: 'Active', className: 'bg-primary-50 text-primary-700' },
  at_risk: { label: 'At Risk', className: 'bg-amber-50 text-amber-700' },
  churned: { label: 'Churned', className: 'bg-red-50 text-red-700' },
  never: { label: 'Never', className: 'bg-warm-100 text-warm-500' },
};

function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  const config = lifecycleConfig[stage];
  return (
    <span className={cn('text-micro font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap', config.className)}>
      {config.label}
    </span>
  );
}

function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();
  }
  return (email[0] ?? '?').toUpperCase();
}

function TeamSection({
  team,
  isExpanded,
  onToggle,
  onSelectUser,
  searchQuery,
  roleFilter,
  activityFilter,
}: {
  team: TeamData;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectUser?: (userId: string) => void;
  searchQuery: string;
  roleFilter: RoleFilter;
  activityFilter: ActivityFilter;
}) {
  const filteredMembers = useMemo(() => {
    return team.members.filter((m) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!m.email.toLowerCase().includes(q) && !(m.name ?? '').toLowerCase().includes(q)) return false;
      }
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (activityFilter === 'active_7d' && m.activityStatus !== 'active_today' && m.activityStatus !== 'active_week') return false;
      if (activityFilter === 'inactive_30d' && m.activityStatus !== 'inactive') return false;
      if (activityFilter === 'never' && m.activityStatus !== 'never') return false;
      return true;
    });
  }, [team.members, searchQuery, roleFilter, activityFilter]);

  if (filteredMembers.length === 0 && searchQuery) return null;

  return (
    <div className="border-b border-warm-100/50 last:border-b-0">
      {/* Team header */}
      <Button variant="ghost"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3',
          'hover:bg-warm-50/50 transition-colors duration-200',
          'text-left'
        )}
      >
        <IconChevronRight
          size={16}
          className={cn(
            'text-warm-400 transition-transform duration-200 flex-shrink-0',
            isExpanded && 'rotate-90'
          )}
        />
        <span className="text-sm font-semibold text-warm-900">{team.teamName}</span>
        {team.season && <span className="text-micro text-warm-400">{team.season}</span>}
        <span className="text-xs text-warm-400 font-medium">{team.memberCount} members</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-micro font-semibold',
            team.healthStatus === 'healthy' ? 'bg-primary-50 text-primary-700' :
            team.healthStatus === 'warning' ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          )}>
            {team.activeCount} active
          </span>
        </div>
      </Button>

      {/* Members table */}
      {isExpanded && (
        <div className="px-2 pb-2 overflow-x-auto">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-warm-100">
                <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider">User</th>
                <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider">Role</th>
                <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider hidden md:table-cell">Last Active</th>
                <th className="px-3 py-2 text-right text-micro font-semibold text-warm-400 uppercase tracking-wider hidden lg:table-cell">Rounds</th>
                <th className="px-3 py-2 text-right text-micro font-semibold text-warm-400 uppercase tracking-wider hidden lg:table-cell">AI Insights</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <MemberRow key={member.id} member={member} onSelect={onSelectUser} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, onSelect }: { member: TeamMember; onSelect?: (id: string) => void }) {
  const lifecycle = computeLifecycleStage(member);
  const showOnboardingWarning = !member.onboardingCompleted && member.created_at &&
    Math.floor((Date.now() - new Date(member.created_at).getTime()) / 86400000) > 7;

  return (
    <tr
      onClick={() => onSelect?.(member.id)}
      className={cn(
        'border-b border-warm-50 transition-colors duration-150',
        'hover:bg-warm-50/50 cursor-pointer',
        showOnboardingWarning && 'bg-orange-50/20'
      )}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              member.role === 'coach' ? 'bg-blue-50' : 'bg-primary-50'
            )}>
              <span className={cn(
                'text-xs font-bold',
                member.role === 'coach' ? 'text-blue-600' : 'text-primary-600'
              )}>
                {getInitials(member.name, member.email)}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5">
              <ActivityDot status={member.activityStatus} size="sm" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-warm-900 truncate">{member.name || member.email.split('@')[0]}</p>
              <LifecycleBadge stage={lifecycle} />
              {showOnboardingWarning && (
                <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
                  Onboarding
                </span>
              )}
            </div>
            <p className="text-label text-warm-400 truncate">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('text-micro font-semibold px-2 py-0.5 rounded-full uppercase', roleColors[member.role] ?? 'bg-warm-100 text-warm-500')}>
          {member.role}
        </span>
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <ActivityDot status={member.activityStatus} showLabel labelOverride={timeAgo(member.last_seen)} />
      </td>
      <td className="px-3 py-2.5 text-right hidden lg:table-cell">
        <div className="flex items-center justify-end gap-1">
          <IconTarget size={12} className="text-warm-300" />
          <span className="text-sm font-medium text-warm-700 tabular-nums">{member.roundsEntered}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right hidden lg:table-cell">
        <div className="flex items-center justify-end gap-1">
          <IconSparkles size={12} className="text-warm-300" />
          <span className="text-sm font-medium text-warm-700 tabular-nums">{member.insightsReceived}</span>
        </div>
      </td>
    </tr>
  );
}

export function TeamUserDirectory({ teams, unassigned, onSelectUser, expandedTeamId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (expandedTeamId) initial.add(expandedTeamId);
    else if (teams.length > 0 && teams[0]) initial.add(teams[0].teamId);
    return initial;
  });

  // React to expandedTeamId prop changes (e.g. clicking a team health card)
  useEffect(() => {
    if (expandedTeamId) {
      setExpanded((prev) => {
        if (prev.has(expandedTeamId)) return prev;
        const next = new Set(prev);
        next.add(expandedTeamId);
        return next;
      });
    }
  }, [expandedTeamId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  function toggleTeam(teamId: string) {
    const next = new Set(expanded);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    setExpanded(next);
  }

  const roles: { label: string; value: RoleFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Coaches', value: 'coach' },
    { label: 'Players', value: 'player' },
    { label: 'Admin', value: 'admin' },
  ];

  const filteredUnassigned = useMemo(() => {
    return unassigned.filter((u) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !(u.name ?? '').toLowerCase().includes(q)) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (activityFilter === 'active_7d' && u.activityStatus !== 'active_today' && u.activityStatus !== 'active_week') return false;
      if (activityFilter === 'inactive_30d' && u.activityStatus !== 'inactive') return false;
      if (activityFilter === 'never' && u.activityStatus !== 'never') return false;
      return true;
    });
  }, [unassigned, searchQuery, roleFilter, activityFilter]);

  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl',
      'border border-white/20 rounded-2xl',
      'shadow-glass overflow-hidden'
    )}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-warm-100 bg-warm-50/30">
        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-xs w-full sm:w-auto">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className={cn(
              'w-full pl-9 pr-3 py-2 rounded-md text-sm',
              'bg-white/80 border border-warm-200/50',
              'text-warm-900 placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300',
              'transition-all duration-200'
            )}
          />
        </div>

        {/* Role pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {roles.map((r) => (
            <Button variant="primary"
              key={r.value}
              onClick={() => setRoleFilter(r.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 flex-shrink-0 whitespace-nowrap',
                roleFilter === r.value
                  ? 'bg-warm-900 text-white'
                  : 'bg-white/60 text-warm-600 hover:bg-warm-100 active:bg-warm-200 border border-warm-200/50'
              )}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {/* Activity filter */}
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
          className={cn(
            'px-3 py-2 rounded-md text-xs font-medium',
            'bg-white/80 border border-warm-200/50 text-warm-600',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20'
          )}
        >
          <option value="all">All Activity</option>
          <option value="active_7d">Active (7d)</option>
          <option value="inactive_30d">Inactive (30d+)</option>
          <option value="never">Never Logged In</option>
        </select>
      </div>

      {/* Team sections */}
      <div>
        {teams.map((team) => (
          <TeamSection
            key={team.teamId}
            team={team}
            isExpanded={expanded.has(team.teamId)}
            onToggle={() => toggleTeam(team.teamId)}
            onSelectUser={onSelectUser}
            searchQuery={searchQuery}
            roleFilter={roleFilter}
            activityFilter={activityFilter}
          />
        ))}

        {/* Unassigned users */}
        {filteredUnassigned.length > 0 && (
          <div className="border-t border-warm-200/50">
            <div className="border-l-2 border-l-amber-400 mx-2">
              <Button variant="ghost"
                onClick={() => toggleTeam('__unassigned__')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3',
                  'hover:bg-warm-50/50 transition-colors duration-200',
                  'text-left'
                )}
              >
                <IconChevronRight
                  size={16}
                  className={cn(
                    'text-warm-400 transition-transform duration-200 flex-shrink-0',
                    expanded.has('__unassigned__') && 'rotate-90'
                  )}
                />
                <IconWarning size={14} className="text-amber-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-warm-700">No Team Assigned</span>
                <span className="text-xs text-amber-600 font-medium">{filteredUnassigned.length} users</span>
              </Button>

              {expanded.has('__unassigned__') && (
                <div className="px-2 pb-2 overflow-x-auto">
                  <table className="w-full min-w-[400px]">
                    <thead>
                      <tr className="border-b border-warm-100">
                        <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider">User</th>
                        <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider">Role</th>
                        <th className="px-3 py-2 text-left text-micro font-semibold text-warm-400 uppercase tracking-wider hidden md:table-cell">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnassigned.map((u) => {
                        const displayName = u.name || u.email.split('@')[0] || 'Unknown';
                        const showOnboardingTag = !u.onboardingCompleted && u.created_at &&
                          Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000) > 7;

                        return (
                          <tr
                            key={u.id}
                            onClick={() => onSelectUser?.(u.id)}
                            className={cn(
                              'border-b border-warm-50 hover:bg-warm-50/50 cursor-pointer transition-colors',
                              showOnboardingTag && 'bg-orange-50/20'
                            )}
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="relative">
                                  <div className={cn(
                                    'w-8 h-8 rounded-lg flex items-center justify-center',
                                    u.role === 'coach' ? 'bg-blue-50' : u.role === 'admin' ? 'bg-violet-50' : 'bg-primary-50'
                                  )}>
                                    <span className={cn(
                                      'text-xs font-bold',
                                      u.role === 'coach' ? 'text-blue-600' : u.role === 'admin' ? 'text-violet-600' : 'text-primary-600'
                                    )}>
                                      {getInitials(u.name, u.email)}
                                    </span>
                                  </div>
                                  <div className="absolute -bottom-0.5 -right-0.5">
                                    <ActivityDot status={u.activityStatus} size="sm" />
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium text-warm-900 truncate">{displayName}</p>
                                    {showOnboardingTag && (
                                      <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
                                        Onboarding
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-label text-warm-400 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn('text-micro font-semibold px-2 py-0.5 rounded-full uppercase', roleColors[u.role] ?? 'bg-warm-100 text-warm-500')}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 hidden md:table-cell">
                              <ActivityDot status={u.activityStatus} showLabel labelOverride={timeAgo(u.last_seen)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

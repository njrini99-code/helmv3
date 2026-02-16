'use client';

import { useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { timeAgo } from './admin-utils';

interface Props {
  teamRosters: AdminDashboardData['teamRosters'];
}

export function TeamRosterCard({ teamRosters }: Props) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  function toggleTeam(id: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedTeams(new Set(teamRosters.map((t) => t.id)));
  }

  function collapseAll() {
    setExpandedTeams(new Set());
  }

  const totalPlayers = teamRosters.reduce((s, t) => s + t.players.length, 0);
  const totalCoaches = teamRosters.reduce((s, t) => s + t.coaches.length, 0);

  if (teamRosters.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <Users size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Team Rosters</h3>
        </div>
        <p className="text-sm text-warm-400">No teams created yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <Users size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-warm-900">Team Rosters</h3>
            <p className="text-xs text-warm-400">{teamRosters.length} teams &middot; {totalPlayers} players &middot; {totalCoaches} coaches</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-xs text-warm-500 hover:text-warm-700 bg-white/50 rounded-lg hover:bg-white/70 transition-all"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 text-xs text-warm-500 hover:text-warm-700 bg-white/50 rounded-lg hover:bg-white/70 transition-all"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {teamRosters.map((team) => {
          const isExpanded = expandedTeams.has(team.id);

          return (
            <div key={team.id} className="bg-white/50 rounded-xl overflow-hidden transition-all duration-200">
              {/* Team header - clickable */}
              <button
                onClick={() => toggleTeam(team.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-warm-400">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-warm-900">{team.name}</h4>
                    {team.orgName && (
                      <p className="text-xs text-warm-400">{team.orgName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-warm-500">
                  <span>{team.players.length} players</span>
                  <span>{team.coaches.length} coaches</span>
                </div>
              </button>

              {/* Expanded roster */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  {/* Coaches */}
                  {team.coaches.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-warm-400 uppercase tracking-wide mb-2 px-1">Coaches</p>
                      <div className="space-y-1.5">
                        {team.coaches.map((c) => (
                          <div key={c.id} className="flex items-center justify-between bg-blue-50/50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-[10px] font-medium text-blue-700">
                                  {c.firstName.charAt(0) || c.email.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-warm-800">
                                {c.firstName} {c.lastName}
                              </span>
                            </div>
                            <span className="text-xs text-warm-400">{c.email}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Players */}
                  {team.players.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-warm-400 uppercase tracking-wide mb-2 px-1">Players</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-warm-100/50">
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Name</th>
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Year</th>
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Scoring Avg</th>
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Rounds</th>
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Last Active</th>
                              <th className="text-left py-1.5 px-2 text-xs font-medium text-warm-400">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.players.map((p) => (
                              <tr key={p.id} className="border-b border-warm-50/50 hover:bg-white/40 transition-colors">
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                                      <span className="text-[10px] font-medium text-primary-700">
                                        {p.firstName.charAt(0) || '?'}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-warm-800 font-medium truncate">{p.firstName} {p.lastName}</p>
                                      {p.email && <p className="text-[10px] text-warm-400 truncate">{p.email}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <span className="text-xs text-warm-600 tabular-nums">
                                    {p.gradYear ?? '—'}
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  <span className={cn(
                                    'text-sm font-medium tabular-nums',
                                    p.scoringAvg != null ? 'text-warm-800' : 'text-warm-300'
                                  )}>
                                    {p.scoringAvg != null ? p.scoringAvg.toFixed(1) : '—'}
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  <span className={cn(
                                    'text-sm tabular-nums',
                                    p.totalRounds > 0 ? 'text-warm-700' : 'text-warm-300'
                                  )}>
                                    {p.totalRounds}
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  <span className={cn(
                                    'text-xs tabular-nums',
                                    p.lastRoundDate ? 'text-warm-600' : 'text-warm-300'
                                  )}>
                                    {timeAgo(p.lastRoundDate)}
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  {p.onboardingCompleted ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-primary-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                      Onboarding
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-warm-400 px-1">No players on this team yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

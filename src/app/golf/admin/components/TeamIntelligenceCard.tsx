'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { IconUsers } from '@/components/icons';

interface Props {
  teams: AdminDashboardData['teams'];
}

export function TeamIntelligenceCard({ teams }: Props) {
  if (teams.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconUsers size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Team Intelligence</h3>
        </div>
        <p className="text-sm text-warm-400">No teams created yet.</p>
      </div>
    );
  }

  const totalPlayers = teams.reduce((s, t) => s + t.playerCount, 0);
  const totalRoundsWeek = teams.reduce((s, t) => s + t.roundsThisWeek, 0);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconUsers size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Team Intelligence</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-warm-400">
          <span>{teams.length} teams</span>
          <span>{totalPlayers} players</span>
          <span>{totalRoundsWeek} rounds/wk</span>
        </div>
      </div>

      <div className="space-y-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className="bg-white/50 rounded-xl p-4 transition-all duration-200 hover:bg-white/70"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="text-sm font-semibold text-warm-900">{team.name}</h4>
                {team.orgName && (
                  <p className="text-xs text-warm-400">{team.orgName}</p>
                )}
              </div>
              {team.avgScore != null && (
                <div className="text-right">
                  <p className="text-lg font-semibold text-warm-900 tabular-nums">
                    {team.avgScore.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-warm-400">Team Avg</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-sm font-medium text-warm-800 tabular-nums">{team.playerCount}</p>
                <p className="text-[10px] text-warm-400">Players</p>
              </div>
              <div>
                <p className="text-sm font-medium text-warm-800 tabular-nums">{team.coachCount}</p>
                <p className="text-[10px] text-warm-400">Coaches</p>
              </div>
              <div>
                <p className="text-sm font-medium text-warm-800 tabular-nums">{team.roundsThisWeek}</p>
                <p className="text-[10px] text-warm-400">Rounds/Wk</p>
              </div>
              <div>
                {team.topPlayer ? (
                  <>
                    <p className="text-sm font-medium text-primary-700 tabular-nums">
                      {team.topPlayer.avg.toFixed(1)}
                    </p>
                    <p className="text-[10px] text-warm-400 truncate" title={team.topPlayer.name}>
                      {team.topPlayer.name.split(' ')[1] || team.topPlayer.name}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-warm-300">&mdash;</p>
                    <p className="text-[10px] text-warm-400">Top Player</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

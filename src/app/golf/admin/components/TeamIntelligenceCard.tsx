'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { Users } from 'lucide-react';

interface Props {
  teams: AdminDashboardData['teams'];
}

const barColors = ['#16A34A', '#2563EB', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];

function TeamComparisonChart({ teams }: { teams: AdminDashboardData['teams'] }) {
  const teamsWithScore = teams.filter((t) => t.avgScore != null).slice(0, 6);
  if (teamsWithScore.length < 2) return null;

  const maxScore = Math.max(...teamsWithScore.map((t) => t.avgScore ?? 0));
  const minScore = Math.min(...teamsWithScore.map((t) => t.avgScore ?? 0));
  const range = maxScore - minScore || 1;

  return (
    <div className="mb-5">
      <h4 className="text-sm font-medium text-warm-500 mb-3">Team Scoring Comparison</h4>
      <div className="space-y-2.5">
        {teamsWithScore.map((team, i) => {
          const score = team.avgScore ?? 0;
          const normalized = maxScore === minScore ? 50 : ((maxScore - score) / range) * 60 + 30;
          const color = barColors[i % barColors.length]!;
          return (
            <div key={team.id} className="flex items-center gap-3">
              <span className="text-xs text-warm-500 w-24 truncate text-right shrink-0" title={team.name}>
                {team.name}
              </span>
              <div className="flex-1 h-6 bg-warm-50 rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${normalized}%`,
                    backgroundImage: `linear-gradient(to right, ${color}99, ${color})`,
                  }}
                >
                  <span className="text-[10px] font-semibold text-white drop-shadow-sm tabular-nums">
                    {score.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeamIntelligenceCard({ teams }: Props) {
  if (teams.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <Users size={18} />
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
            <Users size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Team Intelligence</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-warm-400">
          <span>{teams.length} teams</span>
          <span>{totalPlayers} players</span>
          <span>{totalRoundsWeek} rounds/wk</span>
        </div>
      </div>

      <TeamComparisonChart teams={teams} />

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

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DataFreshnessAlertsProps {
  churnRiskPlayers: {
    id: string;
    name: string;
    teamName: string | null;
    daysSinceLastRound: number;
    totalRounds: number;
    lastRoundDate: string | null;
  }[];
  inactiveTeams: {
    id: string;
    name: string;
    playerCount: number;
    daysSinceAnyLogin: number;
    lastActivityDate: string | null;
  }[];
  disengagedCoaches: {
    id: string;
    name: string;
    teamName: string | null;
    daysSinceInsightCheck: number;
    totalInsightsAvailable: number;
    lastInsightCheckDate: string | null;
  }[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        'transition-transform duration-200',
        open ? 'rotate-180' : 'rotate-0'
      )}
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionHeader({
  title,
  count,
  variant,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  variant: 'red' | 'amber' | 'green';
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-xl px-4 py-3 transition-colors duration-200 hover:bg-white/40"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-warm-900">{title}</span>
        {count > 0 ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              variant === 'red' && 'bg-red-100 text-red-700',
              variant === 'amber' && 'bg-amber-100 text-amber-700',
              variant === 'green' && 'bg-green-100 text-green-700'
            )}
          >
            {count}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            All clear
          </span>
        )}
      </div>
      <span className="text-warm-400">
        <ChevronIcon open={open} />
      </span>
    </button>
  );
}

export default function DataFreshnessAlerts({
  churnRiskPlayers,
  inactiveTeams,
  disengagedCoaches,
}: DataFreshnessAlertsProps) {
  const hasChurnRisk = churnRiskPlayers.length > 0;
  const hasInactiveTeams = inactiveTeams.length > 0;
  const hasDisengaged = disengagedCoaches.length > 0;

  const [churnOpen, setChurnOpen] = useState(hasChurnRisk);
  const [teamsOpen, setTeamsOpen] = useState(!hasChurnRisk && hasInactiveTeams);
  const [coachesOpen, setCoachesOpen] = useState(
    !hasChurnRisk && !hasInactiveTeams && hasDisengaged
  );

  const [churnShowAll, setChurnShowAll] = useState(false);
  const [teamsShowAll, setTeamsShowAll] = useState(false);
  const [coachesShowAll, setCoachesShowAll] = useState(false);

  const INITIAL_LIMIT = 10;

  const sortedChurnPlayers = [...churnRiskPlayers].sort(
    (a, b) => b.daysSinceLastRound - a.daysSinceLastRound
  );
  const sortedInactiveTeams = [...inactiveTeams].sort(
    (a, b) => b.daysSinceAnyLogin - a.daysSinceAnyLogin
  );
  const sortedDisengagedCoaches = [...disengagedCoaches].sort(
    (a, b) => b.daysSinceInsightCheck - a.daysSinceInsightCheck
  );

  const visibleChurn = churnShowAll
    ? sortedChurnPlayers
    : sortedChurnPlayers.slice(0, INITIAL_LIMIT);
  const visibleTeams = teamsShowAll
    ? sortedInactiveTeams
    : sortedInactiveTeams.slice(0, INITIAL_LIMIT);
  const visibleCoaches = coachesShowAll
    ? sortedDisengagedCoaches
    : sortedDisengagedCoaches.slice(0, INITIAL_LIMIT);

  const churnBadgeVariant = sortedChurnPlayers.some(
    (p) => p.daysSinceLastRound > 30
  )
    ? 'red'
    : 'amber';

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
      <h2 className="text-lg font-semibold text-warm-900 mb-4">
        Freshness Alerts
      </h2>

      <div className="space-y-2">
        {/* Churn Risk Players */}
        <div>
          <SectionHeader
            title="Churn Risk Players"
            count={churnRiskPlayers.length}
            variant={hasChurnRisk ? churnBadgeVariant : 'green'}
            open={churnOpen}
            onToggle={() => setChurnOpen(!churnOpen)}
          />
          {churnOpen && (
            <div className="mt-1 px-1">
              {!hasChurnRisk ? (
                <p className="px-4 py-3 text-sm text-green-600">
                  All players are actively submitting rounds.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-200/50 bg-white/30">
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Player
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Team
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Last Round
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Rounds
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Days Inactive
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleChurn.map((player) => (
                          <tr
                            key={player.id}
                            className={cn(
                              'border-b border-warm-100/50 last:border-b-0',
                              player.daysSinceLastRound > 30
                                ? 'bg-red-50/60'
                                : 'bg-amber-50/60'
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-warm-900">
                              {player.name}
                            </td>
                            <td className="px-4 py-2.5 text-warm-500">
                              {player.teamName ?? 'No team'}
                            </td>
                            <td className="px-4 py-2.5 text-warm-500">
                              {formatDate(player.lastRoundDate)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-warm-500">
                              {player.totalRounds}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span
                                className={cn(
                                  'font-medium',
                                  player.daysSinceLastRound > 30
                                    ? 'text-red-600'
                                    : 'text-amber-600'
                                )}
                              >
                                {player.daysSinceLastRound}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedChurnPlayers.length > INITIAL_LIMIT && (
                    <button
                      onClick={() => setChurnShowAll(!churnShowAll)}
                      className="mt-2 px-4 py-1.5 text-xs font-medium text-warm-500 hover:text-warm-900 transition-colors duration-200"
                    >
                      {churnShowAll
                        ? 'Show less'
                        : `Show all ${sortedChurnPlayers.length}`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Inactive Teams */}
        <div>
          <SectionHeader
            title="Inactive Teams"
            count={inactiveTeams.length}
            variant={hasInactiveTeams ? 'amber' : 'green'}
            open={teamsOpen}
            onToggle={() => setTeamsOpen(!teamsOpen)}
          />
          {teamsOpen && (
            <div className="mt-1 px-1">
              {!hasInactiveTeams ? (
                <p className="px-4 py-3 text-sm text-green-600">
                  All teams have recent login activity.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-200/50 bg-white/30">
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Team
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Players
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Last Activity
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Days Inactive
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTeams.map((team) => (
                          <tr
                            key={team.id}
                            className="border-b border-warm-100/50 last:border-b-0 bg-amber-50/60"
                          >
                            <td className="px-4 py-2.5 font-medium text-warm-900">
                              {team.name}
                            </td>
                            <td className="px-4 py-2.5 text-right text-warm-500">
                              {team.playerCount}
                            </td>
                            <td className="px-4 py-2.5 text-warm-500">
                              {formatDate(team.lastActivityDate)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="font-medium text-amber-600">
                                {team.daysSinceAnyLogin}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedInactiveTeams.length > INITIAL_LIMIT && (
                    <button
                      onClick={() => setTeamsShowAll(!teamsShowAll)}
                      className="mt-2 px-4 py-1.5 text-xs font-medium text-warm-500 hover:text-warm-900 transition-colors duration-200"
                    >
                      {teamsShowAll
                        ? 'Show less'
                        : `Show all ${sortedInactiveTeams.length}`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Disengaged Coaches */}
        <div>
          <SectionHeader
            title="Disengaged Coaches"
            count={disengagedCoaches.length}
            variant={hasDisengaged ? 'amber' : 'green'}
            open={coachesOpen}
            onToggle={() => setCoachesOpen(!coachesOpen)}
          />
          {coachesOpen && (
            <div className="mt-1 px-1">
              {!hasDisengaged ? (
                <p className="px-4 py-3 text-sm text-green-600">
                  All coaches are regularly checking insights.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-200/50 bg-white/30">
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Coach
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Team
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-warm-500">
                            Last Check
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Insights Available
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-warm-500">
                            Days Since Check
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCoaches.map((coach) => (
                          <tr
                            key={coach.id}
                            className="border-b border-warm-100/50 last:border-b-0 bg-amber-50/60"
                          >
                            <td className="px-4 py-2.5 font-medium text-warm-900">
                              {coach.name}
                            </td>
                            <td className="px-4 py-2.5 text-warm-500">
                              {coach.teamName ?? 'No team'}
                            </td>
                            <td className="px-4 py-2.5 text-warm-500">
                              {formatDate(coach.lastInsightCheckDate)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-warm-500">
                              {coach.totalInsightsAvailable}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="font-medium text-amber-600">
                                {coach.daysSinceInsightCheck}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedDisengagedCoaches.length > INITIAL_LIMIT && (
                    <button
                      onClick={() => setCoachesShowAll(!coachesShowAll)}
                      className="mt-2 px-4 py-1.5 text-xs font-medium text-warm-500 hover:text-warm-900 transition-colors duration-200"
                    >
                      {coachesShowAll
                        ? 'Show less'
                        : `Show all ${sortedDisengagedCoaches.length}`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

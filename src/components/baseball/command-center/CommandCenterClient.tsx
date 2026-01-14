'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BaseballInviteButton } from './BaseballInviteButton';
import { PlayerCommandCard } from './PlayerCommandCard';
import { InsightsFeed } from './InsightsFeed';
import { TeamStatsOverview } from './TeamStatsOverview';
import type { BaseballRosterPlayer, BaseballCoachInsight } from '@/lib/types';
import {
  IconUsers,
  IconChartBar,
  IconUpload,
  IconSearch,
  IconFilter,
} from '@/components/icons';

interface CommandCenterClientProps {
  team: {
    id: string;
    name: string;
    teamType: string;
    inviteCode: string | null;
  };
  players: BaseballRosterPlayer[];
  insights: BaseballCoachInsight[];
  coachName?: string; // Optional - for future greeting/personalization
}

type FilterType = 'all' | 'improving' | 'declining' | 'needs_attention';
type SortType = 'name' | 'avg' | 'recent' | 'trend';

export function CommandCenterClient({
  team,
  players,
  insights,
  coachName: _coachName,
}: CommandCenterClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('name');
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = [...players];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.first_name?.toLowerCase().includes(query) ||
          p.last_name?.toLowerCase().includes(query) ||
          p.primary_position?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filterType !== 'all') {
      result = result.filter((p) => {
        const trend = p.aggregates?.recent_trend;
        switch (filterType) {
          case 'improving':
            return trend === 'improving';
          case 'declining':
            return trend === 'declining';
          case 'needs_attention':
            return (p.insights?.length ?? 0) > 0;
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortType) {
        case 'name':
          return `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`
          );
        case 'avg':
          return (b.aggregates?.career_avg ?? 0) - (a.aggregates?.career_avg ?? 0);
        case 'recent':
          return (b.aggregates?.last_5_avg ?? 0) - (a.aggregates?.last_5_avg ?? 0);
        case 'trend':
          const trendOrder = { improving: 3, stable: 2, declining: 1 };
          return (
            (trendOrder[b.aggregates?.recent_trend ?? 'stable'] ?? 2) -
            (trendOrder[a.aggregates?.recent_trend ?? 'stable'] ?? 2)
          );
        default:
          return 0;
      }
    });

    return result;
  }, [players, searchQuery, filterType, sortType]);

  // Count stats
  const improvingCount = players.filter(
    (p) => p.aggregates?.recent_trend === 'improving'
  ).length;
  const decliningCount = players.filter(
    (p) => p.aggregates?.recent_trend === 'declining'
  ).length;
  const needsAttentionCount = players.filter(
    (p) => (p.insights?.length ?? 0) > 0
  ).length;

  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              Command Center
            </h1>
            <p className="text-slate-500 mt-1">
              {team.name} &middot; {players.length} players
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BaseballInviteButton
              teamId={team.id}
              teamName={team.name}
              existingCode={team.inviteCode}
            />
            <Link href="/baseball/dashboard/stats/upload">
              <Button variant="secondary" className="gap-2">
                <IconUpload size={18} />
                <span className="hidden sm:inline">Upload Stats</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Team Stats Overview */}
        <TeamStatsOverview
          totalPlayers={players.length}
          improvingCount={improvingCount}
          decliningCount={decliningCount}
          needsAttentionCount={needsAttentionCount}
          insights={insights}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Players List (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search and Filters */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                  <IconSearch
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>

                {/* Filter Toggle */}
                <Button
                  variant={showFilters ? 'primary' : 'secondary'}
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                >
                  <IconFilter size={18} />
                  Filters
                </Button>
              </div>

              {/* Expanded Filters */}
              {showFilters && (
                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Status:</span>
                    <div className="flex gap-1">
                      {(['all', 'improving', 'declining', 'needs_attention'] as FilterType[]).map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-3 py-1 text-sm rounded-full transition-colors ${
                              filterType === type
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {type === 'all'
                              ? 'All'
                              : type === 'needs_attention'
                              ? 'Needs Attention'
                              : type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Sort:</span>
                    <select
                      value={sortType}
                      onChange={(e) => setSortType(e.target.value as SortType)}
                      className="px-3 py-1 text-sm bg-white border border-slate-200 rounded-lg
                                 focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    >
                      <option value="name">Name</option>
                      <option value="avg">Career Avg</option>
                      <option value="recent">Recent Avg</option>
                      <option value="trend">Trend</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Players Grid */}
            {filteredPlayers.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <IconUsers size={24} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  {players.length === 0 ? 'No Players Yet' : 'No Results'}
                </h3>
                <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                  {players.length === 0
                    ? 'Invite players to your team to start tracking their performance.'
                    : 'Try adjusting your search or filters.'}
                </p>
                {players.length === 0 && (
                  <BaseballInviteButton
                    teamId={team.id}
                    teamName={team.name}
                    existingCode={team.inviteCode}
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredPlayers.map((player) => (
                  <PlayerCommandCard key={player.id} player={player} />
                ))}
              </div>
            )}
          </div>

          {/* Insights Sidebar (1/3) */}
          <div className="space-y-4">
            <InsightsFeed
              insights={[
                ...insights,
                ...players.flatMap((p) => p.insights || []),
              ]}
            />

            {/* Quick Actions */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link
                  href="/baseball/dashboard/stats/upload"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <IconUpload size={16} className="text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Upload Stats</p>
                    <p className="text-xs text-slate-500">
                      Import CSV from practice or game
                    </p>
                  </div>
                </Link>
                <Link
                  href="/baseball/dashboard/stats"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <IconChartBar size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">View All Stats</p>
                    <p className="text-xs text-slate-500">
                      Browse and filter team statistics
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

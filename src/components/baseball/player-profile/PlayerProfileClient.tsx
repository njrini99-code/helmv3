'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  IconArrowLeft,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconVideo,
  IconNote,
  IconChart,
  IconSparkles,
  IconPlus,
  IconChevronRight,
  IconTarget,
  IconActivity,
  IconBolt,
} from '@/components/icons';
import type { BaseballPlayerStats, BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';
import { PlayerStatsChart } from './PlayerStatsChart';
import { PlayerInsightsPanel } from './PlayerInsightsPanel';
import { PlayerNotesSection } from './PlayerNotesSection';
import { PlayerVideosGrid } from './PlayerVideosGrid';

interface PlayerProfileClientProps {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    grad_year: number | null;
    bats: string | null;
    throws: string | null;
    height_feet: number | null;
    height_inches: number | null;
    weight_lbs: number | null;
    gpa: number | null;
    city: string | null;
    state: string | null;
    high_school_name: string | null;
    jersey_number: string | null;
    team_position: string | null;
    team_status: string | null;
    joined_at: string | null;
  };
  stats: BaseballPlayerStats[];
  aggregates: BaseballPlayerAggregates | null;
  insights: BaseballCoachInsight[];
  notes: Array<{
    id: string;
    content: string;
    created_at: string;
    note_type?: string;
  }>;
  videos: Array<{
    id: string;
    title: string | null;
    thumbnail_url: string | null;
    video_url: string | null;
    created_at: string;
    video_type?: string;
  }>;
  teamId: string;
  teamName: string;
  coachId: string;
}

type Tab = 'overview' | 'stats' | 'videos' | 'notes' | 'insights';

export function PlayerProfileClient({
  player,
  stats,
  aggregates,
  insights,
  notes,
  videos,
  teamId: _teamId,
  teamName,
  coachId,
}: PlayerProfileClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  const height = player.height_feet && player.height_inches
    ? `${player.height_feet}'${player.height_inches}"`
    : null;

  const formatAvg = (avg: number | null | undefined) => {
    if (avg == null) return '—';
    return avg.toFixed(3).replace(/^0/, '');
  };

  const getTrendIcon = (trend: string | null | undefined) => {
    if (trend === 'improving') return <IconTrendingUp size={16} className="text-green-500" />;
    if (trend === 'declining') return <IconTrendingDown size={16} className="text-red-500" />;
    return <IconMinus size={16} className="text-slate-400" />;
  };

  const practiceStats = stats.filter(s => s.stat_type === 'practice');
  const gameStats = stats.filter(s => s.stat_type === 'game');

  // Calculate Pressure Performance Index
  const pressureIndex = aggregates?.pressure_gap != null
    ? aggregates.pressure_gap > 0 ? 'clutch' : aggregates.pressure_gap < -0.03 ? 'struggles' : 'consistent'
    : null;

  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/baseball/dashboard/command-center"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <IconArrowLeft size={20} />
          </Link>
          <div>
            <p className="text-sm text-slate-500">{teamName}</p>
            <h1 className="text-2xl font-semibold text-slate-900">{fullName}</h1>
          </div>
        </div>

        {/* Player Card */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar & Basic Info */}
            <div className="flex items-start gap-4">
              <Avatar
                src={player.avatar_url}
                name={fullName}
                size="xl"
              />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {player.jersey_number && (
                    <span className="text-2xl font-bold text-green-600">
                      #{player.jersey_number}
                    </span>
                  )}
                  <span className="text-lg font-semibold text-slate-900">{fullName}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                  {player.primary_position && (
                    <span className="px-2 py-0.5 bg-slate-100 rounded">{player.primary_position}</span>
                  )}
                  {player.secondary_position && (
                    <span className="px-2 py-0.5 bg-slate-100 rounded">{player.secondary_position}</span>
                  )}
                  {player.grad_year && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      Class of {player.grad_year}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
                  {height && <span>{height}</span>}
                  {player.weight_lbs && <span>{player.weight_lbs} lbs</span>}
                  {player.bats && <span>Bats: {player.bats}</span>}
                  {player.throws && <span>Throws: {player.throws}</span>}
                </div>
                {(player.city || player.state || player.high_school_name) && (
                  <p className="text-sm text-slate-500 mt-1">
                    {player.high_school_name && <span>{player.high_school_name}</span>}
                    {player.high_school_name && (player.city || player.state) && ' • '}
                    {player.city}{player.city && player.state && ', '}{player.state}
                  </p>
                )}
              </div>
            </div>

            {/* Key Stats */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 md:ml-auto">
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Career AVG</p>
                <p className="text-2xl font-bold text-slate-900">{formatAvg(aggregates?.career_avg)}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {getTrendIcon(aggregates?.recent_trend)}
                  <span className="text-xs text-slate-500">{aggregates?.recent_trend || 'stable'}</span>
                </div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Game AVG</p>
                <p className="text-2xl font-bold text-slate-900">{formatAvg(aggregates?.game_avg)}</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Practice AVG</p>
                <p className="text-2xl font-bold text-slate-900">{formatAvg(aggregates?.practice_avg)}</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Sessions</p>
                <p className="text-2xl font-bold text-slate-900">{aggregates?.total_sessions || 0}</p>
              </div>
            </div>
          </div>

          {/* Revolutionary Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
            {/* Pressure Performance Index */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <IconTarget size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-purple-600">Pressure Performance</p>
                <p className="text-lg font-semibold text-slate-900 capitalize">
                  {pressureIndex || 'N/A'}
                </p>
                {aggregates?.pressure_gap != null && (
                  <p className="text-xs text-slate-500">
                    {aggregates.pressure_gap > 0 ? '+' : ''}{(aggregates.pressure_gap * 1000).toFixed(0)} pts game vs practice
                  </p>
                )}
              </div>
            </div>

            {/* Trend Velocity */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <IconActivity size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-600">Trend Velocity</p>
                <p className="text-lg font-semibold text-slate-900">
                  {aggregates?.trend_magnitude != null
                    ? `${(aggregates.trend_magnitude * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-slate-500">
                  Rate of change (last 10 sessions)
                </p>
              </div>
            </div>

            {/* Exit Velocity */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <IconBolt size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-green-600">Exit Velocity</p>
                <p className="text-lg font-semibold text-slate-900">
                  {aggregates?.avg_exit_velocity?.toFixed(1) || 'N/A'} mph
                </p>
                {aggregates?.max_exit_velocity && (
                  <p className="text-xs text-slate-500">
                    Max: {aggregates.max_exit_velocity.toFixed(1)} mph
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {([
            { id: 'overview', label: 'Overview', icon: IconChart },
            { id: 'stats', label: 'Stats', icon: IconActivity },
            { id: 'videos', label: 'Videos', icon: IconVideo },
            { id: 'notes', label: 'Notes', icon: IconNote },
            { id: 'insights', label: 'AI Insights', icon: IconSparkles },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-green-600 text-white'
                  : 'bg-white/70 text-slate-600 hover:bg-white'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stats Chart */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Performance Trend</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('stats')}
                    className="gap-1"
                  >
                    View All <IconChevronRight size={14} />
                  </Button>
                </div>
                <PlayerStatsChart stats={stats.slice(0, 20)} />
              </div>

              {/* Recent Videos */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Recent Videos</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('videos')}
                    className="gap-1"
                  >
                    View All <IconChevronRight size={14} />
                  </Button>
                </div>
                <PlayerVideosGrid videos={videos.slice(0, 4)} compact />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* AI Insights */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <IconSparkles size={16} className="text-purple-500" />
                    AI Insights
                  </h3>
                </div>
                <PlayerInsightsPanel insights={insights.slice(0, 3)} />
                {insights.length > 3 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('insights')}
                    className="w-full mt-3"
                  >
                    View All ({insights.length})
                  </Button>
                )}
              </div>

              {/* Recent Notes */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Recent Notes</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                  >
                    <IconPlus size={14} />
                    Add
                  </Button>
                </div>
                <PlayerNotesSection notes={notes.slice(0, 3)} compact />
                {notes.length > 3 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('notes')}
                    className="w-full mt-3"
                  >
                    View All ({notes.length})
                  </Button>
                )}
              </div>

              {/* Session Breakdown */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Session Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Practice Sessions</span>
                    <span className="font-semibold text-slate-900">{practiceStats.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Game Sessions</span>
                    <span className="font-semibold text-slate-900">{gameStats.length}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-700">Total</span>
                    <span className="font-bold text-green-600">{stats.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Performance Over Time</h3>
              <PlayerStatsChart stats={stats} fullSize />
            </div>

            {/* Stats Table */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Session History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">AB</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">H</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">AVG</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">2B</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">HR</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">RBI</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat) => {
                      const sessionAvg = stat.at_bats && stat.at_bats > 0
                        ? (stat.hits || 0) / stat.at_bats
                        : null;
                      return (
                        <tr key={stat.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {new Date(stat.session_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              stat.stat_type === 'game'
                                ? 'bg-green-100 text-green-700'
                                : stat.stat_type === 'practice'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {stat.stat_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">{stat.at_bats || '—'}</td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">{stat.hits || '—'}</td>
                          <td className="px-4 py-3 text-center text-sm font-medium text-slate-900">
                            {formatAvg(sessionAvg)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">{stat.doubles || '—'}</td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">{stat.home_runs || '—'}</td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">{stat.rbis || '—'}</td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">
                            {stat.exit_velocity?.toFixed(1) || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-slate-900">All Videos</h3>
              <Button className="gap-1">
                <IconPlus size={16} />
                Add Video
              </Button>
            </div>
            <PlayerVideosGrid videos={videos} />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-slate-900">Coach Notes</h3>
              <Button className="gap-1">
                <IconPlus size={16} />
                Add Note
              </Button>
            </div>
            <PlayerNotesSection
              notes={notes}
              playerId={player.id}
              coachId={coachId}
            />
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <IconSparkles size={18} className="text-purple-500" />
                AI-Powered Insights
              </h3>
            </div>
            <PlayerInsightsPanel insights={insights} expanded />
          </div>
        )}
      </div>
    </div>
  );
}

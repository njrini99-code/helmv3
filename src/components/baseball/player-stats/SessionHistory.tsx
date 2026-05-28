'use client';

/**
 * SessionHistory
 * 
 * List of individual stat sessions with expandable details.
 */

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  IconChevronDown,
  IconChevronUp,
  IconCalendar,
  IconChart,
} from '@/components/icons';
import type { BaseballPlayerStats } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface SessionHistoryProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

interface SessionRowProps {
  stat: BaseballPlayerStats;
  isExpanded: boolean;
  onToggle: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SessionRow({ stat, isExpanded, onToggle }: SessionRowProps) {
  const avg = stat.at_bats > 0 ? (stat.hits / stat.at_bats).toFixed(3) : '---';
  const plateAppearances = stat.at_bats + stat.walks + stat.hit_by_pitch + stat.sacrifice_flies;
  const obp = plateAppearances > 0
    ? ((stat.hits + stat.walks + stat.hit_by_pitch) / plateAppearances).toFixed(3)
    : '---';
  const totalBases = stat.hits + stat.doubles + (stat.triples * 2) + (stat.home_runs * 3);
  const slg = stat.at_bats > 0 ? (totalBases / stat.at_bats).toFixed(3) : '---';

  const typeColor = stat.stat_type === 'game'
    ? 'bg-primary-100 text-primary-700'
    : stat.stat_type === 'practice'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-warm-100 text-warm-700';

  return (
    <div className="border-b border-warm-100 last:border-b-0">
      <Button variant="ghost"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-warm-50/50 transition-colors"
        aria-expanded={isExpanded}
        aria-label={`Session on ${formatDate(stat.session_date)}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-warm-600">
            <IconCalendar size={14} />
            <span className="text-sm font-medium text-warm-900">
              {formatDate(stat.session_date)}
            </span>
          </div>
          <span className={cn('text-micro font-medium px-2 py-0.5 rounded-full', typeColor)}>
            {stat.stat_type.charAt(0).toUpperCase() + stat.stat_type.slice(1)}
          </span>
          {stat.session_name && (
            <span className="text-sm text-warm-500 hidden sm:inline">
              {stat.session_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-sm font-semibold text-warm-900">{avg}</span>
            <span className="text-micro text-warm-400 ml-1">
              ({stat.hits}/{stat.at_bats})
            </span>
          </div>
          {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </div>
      </Button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-warm-50/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Slash Line */}
            <div>
              <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Slash Line</p>
              <p className="text-sm font-semibold text-warm-900">
                {avg}/{obp}/{slg}
              </p>
            </div>

            {/* Hitting */}
            <div>
              <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Hitting</p>
              <p className="text-sm text-warm-700">
                {stat.hits}H, {stat.doubles}2B, {stat.triples}3B, {stat.home_runs}HR
              </p>
            </div>

            {/* Plate Discipline */}
            <div>
              <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Plate Discipline</p>
              <p className="text-sm text-warm-700">
                {stat.walks}BB, {stat.strikeouts}K
              </p>
            </div>

            {/* RBIs & SBs */}
            <div>
              <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Production</p>
              <p className="text-sm text-warm-700">
                {stat.rbis}RBI, {stat.stolen_bases}SB
              </p>
            </div>

            {/* Exit Velocity */}
            {stat.exit_velocity !== null && (
              <div>
                <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Exit Velo</p>
                <p className="text-sm font-semibold text-warm-900">
                  {stat.exit_velocity.toFixed(1)} mph
                </p>
              </div>
            )}

            {/* Launch Angle */}
            {stat.launch_angle !== null && (
              <div>
                <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Launch Angle</p>
                <p className="text-sm font-semibold text-warm-900">
                  {stat.launch_angle.toFixed(1)}°
                </p>
              </div>
            )}

            {/* Pitching Stats (if any) */}
            {stat.innings_pitched > 0 && (
              <div className="col-span-2">
                <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Pitching</p>
                <p className="text-sm text-warm-700">
                  {stat.innings_pitched.toFixed(1)}IP, {stat.strikeouts_thrown}K, {stat.earned_runs}ER
                </p>
              </div>
            )}
          </div>

          {stat.notes && (
            <div className="mt-3 pt-3 border-t border-warm-100">
              <p className="text-micro text-warm-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-warm-700">{stat.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionHistory({ stats, className }: SessionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'game' | 'practice'>('all');

  const filteredStats = useMemo(() => {
    const sorted = [...stats].sort(
      (a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime()
    );

    if (filter === 'all') return sorted;
    return sorted.filter(s => s.stat_type === filter);
  }, [stats, filter]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  if (stats.length === 0) {
    return (
      <div className={cn('glass-standard rounded-2xl p-8 text-center', className)}>
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center">
            <IconChart size={20} className="text-warm-500" />
          </div>
        </div>
        <p className="text-warm-500">No sessions recorded yet.</p>
        <p className="text-sm text-warm-400 mt-1">
          Stats will appear here as sessions are logged.
        </p>
      </div>
    );
  }

  const gameSessions = stats.filter(s => s.stat_type === 'game').length;
  const practiceSessions = stats.filter(s => s.stat_type === 'practice').length;

  return (
    <div className={cn('glass-standard rounded-2xl overflow-clip', className)}>
      <div className="px-6 py-4 border-b border-warm-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-warm-900">Session History</h3>
            <p className="text-sm text-warm-500">
              {stats.length} total sessions • {gameSessions} games • {practiceSessions} practices
            </p>
          </div>

          <div className="flex gap-1 bg-warm-100 rounded-lg p-1" role="tablist" aria-label="Filter sessions">
            {(['all', 'game', 'practice'] as const).map((f) => (
              <Button variant="ghost"
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                  filter === f
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-600 hover:text-warm-900'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {filteredStats.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-warm-500">No {filter} sessions found.</p>
          </div>
        ) : (
          filteredStats.map(stat => (
            <SessionRow
              key={stat.id}
              stat={stat}
              isExpanded={expandedId === stat.id}
              onToggle={() => handleToggle(stat.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

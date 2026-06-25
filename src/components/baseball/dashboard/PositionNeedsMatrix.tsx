'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconTarget,
  IconChevronRight,
  IconSettings,
  IconCheck,
  IconWarning,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import type { WatchlistWithPlayer } from '@/lib/types';

interface PositionGoal {
  position: string;
  need: number;
}

interface PositionNeedsMatrixProps {
  watchlist: WatchlistWithPlayer[];
  gradYear?: number;
  loading?: boolean;
  onSetGoals?: () => void;
}

// Default position needs for a typical recruiting class
const DEFAULT_POSITION_GOALS: PositionGoal[] = [
  { position: 'RHP', need: 3 },
  { position: 'LHP', need: 2 },
  { position: 'C', need: 1 },
  { position: 'SS', need: 1 },
  { position: '2B', need: 1 },
  { position: '3B', need: 1 },
  { position: '1B', need: 1 },
  { position: 'OF', need: 3 },
  { position: 'UTL', need: 2 },
];

type PositionStatus = 'critical' | 'behind' | 'on_track' | 'ahead';

interface PositionData {
  position: string;
  need: number;
  pipeline: number;
  committed: number;
  status: PositionStatus;
}

function getStatusConfig(status: PositionStatus) {
  switch (status) {
    case 'critical':
      return {
        icon: IconWarning,
        color: 'text-red-600',
        bg: 'bg-red-50',
        label: 'Critical',
        description: 'Need immediate attention',
      };
    case 'behind':
      return {
        icon: IconWarning,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        label: 'Behind',
        description: 'Needs more prospects',
      };
    case 'on_track':
      return {
        icon: IconCheck,
        color: 'text-primary-600',
        bg: 'bg-primary-50',
        label: 'On Track',
        description: 'Good pipeline coverage',
      };
    case 'ahead':
      return {
        icon: IconCheck,
        // "Ahead" is a positive position → primary green (the daily-home
        // restricted accent set), not a separate blue categorical hue.
        color: 'text-primary-700',
        bg: 'bg-primary-50',
        label: 'Ahead',
        description: 'Strong position',
      };
  }
}

function calculateStatus(need: number, pipeline: number, committed: number): PositionStatus {
  if (need === 0) return 'on_track';

  const remaining = need - committed;

  // Already filled
  if (remaining <= 0) return 'ahead';

  // Not enough pipeline to fill remaining needs (need 2x pipeline for comfort)
  if (pipeline < remaining) return 'critical';
  if (pipeline < remaining * 2) return 'behind';
  if (pipeline >= remaining * 3) return 'ahead';

  return 'on_track';
}

export function PositionNeedsMatrix({
  watchlist,
  gradYear = new Date().getFullYear() + 2, // Default to class 2 years out
  loading,
  onSetGoals,
}: PositionNeedsMatrixProps) {
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [positionGoals, setPositionGoals] = useState<PositionGoal[]>(DEFAULT_POSITION_GOALS);

  // Load goals from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`position_goals_${gradYear}`);
      if (stored) {
        setPositionGoals(JSON.parse(stored) as PositionGoal[]);
      } else {
        setPositionGoals(DEFAULT_POSITION_GOALS);
      }
    } catch {
      // Ignore errors
    }
  }, [gradYear]);

  // Calculate position data from watchlist
  const positionData = useMemo(() => {
    const data: PositionData[] = [];

    for (const goal of positionGoals) {
      const position = goal.position;

      // Count players in pipeline for this position
      const playersInPosition = watchlist.filter(w => {
        if (!w.player) return false;
        // Match primary or secondary position
        return (
          w.player.primary_position === position ||
          w.player.secondary_position === position
        );
      });

      // Filter by grad year if players have it
      const relevantPlayers = playersInPosition.filter(w => {
        if (!w.player?.grad_year) return true;
        return w.player.grad_year === gradYear;
      });

      const pipeline = relevantPlayers.filter(w =>
        w.pipeline_stage !== 'committed' && w.pipeline_stage !== 'uninterested'
      ).length;

      const committed = relevantPlayers.filter(w =>
        w.pipeline_stage === 'committed'
      ).length;

      const status = calculateStatus(goal.need, pipeline, committed);

      data.push({
        position,
        need: goal.need,
        pipeline,
        committed,
        status,
      });
    }

    // Sort by status priority (critical first)
    const statusOrder: Record<PositionStatus, number> = {
      critical: 0,
      behind: 1,
      on_track: 2,
      ahead: 3,
    };

    return data.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [watchlist, positionGoals, gradYear]);

  // Summary stats
  const summary = useMemo(() => {
    const totalNeed = positionData.reduce((sum, p) => sum + p.need, 0);
    const totalCommitted = positionData.reduce((sum, p) => sum + p.committed, 0);
    const totalPipeline = positionData.reduce((sum, p) => sum + p.pipeline, 0);
    const criticalCount = positionData.filter(p => p.status === 'critical').length;
    const behindCount = positionData.filter(p => p.status === 'behind').length;

    return {
      totalNeed,
      totalCommitted,
      totalPipeline,
      criticalCount,
      behindCount,
      percentFilled: totalNeed > 0 ? Math.round((totalCommitted / totalNeed) * 100) : 0,
    };
  }, [positionData]);

  const displayData = showAllPositions ? positionData : positionData.slice(0, 6);

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-6 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={36} height={36} className="rounded-lg" />
            <div>
              <Skeleton variant="text" width={140} height={18} className="mb-1" />
              <Skeleton variant="text" width={90} height={12} />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} variant="rectangular" className="w-full h-10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
            <IconTarget size={18} className="text-primary-600" />
          </div>
          <div>
            <h2 className="font-semibold text-warm-900 tracking-tight">Position Needs</h2>
            <p className="text-xs text-warm-500">Class of {gradYear}</p>
          </div>
        </div>
        {onSetGoals && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetGoals}
            className="text-xs text-warm-500 hover:text-warm-700 gap-1"
          >
            <IconSettings size={14} /> Set Goals
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="px-6 py-3 bg-warm-50/50 border-b border-warm-100/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-warm-600">
              <span className="font-semibold text-warm-900">{summary.totalCommitted}</span>
              <span className="text-warm-400"> / </span>
              <span>{summary.totalNeed}</span>
              <span className="text-warm-400 ml-1">filled</span>
            </span>
            <span className="text-warm-300">|</span>
            <span className="text-warm-600">
              <span className="font-medium text-warm-700">{summary.totalPipeline}</span>
              <span className="text-warm-400 ml-1">in pipeline</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {summary.criticalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                {summary.criticalCount} critical
              </span>
            )}
            {summary.behindCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {summary.behindCount} behind
              </span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-2 bg-warm-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
            style={{ width: `${summary.percentFilled}%` }}
          />
        </div>
        <p className="text-xs text-warm-400 mt-1">{summary.percentFilled}% of class filled</p>
      </div>

      {/* Position table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-warm-100/50 bg-warm-50/30">
              <th className="px-6 py-2.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider">
                Position
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-warm-500 uppercase tracking-wider">
                Need
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-warm-500 uppercase tracking-wider">
                Pipeline
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-warm-500 uppercase tracking-wider">
                Committed
              </th>
              <th className="px-6 py-2.5 text-right text-xs font-semibold text-warm-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100/50">
            {displayData.map((pos, index) => {
              const config = getStatusConfig(pos.status);
              const StatusIcon = config.icon;

              return (
                <tr
                  key={pos.position}
                  className="hover:bg-warm-50/50 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/baseball/dashboard/discover?position=${pos.position}&grad_year=${gradYear}`}
                      className="text-sm font-medium text-warm-900 hover:text-primary-600 transition-colors"
                    >
                      {pos.position}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-warm-600 tabular-nums">{pos.need}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "text-sm font-medium tabular-nums",
                      pos.pipeline === 0 ? "text-warm-400" : "text-warm-700"
                    )}>
                      {pos.pipeline}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      pos.committed > 0 ? "text-primary-600" : "text-warm-400"
                    )}>
                      {pos.committed}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                        config.bg,
                        config.color
                      )}>
                        <StatusIcon size={12} />
                        {config.label}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-warm-50/50 border-t border-warm-100/50 flex items-center justify-between">
        {positionData.length > 6 && (
          <Button variant="ghost"
            onClick={() => setShowAllPositions(!showAllPositions)}
            className="text-sm text-warm-600 hover:text-primary-600 transition-colors"
          >
            {showAllPositions ? 'Show less' : `Show all ${positionData.length} positions`}
          </Button>
        )}
        <Link
          href={`/baseball/dashboard/discover?grad_year=${gradYear}`}
          className="text-sm text-warm-600 hover:text-primary-600 transition-colors flex items-center gap-1 ml-auto"
        >
          Find players <IconChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}

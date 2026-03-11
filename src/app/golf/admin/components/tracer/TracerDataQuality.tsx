'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowUpDown,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { timeAgo } from '../admin-utils';
import { DataCompletenessGrid } from './DataCompletenessGrid';
import type {
  TracerStatsAccuracy,
  PlayerCompleteness,
  Outlier,
} from './tracer-types';

// ============================================================================
// PROPS
// ============================================================================

interface TracerDataQualityProps {
  statsAccuracy: TracerStatsAccuracy[];
  completeness: PlayerCompleteness[];
  outliers: Outlier[];
  onRefreshCache?: (playerId: string) => void;
}

// ============================================================================
// SORT KEY
// ============================================================================

type StatsSortKey = 'name' | 'rounds' | 'scoring' | 'putts' | 'fairway' | 'gir' | 'cache';

// ============================================================================
// MISMATCH THRESHOLDS
// ============================================================================

const SCORING_THRESHOLD = 0.5;
const PUTTS_THRESHOLD = 0.5;
const FAIRWAY_THRESHOLD = 1;
const GIR_THRESHOLD = 1;

// ============================================================================
// SORTABLE TABLE HEADER
// ============================================================================

function SortableTh<K extends string>({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align = 'center',
}: {
  label: string;
  sortKey: K;
  currentKey: K;
  asc: boolean;
  onSort: (key: K) => void;
  align?: 'left' | 'center';
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        'px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider cursor-pointer select-none group/th',
        'transition-colors hover:text-warm-700',
        active ? 'text-warm-700' : 'text-warm-400',
        align === 'center' && 'text-center'
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <span className="text-primary-600 font-bold text-[10px]">{asc ? '\u2191' : '\u2193'}</span>
        ) : (
          <ArrowUpDown size={12} className="text-warm-300 opacity-0 group-hover/th:opacity-100 transition-opacity" />
        )}
      </span>
    </th>
  );
}

// ============================================================================
// COMPARE CELL (cached / live)
// ============================================================================

function CompareCell({
  cached,
  live,
  mismatch,
}: {
  cached: string | number | null;
  live: string | number | null;
  mismatch?: boolean;
}) {
  const c = cached != null ? String(cached) : '\u2014';
  const l = live != null ? String(live) : '\u2014';

  if (live == null && cached == null) {
    return <span className="text-warm-300">{'\u2014'}</span>;
  }

  if (live == null) {
    return <span className="text-warm-600 tabular-nums">{c}</span>;
  }

  return (
    <span className="tabular-nums">
      <span className={cn('font-medium', mismatch ? 'text-red-600' : 'text-warm-700')}>
        {c}
      </span>
      <span className="text-warm-300 mx-0.5">/</span>
      <span className={cn(mismatch ? 'text-red-400' : 'text-warm-400')}>
        {l}
      </span>
    </span>
  );
}

// ============================================================================
// STATS ACCURACY ROW
// ============================================================================

function StatsAccuracyRow({
  stat,
  onRefreshCache,
}: {
  stat: TracerStatsAccuracy;
  onRefreshCache?: (playerId: string) => void;
}) {
  const roundsMismatch = stat.cached_rounds !== stat.live_rounds;
  const scoringMismatch =
    stat.cached_scoring_avg != null &&
    stat.live_scoring_avg != null &&
    Math.abs(stat.cached_scoring_avg - stat.live_scoring_avg) > SCORING_THRESHOLD;
  const puttsMismatch =
    stat.cached_putts_per_round != null &&
    stat.live_putts_per_round != null &&
    Math.abs(stat.cached_putts_per_round - stat.live_putts_per_round) > PUTTS_THRESHOLD;
  const fwMismatch =
    stat.cached_fairway_pct != null &&
    stat.live_fairway_pct != null &&
    Math.abs(stat.cached_fairway_pct - stat.live_fairway_pct) > FAIRWAY_THRESHOLD;
  const girMismatch =
    stat.cached_gir_pct != null &&
    stat.live_gir_pct != null &&
    Math.abs(stat.cached_gir_pct - stat.live_gir_pct) > GIR_THRESHOLD;

  const anyMismatch = roundsMismatch || scoringMismatch || puttsMismatch || fwMismatch || girMismatch;

  return (
    <tr
      className={cn(
        'border-b border-warm-50/80 transition-colors',
        anyMismatch ? 'bg-red-50/10 hover:bg-red-50/20' : 'hover:bg-white/50'
      )}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {anyMismatch && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />}
          <span className="font-medium text-warm-900">
            {stat.first_name} {stat.last_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_rounds} live={stat.live_rounds} mismatch={roundsMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_scoring_avg} live={stat.live_scoring_avg} mismatch={scoringMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_putts_per_round} live={stat.live_putts_per_round} mismatch={puttsMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell
          cached={stat.cached_fairway_pct != null ? `${stat.cached_fairway_pct}%` : null}
          live={stat.live_fairway_pct != null ? `${stat.live_fairway_pct}%` : null}
          mismatch={fwMismatch}
        />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell
          cached={stat.cached_gir_pct != null ? `${stat.cached_gir_pct}%` : null}
          live={stat.live_gir_pct != null ? `${stat.live_gir_pct}%` : null}
          mismatch={girMismatch}
        />
      </td>
      <td className="px-4 py-3.5 text-center">
        <div className="flex items-center justify-center gap-2">
          {stat.is_stale ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Stale
            </span>
          ) : (
            <span className="text-[11px] text-warm-400">{timeAgo(stat.cache_updated_at)}</span>
          )}
          {onRefreshCache && (
            <button
              type="button"
              onClick={() => onRefreshCache(stat.player_id)}
              title="Refresh cache"
              className="p-1 rounded-md text-warm-400 hover:text-warm-600 hover:bg-warm-100/50 transition-colors"
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// OUTLIER ROW
// ============================================================================

function OutlierRow({ outlier }: { outlier: Outlier }) {
  const ratio = outlier.threshold > 0 ? outlier.value / outlier.threshold : 1;
  const isExtreme = ratio >= 2;

  return (
    <tr
      className={cn(
        'border-b border-warm-50/80 transition-colors',
        isExtreme ? 'bg-red-50/15 hover:bg-red-50/25' : 'bg-amber-50/10 hover:bg-amber-50/20'
      )}
    >
      <td className="px-4 py-3 text-sm font-medium text-warm-900">{outlier.player_name}</td>
      <td className="px-4 py-3 text-sm text-warm-600">
        <div className="flex flex-col">
          <span className="text-warm-700 text-xs font-mono truncate max-w-[160px]">
            {outlier.round_id.slice(0, 8)}...
          </span>
          {outlier.course_name && (
            <span className="text-warm-400 text-xs truncate max-w-[160px]">{outlier.course_name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-warm-700">{outlier.field}</td>
      <td className="px-4 py-3 text-center">
        <span
          className={cn(
            'inline-flex px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums',
            isExtreme ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
          )}
        >
          {outlier.value}
        </span>
      </td>
      <td className="px-4 py-3 text-center text-xs text-warm-400 tabular-nums">{outlier.threshold}</td>
    </tr>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TracerDataQuality({
  statsAccuracy,
  completeness,
  outliers,
  onRefreshCache,
}: TracerDataQualityProps) {
  // Local sort state for stats accuracy table
  const [sortKey, setSortKey] = useState<StatsSortKey>('scoring');
  const [sortAsc, setSortAsc] = useState(true);

  function handleSort(key: StatsSortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name');
    }
  }

  // Sorted stats accuracy
  const sortedStats = useMemo(() => {
    return [...statsAccuracy].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return dir * ((a.last_name ?? '').localeCompare(b.last_name ?? ''));
        case 'rounds':
          return dir * (a.cached_rounds - b.cached_rounds);
        case 'scoring': {
          const diff = (v: TracerStatsAccuracy) =>
            v.cached_scoring_avg != null && v.live_scoring_avg != null
              ? Math.abs(v.cached_scoring_avg - v.live_scoring_avg)
              : 0;
          return dir * (diff(a) - diff(b));
        }
        case 'putts':
          return dir * ((a.cached_putts_per_round ?? 0) - (b.cached_putts_per_round ?? 0));
        case 'fairway':
          return dir * ((a.cached_fairway_pct ?? 0) - (b.cached_fairway_pct ?? 0));
        case 'gir':
          return dir * ((a.cached_gir_pct ?? 0) - (b.cached_gir_pct ?? 0));
        case 'cache':
          return dir * ((a.is_stale ? 1 : 0) - (b.is_stale ? 1 : 0));
        default:
          return 0;
      }
    });
  }, [statsAccuracy, sortKey, sortAsc]);

  return (
    <div className="space-y-8">
      {/* ================================================================ */}
      {/* Section 1: Stats Accuracy Table                                  */}
      {/* ================================================================ */}
      {statsAccuracy.length > 0 && (
        <section>
          <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
            {/* Header */}
            <div className="px-5 py-4 border-b border-warm-100/50">
              <h3 className="text-sm font-semibold text-warm-900">Stats Accuracy Check</h3>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100/80">
                    <SortableTh
                      label="Player"
                      sortKey="name"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                      align="left"
                    />
                    <SortableTh
                      label="Rounds"
                      sortKey="rounds"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Scoring Avg"
                      sortKey="scoring"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Putts/Rnd"
                      sortKey="putts"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Fairway %"
                      sortKey="fairway"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="GIR %"
                      sortKey="gir"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Cache"
                      sortKey="cache"
                      currentKey={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((stat) => (
                    <StatsAccuracyRow
                      key={stat.player_id}
                      stat={stat}
                      onRefreshCache={onRefreshCache}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-5 py-3 border-t border-warm-100/50 flex items-center gap-4 text-[11px] text-warm-400 flex-wrap">
              <span>
                Format:{' '}
                <span className="font-medium text-warm-500">cached</span>{' '}
                <span className="text-warm-300">/</span>{' '}
                <span className="text-warm-400">live</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                Mismatch (scoring/putts &gt; 0.5, FW/GIR &gt; 1%)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                Stale cache
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* Section 2: Data Completeness Heatmap                             */}
      {/* ================================================================ */}
      <section>
        <DataCompletenessGrid data={completeness} />
      </section>

      {/* ================================================================ */}
      {/* Section 3: Outlier Detection Panel                               */}
      {/* ================================================================ */}
      <section>
        <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
          {/* Header */}
          <div className="px-5 py-4 border-b border-warm-100/50">
            <h3 className="text-sm font-semibold text-warm-900">Outlier Detection</h3>
          </div>

          {outliers.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="text-green-500" size={20} />
              </div>
              <p className="text-sm font-medium text-warm-700">No outliers detected</p>
              <p className="text-xs text-warm-400 mt-1">All recorded values are within expected thresholds</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100/80">
                    <th className="px-4 py-3.5 text-left text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                      Round / Course
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                      Issue
                    </th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                      Threshold
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((outlier, i) => (
                    <OutlierRow
                      key={`${outlier.player_id}-${outlier.round_id}-${outlier.field}-${i}`}
                      outlier={outlier}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

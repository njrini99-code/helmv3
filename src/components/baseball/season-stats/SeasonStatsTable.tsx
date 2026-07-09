'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BaseballPlayerSeasonStats } from '@/lib/types';
import { IconTrendingUp, IconUser, IconDownload } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { PaperCard, EditorsLetter } from '@/components/baseball/living-annual';

interface SeasonStatsTableProps {
  stats: BaseballPlayerSeasonStats[];
  seasonYear: number;
  teamId: string;
  onYearChange?: (year: number) => void;
  availableYears?: number[];
}

type StatsTab = 'batting' | 'pitching';
type SortField = string;
type SortDir = 'asc' | 'desc';

function fmtAvg(val: number | null | undefined) {
  if (val == null) return '—';
  return val.toFixed(3).replace(/^0/, '');
}

function fmtRate(val: number | null | undefined, decimals = 2) {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function fmtIP(val: number | null | undefined) {
  if (val == null || val === 0) return '0.0';
  return val.toFixed(1);
}

const BATTING_COLUMNS: Array<{ key: keyof BaseballPlayerSeasonStats; label: string; format?: (v: number | null | undefined) => string; desc?: boolean }> = [
  { key: 'g', label: 'G' },
  { key: 'ab', label: 'AB' },
  { key: 'r', label: 'R' },
  { key: 'h', label: 'H' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'hr', label: 'HR' },
  { key: 'rbi', label: 'RBI' },
  { key: 'bb', label: 'BB' },
  { key: 'k', label: 'K' },
  { key: 'sb', label: 'SB' },
  { key: 'avg', label: 'AVG', format: fmtAvg, desc: true },
  { key: 'obp', label: 'OBP', format: fmtAvg, desc: true },
  { key: 'slg', label: 'SLG', format: fmtAvg, desc: true },
  { key: 'ops', label: 'OPS', format: fmtAvg, desc: true },
];

const PITCHING_COLUMNS: Array<{ key: keyof BaseballPlayerSeasonStats; label: string; format?: (v: number | null | undefined) => string; desc?: boolean }> = [
  { key: 'g_p', label: 'G' },
  { key: 'gs', label: 'GS' },
  { key: 'w', label: 'W' },
  { key: 'l', label: 'L' },
  { key: 'sv', label: 'SV' },
  { key: 'ip', label: 'IP', format: fmtIP },
  { key: 'h_allowed', label: 'H' },
  { key: 'er', label: 'ER' },
  { key: 'bb_allowed', label: 'BB' },
  { key: 'k_thrown', label: 'K' },
  { key: 'era', label: 'ERA', format: (v) => fmtRate(v, 2), desc: false }, // lower is better
  { key: 'whip', label: 'WHIP', format: (v) => fmtRate(v, 3), desc: false },
  { key: 'k9', label: 'K/9', format: (v) => fmtRate(v, 2), desc: true },
  { key: 'bb9', label: 'BB/9', format: (v) => fmtRate(v, 2), desc: false },
];

const SEASON_YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2];
})();

function exportToCSV(stats: BaseballPlayerSeasonStats[], tab: StatsTab) {
  const columns = tab === 'batting' ? BATTING_COLUMNS : PITCHING_COLUMNS;
  const headers = ['Player', 'Position', ...columns.map((c) => c.label)];

  const rows = stats.map((s) => {
    const name = s.player ? `${s.player.first_name ?? ''} ${s.player.last_name ?? ''}`.trim() : s.player_id;
    const pos = s.player?.primary_position ?? '';
    const vals = columns.map((c) => {
      const v = s[c.key];
      if (c.format && typeof v === 'number') return c.format(v as number);
      if (v == null) return '';
      return String(v);
    });
    return [name, pos, ...vals];
  });

  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `season_stats_${tab}_${new Date().getFullYear()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SeasonStatsTable({
  stats: initialStats,
  seasonYear,
  teamId: _teamId,
  onYearChange,
  availableYears = SEASON_YEARS,
}: SeasonStatsTableProps) {
  const [activeTab, setActiveTab] = useState<StatsTab>('batting');
  const [sortField, setSortField] = useState<SortField>('avg');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const columns = activeTab === 'batting' ? BATTING_COLUMNS : PITCHING_COLUMNS;

  // Filter to players with relevant stats
  const stats = initialStats.filter((s) =>
    activeTab === 'batting' ? s.ab > 0 : s.ip > 0
  );

  function handleSort(key: string, defaultDesc = true) {
    if (sortField === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(key);
      setSortDir(defaultDesc ? 'desc' : 'asc');
    }
  }

  const sorted = [...stats].sort((a, b) => {
    const valA = a[sortField as keyof BaseballPlayerSeasonStats] as number | null ?? -Infinity;
    const valB = b[sortField as keyof BaseballPlayerSeasonStats] as number | null ?? -Infinity;
    const diff = (valA ?? 0) - (valB ?? 0);
    return sortDir === 'desc' ? -diff : diff;
  });

  const hasPitchers = initialStats.some((s) => s.ip > 0);

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
          <Button variant="ghost"
            onClick={() => { setActiveTab('batting'); setSortField('avg'); setSortDir('desc'); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'batting' ? 'bg-cream-50 text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            <IconUser size={14} />
            Batting
          </Button>
          {hasPitchers && (
            <Button variant="ghost"
              onClick={() => { setActiveTab('pitching'); setSortField('era'); setSortDir('asc'); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'pitching' ? 'bg-cream-50 text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'
              }`}
            >
              <IconTrendingUp size={14} />
              Pitching
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <NativeSelect
            value={String(seasonYear)}
            onChange={(e) => onYearChange?.(Number(e.target.value))}
            className="min-h-0 text-sm border-warm-200 rounded-lg px-3 py-1.5 bg-cream-100/75 text-warm-700 focus:ring-2 focus:ring-primary-500"
            options={availableYears.map((y) => ({ value: String(y), label: String(y) }))}
          />

          <Button variant="ghost"
            onClick={() => exportToCSV(stats, activeTab)}
            className="flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-700 border border-warm-200 rounded-lg px-3 py-1.5 bg-cream-100/75 transition-colors"
          >
            <IconDownload size={14} />
            Export
          </Button>
        </div>
      </div>

      {/* Stats table */}
      {sorted.length === 0 ? (
        <EditorsLetter
          title={`No ${activeTab} stats for ${seasonYear}`}
          body="Enter game box scores to populate stats."
        />
      ) : (
        <PaperCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/80">
                  <th scope="col" className="text-left px-4 py-3 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[140px]">
                    Player
                  </th>
                  {columns.map((col) => {
                    const isActive = sortField === (col.key as string);
                    return (
                      <th
                        key={col.key as string}
                        scope="col"
                        aria-sort={isActive ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                        className="relative text-center px-0 py-0 font-semibold min-w-[44px]"
                      >
                        {/* Header-sized sort control — the Button primitive's fixed min-height
                            would not fit a dense table heading row (matches SortHeader in
                            PlayerProfileClient.tsx). A real <button> so the sort is keyboard-
                            operable (Tab + Enter/Space) with a visible focus ring, unlike the
                            old onClick-on-<th>. */}
                        {/* eslint-disable-next-line helm/no-raw-button */}
                        <button
                          type="button"
                          onClick={() => handleSort(col.key as string, col.desc !== false)}
                          className={`flex w-full cursor-pointer select-none items-center justify-center gap-0.5 rounded-md px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus focus-visible:ring-offset-1 ${
                            isActive ? 'text-grade-plus' : 'text-warm-500 hover:text-warm-700'
                          }`}
                        >
                          {col.label}
                          {isActive && (
                            <span aria-hidden className="text-eyebrow">{sortDir === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </button>
                        {/* RuledStatLine's signature baseline — a green rule marks the active
                            sort column (spec §4.2 rule 4: active/selected states are green),
                            replacing the old soft primary-tint fill. */}
                        {isActive && (
                          <span aria-hidden className="absolute inset-x-2 bottom-0 h-[1.5px] bg-grade-plus" />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {sorted.map((s, i) => {
                  const playerName = s.player
                    ? `${s.player.first_name ?? ''} ${s.player.last_name ?? ''}`.trim()
                    : 'Unknown';
                  const pos = s.player?.primary_position ?? '';
                  return (
                    <tr key={s.id} className="hover:bg-warm-50/60 transition-colors">
                      <td className="px-4 py-2.5 sticky left-0 bg-cream-50/92">
                        <Link
                          href={`/baseball/dashboard/players/${s.player_id}/stats`}
                          className="flex items-center gap-2 group"
                        >
                          <div className="w-6 h-6 rounded-full bg-warm-100 flex items-center justify-center text-eyebrow font-annual font-bold tabular-nums text-warm-500 shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <span className="font-medium text-warm-800 group-hover:text-primary-600 transition-colors">
                              {playerName}
                            </span>
                            {pos && (
                              <span className="ml-1.5 text-eyebrow text-warm-400">{pos}</span>
                            )}
                          </div>
                        </Link>
                      </td>
                      {columns.map((col) => {
                        const rawVal = s[col.key];
                        const numVal = rawVal as number | null | undefined;
                        const display = col.format
                          ? col.format(numVal)
                          : numVal != null
                            ? String(numVal)
                            : '—';
                        const isActive = sortField === (col.key as string);
                        // Highlight notable stats — StatReadout's leader treatment: the
                        // number itself carries the green, not a background fill (spec
                        // §4.2 rule 3: "leaders/bests get green").
                        const isHighlight =
                          (col.key === 'avg' && (rawVal as number) >= 0.3) ||
                          (col.key === 'ops' && (rawVal as number) >= 0.9) ||
                          (col.key === 'era' && (rawVal as number) <= 3.0 && (rawVal as number) > 0) ||
                          (col.key === 'hr' && (rawVal as number) >= 5);

                        return (
                          <td
                            key={col.key as string}
                            className={`px-2 py-2.5 text-center font-annual tabular-nums ${isActive ? 'font-semibold' : ''} ${
                              isHighlight ? 'text-grade-plus font-semibold' : 'text-warm-700'
                            }`}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PaperCard>
      )}
    </div>
  );
}

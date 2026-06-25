'use client';

// =============================================================================
// src/components/lifting/soreness/TeamSorenessHeatmap.tsx
//
// Team-level body heatmap showing soreness count, average severity, or
// high-only (≥7) per body region. Uses the body silhouettes as a base with
// color intensity driven by data. Toggle: Count | Avg Severity | High Only.
// =============================================================================

import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { SORENESS_REGIONS } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconUsers } from '@/components/icons';
import type { AthleteRequestSummary } from '@/app/lifting/actions/soreness';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  summaries: AthleteRequestSummary[];
  /** Label for which day these summaries are from */
  dateLabel?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HeatMode = 'count' | 'avg' | 'high';

interface RegionStats {
  count: number;
  totalSeverity: number;
  highCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heatColor(value: number, max: number, mode: HeatMode): string {
  if (max === 0 || value === 0) return '#f5f0e8'; // cream — no data
  const pct = Math.min(value / max, 1);

  if (mode === 'count' || mode === 'high') {
    // Green → amber → red gradient
    if (pct < 0.2) return 'rgba(22,163,74,0.25)';
    if (pct < 0.4) return 'rgba(234,179,8,0.40)';
    if (pct < 0.6) return 'rgba(245,158,11,0.55)';
    if (pct < 0.8) return 'rgba(234,88,12,0.65)';
    return 'rgba(185,28,28,0.75)';
  }

  // avg severity uses same scale
  if (pct < 0.2) return 'rgba(34,197,94,0.30)';
  if (pct < 0.4) return 'rgba(234,179,8,0.45)';
  if (pct < 0.6) return 'rgba(245,158,11,0.58)';
  if (pct < 0.8) return 'rgba(234,88,12,0.68)';
  return 'rgba(185,28,28,0.80)';
}

// ---------------------------------------------------------------------------
// Legend row
// ---------------------------------------------------------------------------

function Legend({ max, unit }: { max: number; unit: string }) {
  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2 text-[11px] text-warm-500">
      <span>Low</span>
      <div className="flex flex-1 h-2 rounded-full overflow-hidden">
        {stops.map((s, i) => (
          <div key={i} className="flex-1" style={{ background: heatColor(s * max, max, 'count') }} />
        ))}
      </div>
      <span>High ({max} {unit})</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Region pill list (alternate view for small screens)
// ---------------------------------------------------------------------------

function RegionPillList({
  stats,
  mode,
}: {
  stats: Map<SorenessRegionId, RegionStats>;
  mode: HeatMode;
}) {
  const sorted = ([...stats.entries()] as Array<[SorenessRegionId, RegionStats]>)
    .map(([id, s]) => {
      const val =
        mode === 'count' ? s.count :
        mode === 'avg' ? (s.count > 0 ? s.totalSeverity / s.count : 0) :
        s.highCount;
      return { id, val, label: SORENESS_REGIONS[id].label };
    })
    .filter((r) => r.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 12);

  if (sorted.length === 0) return null;

  const maxVal = sorted[0]?.val ?? 1;

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(({ id, val, label }) => {
        const color = heatColor(val, maxVal, mode);
        const display = mode === 'avg' ? val.toFixed(1) : String(Math.round(val));
        return (
          <span
            key={id}
            className="rounded-full px-3 py-1 text-xs font-medium text-warm-800 border border-warm-200"
            style={{ background: color }}
          >
            {label} · {display}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamSorenessHeatmap({ summaries, dateLabel }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [mode, setMode] = useState<HeatMode>('count');

  // Build region stats from all summaries
  const stats = useMemo(() => {
    const map = new Map<SorenessRegionId, RegionStats>();

    for (const summary of summaries) {
      for (const region of summary.regions) {
        const id = region.body_region as SorenessRegionId;
        if (!(id in SORENESS_REGIONS)) continue;
        const existing = map.get(id) ?? { count: 0, totalSeverity: 0, highCount: 0 };
        existing.count += 1;
        existing.totalSeverity += region.severity;
        if (region.severity >= 7) existing.highCount += 1;
        map.set(id, existing);
      }
    }

    return map;
  }, [summaries]);

  const hasData = stats.size > 0;
  const athleteCount = summaries.filter((s) => s.regions.length > 0).length;

  const modeMax = useMemo(() => {
    let max = 0;
    for (const [, s] of stats) {
      const val =
        mode === 'count' ? s.count :
        mode === 'avg' ? (s.count > 0 ? s.totalSeverity / s.count : 0) :
        s.highCount;
      if (val > max) max = val;
    }
    return max;
  }, [stats, mode]);

  const modeUnit = mode === 'count' ? 'athletes' : mode === 'avg' ? 'avg' : 'high';

  return (
    <motion.div
      className="space-y-4"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconUsers size={16} className="text-warm-500" />
          <h3 className="text-sm font-semibold text-warm-900">Team Soreness Heatmap</h3>
        </div>
        {dateLabel && <span className="text-xs text-warm-400">{dateLabel}</span>}
      </div>

      {/* Mode toggle */}
      <div className="inline-flex items-center rounded-xl bg-warm-100 p-1">
        {([
          ['count', 'Count'],
          ['avg', 'Avg Severity'],
          ['high', 'High Only'],
        ] as Array<[HeatMode, string]>).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              mode === m ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card variant="flat">
        <CardContent className="p-5 space-y-4">
          {!hasData ? (
            <EmptyState
              icon={<IconUsers size={28} className="text-warm-300" />}
              title="No soreness reported yet"
              description="Athletes who report soreness will appear here."
              className="py-6"
            />
          ) : (
            <>
              <p className="text-xs text-warm-500">
                {athleteCount} athlete{athleteCount !== 1 ? 's' : ''} reported soreness
              </p>

              {/* Region pill heatmap */}
              <RegionPillList stats={stats} mode={mode} />

              {/* Legend */}
              {modeMax > 0 && (
                <Legend max={Math.ceil(modeMax)} unit={modeUnit} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

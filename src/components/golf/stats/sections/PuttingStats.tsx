'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';
import { PuttHeatmap } from '@/components/golf/coachhelm/v3/PuttHeatmap';
import type { PuttRecord } from '@/components/golf/coachhelm/v3/PuttHeatmap/types';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { feetToDisplay, feetLabel, feetRangeLabel } from '@/lib/golf/distance-units';

interface PuttingStatsProps {
  stats: GolfStats;
  /** When provided, the heatmap section fetches raw putts for this
   *  player and renders above the stat grid. */
  playerId?: string | null;
  /** When set to a specific round, the heatmap scopes to that round
   *  only (matches the round-filter dropdown above the tabs). */
  selectedRoundId?: string | 'overall';
}

/**
 * PostgREST hard-caps every response at 1000 rows — a single large `.limit()`
 * silently truncates past that. This is a client component (browser supabase
 * client), so it can't import the server-side fetch-all-rows util; paginate
 * inline with a stable `.order('id')` + `.range()`, stopping on a short page.
 */
const PAGE_SIZE = 1000;
/** Overall safety ceiling across pages — far above any single player's data. */
const MAX_FETCH_ROWS = 20000;

async function fetchAllPages<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[] | null> {
  const all: T[] = [];
  for (let from = 0; from < MAX_FETCH_ROWS; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    // Match the unpaginated contract: a first-page error reads as "no data".
    if (error) return from === 0 ? null : all;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function PuttingStats({ stats, playerId, selectedRoundId = 'overall' }: PuttingStatsProps) {
  const prefersReducedMotion = useReducedMotion();
  const { distancePref } = useDistanceUnits();
  const [selectedBreak, setSelectedBreak] = useState<'left_to_right' | 'right_to_left' | 'straight' | 'multiple' | null>(null);
  const supabase = useMemo(() => (playerId ? createClient() : null), [playerId]);
  const [putts, setPutts] = useState<PuttRecord[] | null>(null);

  useEffect(() => {
    if (!playerId || !supabase) {
      setPutts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // golf_shots is joined to golf_rounds via round_id (no player_id
      // column on the shot row), so we resolve round IDs first.
      let roundIds: string[] = [];
      if (selectedRoundId && selectedRoundId !== 'overall') {
        roundIds = [selectedRoundId];
      } else {
        // These ids scope the putt fetch below (not a display-bounded list),
        // so truncating them would silently drop older rounds from the
        // "overall" heatmap — paginate past the 1000-row cap instead.
        const rounds = await fetchAllPages((from, to) =>
          supabase
            .from('golf_rounds')
            .select('id')
            .eq('player_id', playerId)
            .eq('status', 'completed')
            .order('id', { ascending: true })
            .range(from, to),
        );
        roundIds = (rounds ?? []).map((r) => r.id);
      }
      if (cancelled) return;
      if (roundIds.length === 0) {
        setPutts([]);
        return;
      }
      const data = await fetchAllPages((from, to) =>
        supabase
          .from('golf_shots')
          .select('round_id, hole_number, putt_distance_feet, putt_made, miss_direction')
          .in('round_id', roundIds)
          .not('putt_distance_feet', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (cancelled) return;
      if (!data) {
        setPutts([]);
        return;
      }
      const records: PuttRecord[] = data
        .filter((r) => typeof r.putt_distance_feet === 'number' && r.putt_made !== null)
        .map((r) => ({
          distance_feet: r.putt_distance_feet as number,
          made: !!r.putt_made,
          miss_direction: r.miss_direction,
          hole_number: r.hole_number ?? null,
          round_id: r.round_id ?? null,
        }));
      setPutts(records);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, selectedRoundId, supabase]);

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Premium heatmap — only when we have a playerId AND some putts. */}
      {playerId && putts !== null && putts.length > 0 && (
        <PuttHeatmap
          putts={putts}
          title={
            selectedRoundId !== 'overall'
              ? 'Putting heatmap · this round'
              : 'Putting heatmap'
          }
        />
      )}
      {/* Key Metrics */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
        <StatCard
          label="Putts / Round"
          value={formatStat(stats.puttsPerRound, '', 1)}
          numericValue={stats.puttsPerRound}
          decimals={1}
          highlight
          large
          index={0}
        />
        <StatCard
          label="Putts / GIR"
          value={formatStat(stats.puttsPerGir, '', 2)}
          numericValue={stats.puttsPerGir}
          decimals={2}
          index={1}
        />
        <StatCard
          label="3-Putts / Round"
          value={formatStat(stats.threePuttsPerRound, '', 2)}
          numericValue={stats.threePuttsPerRound}
          decimals={2}
          index={2}
        />
        <StatCard
          label="1-Putts Total"
          value={formatStatInt(stats.onePuttsTotal)}
          numericValue={stats.onePuttsTotal}
          decimals={0}
          index={3}
        />
      </motion.div>

      {/* Make % by Distance */}
      <StatSection title="Make % by Distance" delay={0.1}>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
          {[
            // W5B: dropped the red→green make-% bg ramp (synthesis §5 — no
            // gradient-coded grids); every distance cell now uses the neutral
            // cream-elevated surface so the number, not the hue, carries the read.
            { range: feetRangeLabel([0, 3], distancePref), value: stats.puttMakePct0_3, bg: 'bg-cream-100', color: 'text-warm-900' },
            { range: feetRangeLabel([3, 5], distancePref), value: stats.puttMakePct3_5, bg: 'bg-cream-100', color: 'text-warm-900' },
            { range: feetRangeLabel([5, 10], distancePref), value: stats.puttMakePct5_10, bg: 'bg-cream-100', color: 'text-warm-900' },
            { range: feetRangeLabel([10, 15], distancePref), value: stats.puttMakePct10_15, bg: 'bg-cream-100', color: 'text-warm-900' },
            { range: feetRangeLabel([15, 20], distancePref), value: stats.puttMakePct15_20, bg: 'bg-cream-100', color: 'text-warm-900' },
          ].map((item, idx) => (
            <motion.div
              key={item.range}
              className={`text-center p-2 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.15 + idx * 0.04, duration: DURATION.short, ease: EASE_CINEMATIC })}
            >
              <div className={`text-body-lg font-medium tracking-[-0.005em] ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
              <div className="text-xs text-warm-500">{item.range}</div>
            </motion.div>
          ))}
        </div>
        <StatRow label={feetRangeLabel([20, 25], distancePref)} value={formatStat(stats.puttMakePct20_25, '%')} index={0} />
        <StatRow label={feetRangeLabel([25, 30], distancePref)} value={formatStat(stats.puttMakePct25_30, '%')} index={1} />
        <StatRow label={feetRangeLabel([30, 35], distancePref)} value={formatStat(stats.puttMakePct30_35, '%')} index={2} />
        <StatRow label={feetRangeLabel([35, null], distancePref)} value={formatStat(stats.puttMakePct35Plus, '%')} index={3} />
      </StatSection>

      {/* Putting Proximity */}
      <StatSection title={`First Putt Leave (avg ${feetLabel(distancePref)} remaining)`}>
        <StatRow label={`From ${feetRangeLabel([0, 5], distancePref)}`} value={stats.puttProximity0_5 ? `${feetToDisplay(stats.puttProximity0_5, distancePref, false).toFixed(1)}${feetLabel(distancePref)}` : '-'} />
        <StatRow label={`From ${feetRangeLabel([5, 10], distancePref)}`} value={stats.puttProximity5_10 ? `${feetToDisplay(stats.puttProximity5_10, distancePref, false).toFixed(1)}${feetLabel(distancePref)}` : '-'} />
        <StatRow label={`From ${feetRangeLabel([10, 15], distancePref)}`} value={stats.puttProximity10_15 ? `${feetToDisplay(stats.puttProximity10_15, distancePref, false).toFixed(1)}${feetLabel(distancePref)}` : '-'} />
        <StatRow label={`From ${feetRangeLabel([15, 20], distancePref)}`} value={stats.puttProximity15_20 ? `${feetToDisplay(stats.puttProximity15_20, distancePref, false).toFixed(1)}${feetLabel(distancePref)}` : '-'} />
        <StatRow label={`From ${feetRangeLabel([20, null], distancePref)}`} value={stats.puttProximity20Plus ? `${feetToDisplay(stats.puttProximity20Plus, distancePref, false).toFixed(1)}${feetLabel(distancePref)}` : '-'} />
      </StatSection>

      {/* Putting Efficiency */}
      <StatSection title="Putting Efficiency (avg putts to hole out)">
        <StatRow label={feetRangeLabel([0, 5], distancePref)} value={formatStat(stats.puttEff0_5, '', 2)} />
        <StatRow label={feetRangeLabel([5, 10], distancePref)} value={formatStat(stats.puttEff5_10, '', 2)} />
        <StatRow label={feetRangeLabel([10, 15], distancePref)} value={formatStat(stats.puttEff10_15, '', 2)} />
        <StatRow label={feetRangeLabel([15, 20], distancePref)} value={formatStat(stats.puttEff15_20, '', 2)} />
        <StatRow label={feetRangeLabel([20, 25], distancePref)} value={formatStat(stats.puttEff20_25, '', 2)} />
        <StatRow label={feetRangeLabel([25, 30], distancePref)} value={formatStat(stats.puttEff25_30, '', 2)} />
        <StatRow label={feetRangeLabel([30, 35], distancePref)} value={formatStat(stats.puttEff30_35, '', 2)} />
        <StatRow label={feetRangeLabel([35, null], distancePref)} value={formatStat(stats.puttEff35Plus, '', 2)} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Putt Miss Direction" delay={0.3}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-4">
          {[
            { label: 'Short', value: stats.puttMissShortPct, bg: 'bg-warm-50', color: 'text-warm-700' },
            { label: 'Long', value: stats.puttMissLongPct, bg: 'bg-warm-50', color: 'text-warm-700' },
            { label: 'Left', value: stats.puttMissLeftPct, bg: 'bg-warm-50', color: 'text-warm-700' },
            { label: 'Right', value: stats.puttMissRightPct, bg: 'bg-warm-50', color: 'text-warm-700' },
            { label: 'Low (amateur)', value: stats.puttMissLowPct, bg: 'bg-blue-50', color: 'text-blue-700' },
            { label: 'High (pro)', value: stats.puttMissHighPct, bg: 'bg-purple-50', color: 'text-purple-700' },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              className={`text-center p-2 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.35 + idx * 0.04, duration: DURATION.short, ease: EASE_CINEMATIC })}
            >
              <div className={`text-h3 font-medium tracking-[-0.012em] ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
              <div className="text-xs text-warm-500">{item.label}</div>
            </motion.div>
          ))}
        </div>
      </StatSection>

      {/* Putting by Break Type */}
      <StatSection title="Putting by Break Type">
        {/* Break Type Toggle */}
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { key: 'left_to_right', label: 'L → R' },
            { key: 'right_to_left', label: 'R → L' },
            { key: 'straight', label: 'Straight' },
            { key: 'multiple', label: 'Multiple' },
          ] as const).map(({ key, label }) => (
            <Button variant="primary"
              key={key}
              onClick={() => setSelectedBreak(selectedBreak === key ? null : key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedBreak === key
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              {label}
            </Button>
          ))}
        </div>

        {selectedBreak ? (
          <div className="space-y-4">
            {/* Make % by Distance for Selected Break */}
            <div className="bg-warm-50 rounded-lg p-4">
              <div className="text-sm font-medium text-warm-700 mb-3">
                Make % by Distance - {selectedBreak === 'left_to_right' ? 'Left to Right' :
                                      selectedBreak === 'right_to_left' ? 'Right to Left' :
                                      selectedBreak === 'straight' ? 'Straight' : 'Multiple Breaks'}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-primary-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct0_3, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{feetRangeLabel([0, 3], distancePref)}</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-primary-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct3_5, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{feetRangeLabel([3, 5], distancePref)}</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-yellow-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct5_10, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{feetRangeLabel([5, 10], distancePref)}</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-orange-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct10_15, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{feetRangeLabel([10, 15], distancePref)}</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-red-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct15_20, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{feetRangeLabel([15, 20], distancePref)}</div>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <StatRow label={feetRangeLabel([20, 25], distancePref)} value={formatStat(stats.puttingByBreak[selectedBreak].makePct20_25, '%')} />
                <StatRow label={feetRangeLabel([25, 30], distancePref)} value={formatStat(stats.puttingByBreak[selectedBreak].makePct25_30, '%')} />
                <StatRow label={feetRangeLabel([30, 35], distancePref)} value={formatStat(stats.puttingByBreak[selectedBreak].makePct30_35, '%')} />
                <StatRow label={feetRangeLabel([35, null], distancePref)} value={formatStat(stats.puttingByBreak[selectedBreak].makePct35Plus, '%')} />
                <StatRow label="Overall Make %" value={formatStat(stats.puttingByBreak[selectedBreak].overallMakePct, '%')} />
              </div>
            </div>

            {/* Miss Direction for Selected Break */}
            <div className="bg-warm-50 rounded-lg p-4">
              <div className="text-sm font-medium text-warm-700 mb-3">Miss Direction</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-warm-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missShortPct, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">Short</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-blue-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missLowPct, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">Low</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-purple-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missHighPct, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">High</div>
                </div>
              </div>
            </div>

            <div className="text-xs text-warm-500 italic">
              Total putts with this break: {stats.puttingByBreak[selectedBreak].totalPutts}
            </div>
          </div>
        ) : (
          <div className="text-sm text-warm-500 text-center py-4">
            Select a break type above to view detailed statistics
          </div>
        )}
      </StatSection>

      {/* Totals */}
      <StatSection title="Totals" delay={0.4}>
        <StatRow label="Total Putts" value={formatStatInt(stats.totalPutts)} index={0} />
        <StatRow label="Total 3-Putts" value={formatStatInt(stats.threePuttsTotal)} index={1} />
        <StatRow label="Putts per Hole" value={formatStat(stats.puttsPerHole, '', 2)} index={2} />
      </StatSection>
    </motion.div>
  );
}

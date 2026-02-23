'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

export function PuttingStats({ stats }: { stats: GolfStats }) {
  const [selectedBreak, setSelectedBreak] = useState<'left_to_right' | 'right_to_left' | 'straight' | 'multiple' | null>(null);

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
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
            { range: '0-3 ft', value: stats.puttMakePct0_3, bg: 'bg-primary-50', color: 'text-primary-600' },
            { range: '3-5 ft', value: stats.puttMakePct3_5, bg: 'bg-primary-50', color: 'text-primary-600' },
            { range: '5-10 ft', value: stats.puttMakePct5_10, bg: 'bg-yellow-50', color: 'text-yellow-600' },
            { range: '10-15 ft', value: stats.puttMakePct10_15, bg: 'bg-orange-50', color: 'text-orange-600' },
            { range: '15-20 ft', value: stats.puttMakePct15_20, bg: 'bg-red-50', color: 'text-red-600' },
          ].map((item, idx) => (
            <motion.div
              key={item.range}
              className={`text-center p-2 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + idx * 0.04, type: 'spring', stiffness: 300 }}
            >
              <div className={`text-lg font-bold ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
              <div className="text-xs text-warm-500">{item.range}</div>
            </motion.div>
          ))}
        </div>
        <StatRow label="20-25 feet" value={formatStat(stats.puttMakePct20_25, '%')} index={0} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttMakePct25_30, '%')} index={1} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttMakePct30_35, '%')} index={2} />
        <StatRow label="35+ feet" value={formatStat(stats.puttMakePct35Plus, '%')} index={3} />
      </StatSection>

      {/* Putting Proximity */}
      <StatSection title="First Putt Leave (avg feet remaining)">
        <StatRow label="From 0-5 feet" value={stats.puttProximity0_5 ? `${stats.puttProximity0_5.toFixed(1)}'` : '-'} />
        <StatRow label="From 5-10 feet" value={stats.puttProximity5_10 ? `${stats.puttProximity5_10.toFixed(1)}'` : '-'} />
        <StatRow label="From 10-15 feet" value={stats.puttProximity10_15 ? `${stats.puttProximity10_15.toFixed(1)}'` : '-'} />
        <StatRow label="From 15-20 feet" value={stats.puttProximity15_20 ? `${stats.puttProximity15_20.toFixed(1)}'` : '-'} />
        <StatRow label="From 20+ feet" value={stats.puttProximity20Plus ? `${stats.puttProximity20Plus.toFixed(1)}'` : '-'} />
      </StatSection>

      {/* Putting Efficiency */}
      <StatSection title="Putting Efficiency (avg putts to hole out)">
        <StatRow label="0-5 feet" value={formatStat(stats.puttEff0_5, '', 2)} />
        <StatRow label="5-10 feet" value={formatStat(stats.puttEff5_10, '', 2)} />
        <StatRow label="10-15 feet" value={formatStat(stats.puttEff10_15, '', 2)} />
        <StatRow label="15-20 feet" value={formatStat(stats.puttEff15_20, '', 2)} />
        <StatRow label="20-25 feet" value={formatStat(stats.puttEff20_25, '', 2)} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttEff25_30, '', 2)} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttEff30_35, '', 2)} />
        <StatRow label="35+ feet" value={formatStat(stats.puttEff35Plus, '', 2)} />
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
              transition={{ delay: 0.35 + idx * 0.04, type: 'spring', stiffness: 300 }}
            >
              <div className={`text-xl font-bold ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
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
            <button
              key={key}
              onClick={() => setSelectedBreak(selectedBreak === key ? null : key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedBreak === key
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedBreak ? (
          <div className="space-y-4">
            {/* Make % by Distance for Selected Break */}
            <div className="bg-warm-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-warm-700 mb-3">
                Make % by Distance - {selectedBreak === 'left_to_right' ? 'Left to Right' :
                                      selectedBreak === 'right_to_left' ? 'Right to Left' :
                                      selectedBreak === 'straight' ? 'Straight' : 'Multiple Breaks'}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-primary-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct0_3, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">0-3 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-primary-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct3_5, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">3-5 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-yellow-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct5_10, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">5-10 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-orange-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct10_15, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">10-15 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-red-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct15_20, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">15-20 ft</div>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <StatRow label="20-25 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct20_25, '%')} />
                <StatRow label="25-30 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct25_30, '%')} />
                <StatRow label="30-35 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct30_35, '%')} />
                <StatRow label="35+ feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct35Plus, '%')} />
                <StatRow label="Overall Make %" value={formatStat(stats.puttingByBreak[selectedBreak].overallMakePct, '%')} />
              </div>
            </div>

            {/* Miss Direction for Selected Break */}
            <div className="bg-warm-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-warm-700 mb-3">Miss Direction</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-warm-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missShortPct, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">Short</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-blue-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missLowPct, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">Low</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-purple-700">
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

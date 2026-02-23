'use client';

import { motion } from 'framer-motion';
import { IconTarget } from '@/components/icons';
import { containerVariants, StatCard, StatSection } from './shared-primitives';
import type { WorstHoleResponse, CourseBreakdownResponse, TrendAnalysisResponse } from './types';

export function AnalysisStats({
  worstHoleData,
  courseBreakdown,
  trendData,
}: {
  worstHoleData?: WorstHoleResponse | null;
  courseBreakdown?: CourseBreakdownResponse | null;
  trendData?: TrendAnalysisResponse | null;
}) {
  // Helper to format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate trend direction from period comparison
  const getTrend = (current: number | null, previous: number | null, lowerIsBetter = true): 'improving' | 'declining' | 'stable' => {
    if (current === null || previous === null) return 'stable';
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return 'stable';
    if (lowerIsBetter) {
      return diff < 0 ? 'improving' : 'declining';
    }
    return diff > 0 ? 'improving' : 'declining';
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Personal Bests */}
      {trendData?.personalBests && (
        <StatSection title="Personal Records" delay={0}>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
            {trendData.personalBests.bestScore && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-xs text-amber-600 font-medium mb-1">Best Score</div>
                <div className="text-2xl font-bold text-amber-700">{trendData.personalBests.bestScore.value}</div>
                <div className="text-xs text-warm-500 mt-1">
                  {formatDate(trendData.personalBests.bestScore.date)}
                </div>
                <div className="text-xs text-warm-400 truncate">
                  {trendData.personalBests.bestScore.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.bestToPar && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-primary-50 to-primary-50 border border-primary-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
              >
                <div className="text-xs text-primary-600 font-medium mb-1">Best vs Par</div>
                <div className="text-2xl font-bold text-primary-700">
                  {trendData.personalBests.bestToPar.value > 0 ? '+' : ''}{trendData.personalBests.bestToPar.value}
                </div>
                <div className="text-xs text-warm-500 mt-1">
                  {formatDate(trendData.personalBests.bestToPar.date)}
                </div>
                <div className="text-xs text-warm-400 truncate">
                  {trendData.personalBests.bestToPar.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.bestGir && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-xs text-blue-600 font-medium mb-1">Best GIR %</div>
                <div className="text-2xl font-bold text-blue-700">{trendData.personalBests.bestGir.value}%</div>
                <div className="text-xs text-warm-500 mt-1">
                  {formatDate(trendData.personalBests.bestGir.date)}
                </div>
                <div className="text-xs text-warm-400 truncate">
                  {trendData.personalBests.bestGir.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.lowestPutts && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
              >
                <div className="text-xs text-purple-600 font-medium mb-1">Fewest Putts</div>
                <div className="text-2xl font-bold text-purple-700">{trendData.personalBests.lowestPutts.value}</div>
                <div className="text-xs text-warm-500 mt-1">
                  {formatDate(trendData.personalBests.lowestPutts.date)}
                </div>
                <div className="text-xs text-warm-400 truncate">
                  {trendData.personalBests.lowestPutts.course}
                </div>
              </motion.div>
            )}
          </motion.div>
        </StatSection>
      )}

      {/* Period Comparison - Last 30 Days vs Previous */}
      {trendData?.periodComparison && trendData.periodComparison.last30Days.roundCount > 0 && (
        <StatSection title="Last 30 Days vs Previous 30 Days" delay={0.1}>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
            <StatCard
              label="Scoring Avg"
              value={trendData.periodComparison.last30Days.scoringAvg?.toFixed(1) || '--'}
              numericValue={trendData.periodComparison.last30Days.scoringAvg}
              decimals={1}
              trend={getTrend(
                trendData.periodComparison.last30Days.scoringAvg,
                trendData.periodComparison.previous30Days.scoringAvg,
                true
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.scoringAvg && trendData.periodComparison.previous30Days.scoringAvg
                  ? trendData.periodComparison.last30Days.scoringAvg - trendData.periodComparison.previous30Days.scoringAvg
                  : null
              }
              comparisonLabel="vs prev"
              index={0}
              sparklineData={trendData.trends.score.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={true}
            />
            <StatCard
              label="GIR %"
              value={trendData.periodComparison.last30Days.girPct !== null ? `${trendData.periodComparison.last30Days.girPct}%` : '--'}
              numericValue={trendData.periodComparison.last30Days.girPct}
              decimals={0}
              trend={getTrend(
                trendData.periodComparison.last30Days.girPct,
                trendData.periodComparison.previous30Days.girPct,
                false
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.girPct !== null && trendData.periodComparison.previous30Days.girPct !== null
                  ? trendData.periodComparison.last30Days.girPct - trendData.periodComparison.previous30Days.girPct
                  : null
              }
              comparisonLabel="vs prev"
              index={1}
              sparklineData={trendData.trends.gir.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={false}
            />
            <StatCard
              label="Fairway %"
              value={trendData.periodComparison.last30Days.fairwayPct !== null ? `${trendData.periodComparison.last30Days.fairwayPct}%` : '--'}
              numericValue={trendData.periodComparison.last30Days.fairwayPct}
              decimals={0}
              trend={getTrend(
                trendData.periodComparison.last30Days.fairwayPct,
                trendData.periodComparison.previous30Days.fairwayPct,
                false
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.fairwayPct !== null && trendData.periodComparison.previous30Days.fairwayPct !== null
                  ? trendData.periodComparison.last30Days.fairwayPct - trendData.periodComparison.previous30Days.fairwayPct
                  : null
              }
              comparisonLabel="vs prev"
              index={2}
              sparklineData={trendData.trends.fairway.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={false}
            />
            <StatCard
              label="Putts/Rd"
              value={trendData.periodComparison.last30Days.puttsPerRound?.toFixed(1) || '--'}
              numericValue={trendData.periodComparison.last30Days.puttsPerRound}
              decimals={1}
              trend={getTrend(
                trendData.periodComparison.last30Days.puttsPerRound,
                trendData.periodComparison.previous30Days.puttsPerRound,
                true
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.puttsPerRound && trendData.periodComparison.previous30Days.puttsPerRound
                  ? trendData.periodComparison.last30Days.puttsPerRound - trendData.periodComparison.previous30Days.puttsPerRound
                  : null
              }
              comparisonLabel="vs prev"
              index={3}
              sparklineData={trendData.trends.putts.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={true}
            />
          </motion.div>
          <motion.p
            className="text-xs text-warm-400 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {trendData.periodComparison.last30Days.roundCount} rounds in last 30 days
            {trendData.periodComparison.previous30Days.roundCount > 0 && (
              <> • {trendData.periodComparison.previous30Days.roundCount} in previous 30 days</>
            )}
          </motion.p>
        </StatSection>
      )}

      {/* Hole Performance Summary */}
      {worstHoleData && worstHoleData.holes.length > 0 && (
        <>
          {/* Par Type Performance */}
          <StatSection title="Performance by Par Type" delay={0}>
            <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
              <StatCard
                label="Par 3s"
                value={worstHoleData.par3Average !== null ? `${worstHoleData.par3Average > 0 ? '+' : ''}${worstHoleData.par3Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par3Average !== null && worstHoleData.par3Average < 0}
                index={0}
              />
              <StatCard
                label="Par 4s"
                value={worstHoleData.par4Average !== null ? `${worstHoleData.par4Average > 0 ? '+' : ''}${worstHoleData.par4Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par4Average !== null && worstHoleData.par4Average < 0}
                index={1}
              />
              <StatCard
                label="Par 5s"
                value={worstHoleData.par5Average !== null ? `${worstHoleData.par5Average > 0 ? '+' : ''}${worstHoleData.par5Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par5Average !== null && worstHoleData.par5Average < 0}
                index={2}
              />
              <StatCard
                label="Closing (16-18)"
                value={worstHoleData.closingHolesAverage !== null ? `${worstHoleData.closingHolesAverage > 0 ? '+' : ''}${worstHoleData.closingHolesAverage.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.closingHolesAverage !== null && worstHoleData.closingHolesAverage < 0}
                index={3}
              />
            </motion.div>
          </StatSection>

          {/* Worst & Best Holes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Worst Holes */}
            <StatSection title="Areas to Improve (Worst Holes)" delay={0.1}>
              {worstHoleData.worstHoles.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className="flex items-center justify-between py-2.5 border-b border-warm-100 last:border-0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-red-600">#{hole.holeNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-warm-800">Par {hole.par}</p>
                      <p className="text-xs text-warm-500">{hole.timesPlayed} rounds</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">
                      +{hole.averageToPar.toFixed(2)}
                    </p>
                    <p className="text-xs text-warm-400">avg {hole.averageScore.toFixed(1)}</p>
                  </div>
                </motion.div>
              ))}
            </StatSection>

            {/* Best Holes */}
            <StatSection title="Strengths (Best Holes)" delay={0.15}>
              {worstHoleData.bestHoles.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className="flex items-center justify-between py-2.5 border-b border-warm-100 last:border-0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-600">#{hole.holeNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-warm-800">Par {hole.par}</p>
                      <p className="text-xs text-warm-500">{hole.timesPlayed} rounds</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary-600">
                      {hole.averageToPar > 0 ? '+' : ''}{hole.averageToPar.toFixed(2)}
                    </p>
                    <p className="text-xs text-warm-400">avg {hole.averageScore.toFixed(1)}</p>
                  </div>
                </motion.div>
              ))}
            </StatSection>
          </div>

          {/* Full Hole-by-Hole Breakdown */}
          <StatSection title="All Holes Performance" delay={0.2} collapsible>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {worstHoleData.holes.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className={`p-3 rounded-lg text-center ${
                    hole.averageToPar <= -0.1 ? 'bg-primary-50 border border-primary-200' :
                    hole.averageToPar >= 0.3 ? 'bg-red-50 border border-red-200' :
                    'bg-warm-50 border border-warm-200'
                  }`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <div className="text-xs text-warm-500">Hole {hole.holeNumber}</div>
                  <div className={`text-sm font-bold ${
                    hole.averageToPar <= -0.1 ? 'text-primary-600' :
                    hole.averageToPar >= 0.3 ? 'text-red-600' :
                    'text-warm-700'
                  }`}>
                    {hole.averageToPar > 0 ? '+' : ''}{hole.averageToPar.toFixed(2)}
                  </div>
                  <div className="text-xs text-warm-400">Par {hole.par}</div>
                  {hole.trend !== 'stable' && (
                    <span className={`text-xs ${hole.trend === 'improving' ? 'text-primary-500' : 'text-red-500'}`}>
                      {hole.trend === 'improving' ? '↑' : '↓'}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </StatSection>
        </>
      )}

      {/* Course Breakdown */}
      {courseBreakdown && courseBreakdown.courses.length > 0 && (
        <StatSection title="Performance by Course" delay={0.25}>
          <div className="space-y-2">
            {courseBreakdown.courses.slice(0, 10).map((course, idx) => (
              <motion.div
                key={course.courseName}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-warm-50 active:bg-warm-100 transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    course.courseName === courseBreakdown.bestCourse ? 'bg-primary-100' :
                    course.courseName === courseBreakdown.worstCourse ? 'bg-red-100' :
                    'bg-warm-100'
                  }`}>
                    <span className={`text-xs font-bold ${
                      course.courseName === courseBreakdown.bestCourse ? 'text-primary-600' :
                      course.courseName === courseBreakdown.worstCourse ? 'text-red-600' :
                      'text-warm-500'
                    }`}>
                      {idx + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-warm-800">{course.courseName}</p>
                    <p className="text-xs text-warm-500">{course.roundCount} rounds</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-warm-400">Avg Score</p>
                    <p className="text-sm font-semibold text-warm-700">{course.scoringAverage?.toFixed(1) || '--'}</p>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-warm-400">Best</p>
                    <p className="text-sm font-semibold text-primary-600">{course.bestRound || '--'}</p>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-warm-400">GIR%</p>
                    <p className="text-sm font-semibold text-warm-700">{course.girPct !== null ? `${course.girPct}%` : '--'}</p>
                  </div>
                  <div className="text-center md:hidden">
                    <p className="text-sm font-bold text-warm-800">{course.scoringAverage?.toFixed(1) || '--'}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </StatSection>
      )}

      {/* Empty State */}
      {(!worstHoleData || worstHoleData.holes.length === 0) && (!courseBreakdown || courseBreakdown.courses.length === 0) && (
        <motion.div
          className="text-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
            <IconTarget size={28} className="text-warm-400" />
          </div>
          <h3 className="text-lg font-semibold text-warm-800 mb-2">Analysis Data Loading</h3>
          <p className="text-sm text-warm-500">Hole and course breakdown will appear here once data is loaded.</p>
        </motion.div>
      )}
    </motion.div>
  );
}

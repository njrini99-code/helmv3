'use client';

import { memo, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconGolf, IconCalendar } from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

export interface RoundData {
  id: string;
  date: string;
  score: number;
  toPar: number;
  courseName?: string;
  roundType?: 'practice' | 'qualifier' | 'tournament';
}

interface PerformanceHeatmapProps {
  rounds: RoundData[];
  year?: number;
  onRoundClick?: (round: RoundData) => void;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getScoreColor(toPar: number): string {
  if (toPar <= -5) return 'bg-emerald-600 text-white'; // Great round
  if (toPar <= -2) return 'bg-emerald-500 text-white';
  if (toPar < 0) return 'bg-green-400 text-white';
  if (toPar === 0) return 'bg-warm-300 text-warm-700'; // Even par
  if (toPar <= 3) return 'bg-amber-400 text-amber-900';
  if (toPar <= 6) return 'bg-orange-400 text-orange-900';
  return 'bg-red-500 text-white'; // Bad round
}

function getScoreOpacity(toPar: number): number {
  const abs = Math.abs(toPar);
  if (abs >= 6) return 1;
  if (abs >= 4) return 0.85;
  if (abs >= 2) return 0.7;
  return 0.55;
}

function getDayOfWeek(date: Date): number {
  return date.getDay(); // 0 = Sunday, 6 = Saturday
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PerformanceHeatmap = memo(function PerformanceHeatmap({
  rounds,
  year: initialYear,
  onRoundClick,
  className = '',
}: PerformanceHeatmapProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(initialYear ?? currentYear);
  const [hoveredRound, setHoveredRound] = useState<RoundData | null>(null);

  // Filter rounds for selected year and create lookup map
  const { roundsByDate, stats } = useMemo(() => {
    const filtered = rounds.filter((r) => {
      const roundDate = new Date(r.date);
      return roundDate.getFullYear() === year;
    });

    const map = new Map<string, RoundData[]>();
    filtered.forEach((r) => {
      const dateStr = r.date.split('T')[0];
      const key = dateStr ?? r.date; // Fallback to full date if split fails
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    // Calculate year stats
    const scores = filtered.map((r) => r.score);
    const toPars = filtered.map((r) => r.toPar);

    return {
      roundsByDate: map,
      stats: {
        totalRounds: filtered.length,
        avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        bestRound: scores.length > 0 ? Math.min(...scores) : null,
        avgToPar: toPars.length > 0 ? toPars.reduce((a, b) => a + b, 0) / toPars.length : null,
        underParRounds: toPars.filter((t) => t < 0).length,
        evenParRounds: toPars.filter((t) => t === 0).length,
        overParRounds: toPars.filter((t) => t > 0).length,
      },
    };
  }, [rounds, year]);

  // Generate calendar grid
  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);
    const weeks: Array<Array<{ date: Date; rounds: RoundData[] } | null>> = [];

    const currentDate = new Date(firstDay);
    let currentWeek: Array<{ date: Date; rounds: RoundData[] } | null> = [];

    // Fill in empty days before first day of year
    for (let i = 0; i < getDayOfWeek(firstDay); i++) {
      currentWeek.push(null);
    }

    while (currentDate <= lastDay) {
      const isoDateStr = currentDate.toISOString().split('T')[0];
      const dateKey = isoDateStr ?? currentDate.toISOString();
      const dayRounds = roundsByDate.get(dateKey) || [];

      currentWeek.push({ date: new Date(currentDate), rounds: dayRounds });

      if (getDayOfWeek(currentDate) === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill remaining week
    while (currentWeek.length < 7 && currentWeek.length > 0) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year, roundsByDate]);

  // Get month positions for labels
  const monthPositions = useMemo(() => {
    const positions: Array<{ month: string; week: number }> = [];
    let lastMonth = -1;

    calendarWeeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week.find((d) => d !== null);
      if (firstDayOfWeek) {
        const month = firstDayOfWeek.date.getMonth();
        if (month !== lastMonth) {
          const monthName = MONTHS[month];
          if (monthName) {
            positions.push({ month: monthName, week: weekIndex });
          }
          lastMonth = month;
        }
      }
    });

    return positions;
  }, [calendarWeeks]);

  // Available years (based on rounds data)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    rounds.forEach((r) => {
      years.add(new Date(r.date).getFullYear());
    });
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [rounds, currentYear]);

  return (
    <div className={`relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden ${className}`}>
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-warm-900 flex items-center gap-2">
              <IconCalendar size={18} className="text-warm-400" />
              Performance Calendar
            </h3>
            <p className="text-sm text-warm-500 mt-0.5">
              {stats.totalRounds} rounds played in {year}
            </p>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setYear((y) => y - 1)}
              disabled={!availableYears.includes(year - 1)}
              className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconChevronLeft size={18} className="text-warm-600" />
            </button>
            <span className="px-3 py-1.5 text-sm font-semibold text-warm-900 min-w-[60px] text-center">
              {year}
            </span>
            <button
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconChevronRight size={18} className="text-warm-600" />
            </button>
          </div>
        </div>

        {/* Stats summary */}
        {stats.totalRounds > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="text-center p-3 rounded-xl bg-warm-50">
              <p className="text-xs text-warm-500 mb-1">Avg Score</p>
              <p className="text-lg font-bold text-warm-900 tabular-nums">
                {stats.avgScore?.toFixed(1) ?? '--'}
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-warm-50">
              <p className="text-xs text-warm-500 mb-1">Best Round</p>
              <p className="text-lg font-bold text-green-600 tabular-nums">
                {stats.bestRound ?? '--'}
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-green-50">
              <p className="text-xs text-warm-500 mb-1">Under Par</p>
              <p className="text-lg font-bold text-green-600 tabular-nums">
                {stats.underParRounds}
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-amber-50">
              <p className="text-xs text-warm-500 mb-1">Over Par</p>
              <p className="text-lg font-bold text-amber-600 tabular-nums">
                {stats.overParRounds}
              </p>
            </div>
          </div>
        )}

        {/* Heatmap */}
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="min-w-[800px]">
            {/* Month labels */}
            <div className="flex mb-1 pl-8">
              {monthPositions.map((pos, i) => {
                const prevPos = monthPositions[i - 1];
                const marginLeft = i === 0 ? pos.week * 12 : (pos.week - (prevPos?.week ?? 0)) * 12 - 24;
                return (
                  <div
                    key={i}
                    className="text-xs text-warm-400 font-medium"
                    style={{ marginLeft }}
                  >
                    {pos.month}
                  </div>
                );
              })}
            </div>

            {/* Grid with day labels */}
            <div className="flex">
              {/* Day labels */}
              <div className="flex flex-col gap-[2px] mr-1 pt-[2px]">
                {DAYS.map((day, i) => (
                  <div
                    key={day}
                    className="h-[10px] text-[9px] text-warm-400 flex items-center"
                    style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}
                  >
                    {day[0]}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="flex gap-[2px]">
                {calendarWeeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[2px]">
                    {week.map((day, dayIndex) => {
                      if (!day) {
                        return <div key={dayIndex} className="w-[10px] h-[10px]" />;
                      }

                      const hasRounds = day.rounds.length > 0;
                      const firstRound = day.rounds[0];
                      const bestRound = hasRounds && firstRound
                        ? day.rounds.reduce((best, r) => (r.toPar < best.toPar ? r : best), firstRound)
                        : null;

                      return (
                        <div
                          key={dayIndex}
                          className={`w-[10px] h-[10px] rounded-sm cursor-pointer transition-all ${
                            hasRounds && bestRound
                              ? `${getScoreColor(bestRound.toPar)} hover:ring-2 hover:ring-warm-400 hover:ring-offset-1`
                              : 'bg-warm-100 hover:bg-warm-200'
                          }`}
                          style={{ opacity: hasRounds && bestRound ? getScoreOpacity(bestRound.toPar) : 0.5 }}
                          onMouseEnter={() => hasRounds && bestRound && setHoveredRound(bestRound)}
                          onMouseLeave={() => setHoveredRound(null)}
                          onClick={() => hasRounds && bestRound && onRoundClick?.(bestRound)}
                          title={
                            hasRounds && bestRound
                              ? `${day.date.toLocaleDateString()}: ${bestRound.score} (${
                                  bestRound.toPar >= 0 ? '+' : ''
                                }${bestRound.toPar})`
                              : day.date.toLocaleDateString()
                          }
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-warm-100">
          <span className="text-xs text-warm-500">Less</span>
          <div className="flex gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-warm-100" />
            <div className="w-[10px] h-[10px] rounded-sm bg-red-400" />
            <div className="w-[10px] h-[10px] rounded-sm bg-orange-400" />
            <div className="w-[10px] h-[10px] rounded-sm bg-amber-400" />
            <div className="w-[10px] h-[10px] rounded-sm bg-warm-300" />
            <div className="w-[10px] h-[10px] rounded-sm bg-green-400" />
            <div className="w-[10px] h-[10px] rounded-sm bg-emerald-500" />
            <div className="w-[10px] h-[10px] rounded-sm bg-emerald-600" />
          </div>
          <span className="text-xs text-warm-500">Better</span>
        </div>

        {/* Hover tooltip */}
        {hoveredRound && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-warm-200 p-3 z-20 pointer-events-none">
            <p className="text-xs font-medium text-warm-500 mb-1">
              {new Date(hoveredRound.date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-lg font-bold text-warm-900 tabular-nums">{hoveredRound.score}</p>
                <p className="text-xs text-warm-500">Score</p>
              </div>
              <div
                className={`px-2 py-1 rounded-lg text-sm font-bold ${
                  hoveredRound.toPar < 0
                    ? 'bg-green-100 text-green-700'
                    : hoveredRound.toPar === 0
                    ? 'bg-warm-100 text-warm-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {hoveredRound.toPar === 0 ? 'E' : hoveredRound.toPar > 0 ? `+${hoveredRound.toPar}` : hoveredRound.toPar}
              </div>
            </div>
            {hoveredRound.courseName && (
              <p className="text-xs text-warm-500 mt-1 truncate max-w-[200px]">{hoveredRound.courseName}</p>
            )}
          </div>
        )}

        {/* Empty state */}
        {stats.totalRounds === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
              <IconGolf size={24} className="text-warm-400" />
            </div>
            <p className="text-sm text-warm-500">
              No rounds recorded in {year}.
              <br />
              Play rounds to see your performance calendar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default PerformanceHeatmap;

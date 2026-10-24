'use client';

import { formatFixed } from '../../lib/format';
import { Line } from '../../ui/charts/Line';

type Day = { label: string; score: number | null; date?: string };

/**
 * The phone's team scoring trend (P004, direction A), on the one line chart (ui/charts/Line, B5): the team's average on
 * each of its last ten round days over a faint wash, the window's mean dashed, lower scores higher (P004-D1), the newest
 * day marked. A day with no rounds is a gap in the line, not a bridge. A finger on the plot reads a round day in a tip.
 * The page writes the summary it is named by (StatsTeamPhone). Nothing animates.
 */
export default function TeamTrendChart({ days, mean, label, tone = '' }: { days: Day[]; mean: number; label: string; tone?: '' | 'is-gain' | 'is-loss' }) {
  return (
    <Line
      // Its colour is the noise-tested change the summary words (row 69): green better, amber worse, ink no clear change.
      className={'ch-stm-line ' + (tone || 'is-flat')}
      label={label}
      // Round days spaced by their dates (row 119): a quiet fortnight shows as a gap, not as the next day.
      points={days.map((d) => ({ x: d.label, y: d.score, ...(d.date ? { at: Date.parse(d.date) } : {}) }))}
      lowerIsBetter
      baseline={{ value: mean, dashed: true }}
      axis={false}
      marks="last"
      wash
      readAt="tip"
      // No value axis: the summary under the chart says the figures in words (the first and last day, the change and the mean).
      height={120}
      format={formatFixed}
      readout={(i) => `${days[i]!.label} · ${days[i]!.score == null ? 'No rounds' : formatFixed(days[i]!.score!)}`}
    />
  );
}

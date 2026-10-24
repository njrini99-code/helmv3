'use client';

import { formatFixed } from '../../lib/format';
import { Line } from '../../ui/charts/Line';

type Day = { label: string; score: number | null; date?: string };

/**
 * The phone's team scoring trend (P004, direction A), on the one line chart (ui/charts/Line, B5): the team's average on
 * each of its last ten round days over a faint wash, the window's mean dashed, lower scores higher (P004-D1), the newest
 * day marked. A day with no rounds is a gap in the line, not a bridge. A finger on the plot reads a round day in a tip.
 * The page writes the summary it is named by (StatsTeamPhone). The value axis is drawn, so the strokes between days read off
 * the plot (row 69). `tone`: the line takes the gain or loss ink only when the summary's noise-tested change says the team got
 * better or worse; no clear change is the neutral ink, never a standing green. Nothing animates.
 */
export default function TeamTrendChart({ days, mean, label, tone = '' }: { days: Day[]; mean: number; label: string; tone?: '' | 'is-gain' | 'is-loss' }) {
  return (
    <Line
      className={'ch-stm-line' + (tone ? ' ' + tone : '')}
      label={label}
      // Round days spaced by their dates (row 119): a quiet fortnight shows as a gap, not as the next day.
      points={days.map((d) => ({ x: d.label, y: d.score, ...(d.date ? { at: Date.parse(d.date) } : {}) }))}
      lowerIsBetter
      baseline={{ value: mean, dashed: true }}
      marks="last"
      wash
      readAt="tip"
      height={120}
      format={formatFixed}
      readout={(i) => `${days[i]!.label} · ${days[i]!.score == null ? 'No rounds' : formatFixed(days[i]!.score!)}`}
    />
  );
}

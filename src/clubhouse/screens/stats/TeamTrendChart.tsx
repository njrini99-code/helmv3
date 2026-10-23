'use client';

import { formatFixed } from '../../lib/format';
import { Line } from '../../ui/charts/Line';

type Day = { label: string; score: number | null };

/**
 * The phone's team scoring trend (P004, direction A), on the one line chart (ui/charts/Line, B5): the team's average on
 * each of its last ten round days over a faint wash, the window's mean dashed, lower scores higher (P004-D1), the newest
 * day marked. A day with no rounds is a gap in the line, not a bridge. A finger on the plot reads a round day in a tip.
 * The page writes the summary it is named by (StatsTeamPhone). Nothing animates.
 */
export default function TeamTrendChart({ days, mean, label }: { days: Day[]; mean: number; label: string }) {
  return (
    <Line
      className="ch-stm-line"
      label={label}
      points={days.map((d) => ({ x: d.label, y: d.score }))}
      lowerIsBetter
      baseline={{ value: mean, dashed: true }}
      axis={false}
      marks="last"
      wash
      readAt="tip"
      height={120}
      format={formatFixed}
      readout={(i) => `${days[i]!.label} · ${days[i]!.score == null ? 'No rounds' : formatFixed(days[i]!.score!)}`}
    />
  );
}

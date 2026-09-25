'use client';

/**
 * Team trend as a diverging stacked area: each week, the team-average stored
 * strokes gained per area, gains stacked above the Tour line and losses
 * below it, with the net as a line. Week values come from `buildTeamTrend`
 * (each player's weekly mean, then the team mean) over stored per-round SG.
 *
 * Focus-start markers are not drawn: focus areas are per player, and there
 * is no stored team-level focus event to place on a team axis.
 */

import { useMemo } from 'react';
import { ROOT_AREAS, ROOT_AREA_LABEL, formatStrokes, shortDate, type RootArea } from '@/lib/coachhelm/root-map/build-root-map';
import { stackTeamTrend, type TeamTrendWeek } from '@/lib/coachhelm/root-map/area-trends';

const W = 320;
const H = 140;
const PAD_Y = 8;

/** Four steps of the same diverging hue per sign, strongest nearest zero. */
const MIX: Record<RootArea, number> = { tee: 90, approach: 70, short_game: 50, putting: 32 };

function fillFor(area: RootArea, sign: 'pos' | 'neg'): string {
  const token = sign === 'pos' ? 'var(--fw-viz-div-pos)' : 'var(--fw-viz-div-neg)';
  return `color-mix(in srgb, ${token} ${MIX[area]}%, transparent)`;
}

export function TeamTrendChart({ weeks }: { weeks: TeamTrendWeek[] }) {
  const stack = useMemo(() => stackTeamTrend(weeks), [weeks]);
  const extent = stack.extent > 0 ? stack.extent : 1;
  const n = weeks.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H / 2 - (v / extent) * (H / 2 - PAD_Y);

  const polygons = stack.bands.flatMap((band) => {
    // Split each band into its gain part and its loss part so each can take
    // its own sign's colour.
    const parts: Array<{ key: string; d: string; fill: string }> = [];
    for (const sign of ['pos', 'neg'] as const) {
      const clip = (v: number) => (sign === 'pos' ? Math.max(0, v) : Math.min(0, v));
      const upper = band.bounds.map(([, hi]) => clip(hi));
      const lower = band.bounds.map(([lo]) => clip(lo));
      if (upper.every((u, i) => Math.abs(u - (lower[i] ?? 0)) < 1e-9)) continue;
      const top = upper.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
      const bottom = lower.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).reverse();
      parts.push({ key: `${band.area}-${sign}`, d: `M${top.join(' L')} L${bottom.join(' L')} Z`, fill: fillFor(band.area, sign) });
    }
    return parts;
  });
  const netPath = stack.net.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  const first = weeks[0];
  const last = weeks[n - 1];
  // The real span of counted rounds (not week starts): "Jun 30 – Aug 2".
  const from = first ? shortDate(first.firstRound || first.weekStart) : null;
  const to = last ? shortDate(last.lastRound || last.weekStart) : null;
  const range = from && to ? (from === to ? from : `${from} – ${to}`) : null;
  const spoken =
    first && last
      ? `Team strokes gained per round by area, weekly, rounds from ${from} to ${to}. ` +
        `Latest week: ${ROOT_AREAS.map((a) => `${ROOT_AREA_LABEL[a]} ${last.values[a] === null ? 'no rounds' : formatStrokes(last.values[a] as number, { signed: true })}`).join(', ')}.`
      : 'Team trend';

  return (
    <section aria-labelledby="team-trend-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 border-b border-text-primary pb-2">
        <h3 id="team-trend-heading" className="font-fw-display text-body-lg font-semibold text-text-primary">
          Team trend
        </h3>
        <p className="text-caption text-text-tertiary">
          {range ? `${range} · ` : ''}
          {n} {n === 1 ? 'week' : 'weeks'} with rounds
        </p>
      </div>
      <p className="text-caption text-text-tertiary">Gaining on the Tour line ↑</p>
      <svg role="img" aria-label={spoken} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full">
        {polygons.map((p) => (
          <path key={p.key} d={p.d} style={{ fill: p.fill, stroke: 'var(--fw-color-surface)' }} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} style={{ stroke: 'var(--fw-viz-benchmark)' }} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {n > 1 ? (
          <path d={netPath} fill="none" style={{ stroke: 'var(--fw-color-text-primary)' }} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      <p className="text-caption text-text-tertiary">Losing to the Tour line ↓</p>
      <div className="flex justify-between text-caption text-text-tertiary">
        <span>{from ?? ''}</span>
        <span>{to ?? ''}</span>
      </div>
      <p className="text-caption text-text-tertiary">
        Team average per round, each player once per week. The dashed line is the Tour line; the chart spans{' '}
        <span className="font-fw-mono tabular-nums">±{formatStrokes(extent)}</span> strokes. Ends at the latest counted
        round with strokes gained.
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" aria-label="Legend">
        {ROOT_AREAS.map((a) => (
          <li key={a} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-flex h-3 w-4 overflow-hidden rounded-sm">
              <span className="h-full w-1/2" style={{ background: fillFor(a, 'pos') }} />
              <span className="h-full w-1/2" style={{ background: fillFor(a, 'neg') }} />
            </span>
            {ROOT_AREA_LABEL[a]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 bg-text-primary" />
          Net
        </li>
      </ul>
    </section>
  );
}

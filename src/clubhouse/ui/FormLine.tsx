'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { deltaTone, halvesChange, POOLED_SD } from '../lib/stats-signal';
import { Line } from './charts/Line';
import { formBarTone } from './form-range';

/**
 * What the form lines of one table share (B5): the scores' range, so the same height is the same score in every row, and
 * the number of round slots, so a shorter line ends at its newest round under everyone else's.
 */
const FormRangeContext = createContext<{ domain: [number, number]; slots: number } | undefined>(undefined);

/** The range around a set of last-rounds lines: every score in them, with 0.6 of a stroke above and below. */
export function formDomain(trends: Array<readonly number[] | null | undefined>): [number, number] | undefined {
  const all = trends.flatMap((t) => t ?? []);
  if (!all.length) return undefined;
  return [Math.min(...all) - 0.6, Math.max(...all) + 0.6];
}

/**
 * One range for the form lines inside: a table, a list or a leaderboard. Only the lines that draw count (`earlyBelow`
 * matches the rows' FormLine), so an "Early read" row can't stretch the others.
 */
export function FormRange({ trends, earlyBelow = 2, children }: { trends: Array<readonly number[] | null | undefined>; earlyBelow?: number; children: ReactNode }) {
  const drawn = trends.filter((t) => (t?.length ?? 0) >= earlyBelow);
  const key = drawn.map((t) => t!.join(',')).join('|');
  const shared = useMemo(() => {
    const domain = formDomain(drawn);
    return domain ? { domain, slots: Math.max(...drawn.map((t) => t!.length)) } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the scores, not the array's identity
  }, [key]);
  return <FormRangeContext.Provider value={shared}>{children}</FormRangeContext.Provider>;
}

/**
 * Last-rounds form line, on the one line chart (ui/charts/Line, B5): straight segments against a dashed mean, lower
 * scores higher (better is up, the one scoring-axis convention), on the range its table shares (`FormRange`) or its own.
 * It is green or amber only when the newer half of the scores moved from the older half by more than that change's
 * standard error (`halvesChange`, `deltaTone`: stats visuals Q4), green when scoring fell; otherwise ink, no clear change.
 */
export function FormLine({
  data,
  width = 148,
  height = 34,
  label,
  earlyBelow = 2,
  bare = false,
}: {
  data: number[];
  width?: number;
  height?: number;
  label: string;
  /** Below this many points the line isn't drawn, and an "Early read" pill says why. */
  earlyBelow?: number;
  /** Line and end point only, no mean or fill: the phone roster's row spark. */
  bare?: boolean;
}) {
  const shared = useContext(FormRangeContext);
  if (data.length < earlyBelow) {
    return (
      <span className={data.length ? 'ch-form-early' : 'ch-form-empty'} role="img" aria-label={label}>
        {data.length ? 'Early read' : '—'}
      </span>
    );
  }
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const half = halvesChange(data);
  const signal = deltaTone(half?.delta, half?.se, true);
  const tone = signal === 'is-gain' ? 'gain' : signal === 'is-loss' ? 'loss' : 'flat';
  return (
    <span style={{ maxWidth: width }} className={`ch-form ch-form--${tone}`} role="img" aria-label={label}>
      <Line
        interactive={false}
        label={label}
        points={[...Array<null>(Math.max(0, (shared?.slots ?? 0) - data.length)).fill(null), ...data].map((y, i) => ({ x: String(i + 1), y }))}
        lowerIsBetter
        domain={shared?.domain ?? formDomain([data])}
        baseline={bare ? undefined : { value: avg, dashed: true }}
        axis={false}
        ends={false}
        marks="last"
        wash={!bare}
        width={width}
        height={height}
      />
    </span>
  );
}

/**
 * The least range the form dots are drawn on, in strokes: about a round's usual spread either side (twice the pooled round
 * standard deviation, `POOLED_SD.score`, each way), so a player whose rounds sit within a stroke or two draws a nearly flat row,
 * on a team whose scores happen to sit close together as well as alone on a leader card (CH-03).
 */
export const FORM_MIN_SPAN = Math.round(4 * POOLED_SD.score);

/**
 * The last five rounds as dots, each at its score's height (stats and charts audit 2026-11-15, CH-03): a row of rounds is a
 * position chart, so a lower score sits higher, on the range its list shares (`FormRange`, the same height the same score down
 * the list) or its own, never narrower than `FORM_MIN_SPAN`, with the player's mean as a rule. The bars this replaced ran from a
 * 30% floor across each player's own best to worst, so 72, 73, 72 drew as different as 68, 84, 70. Hidden from VoiceOver; the
 * row's own label carries the figures.
 */
export function FormBars({ data, mean, n = 5 }: { data: readonly number[]; mean?: number | null; n?: number }) {
  const shared = useContext(FormRangeContext);
  const shown = data.slice(-n);
  const domain = shared?.domain ?? formDomain([shown]);
  if (!domain || shown.length === 0) return null;
  const [lo, hi] = widen(domain, FORM_MIN_SPAN);
  // Where a score sits, as a share of the strip from its foot: the lowest score of the range at the top.
  const up = (score: number) => Math.round(((hi - score) / (hi - lo)) * 1000) / 10;
  return (
    <span className="ch-formbars is-dots" aria-hidden="true">
      {mean != null && mean >= lo && mean <= hi && <b style={{ bottom: `${up(mean)}%` }} />}
      {shown.map((score, i) => (
        <i key={i} data-tone={formBarTone(score, mean)} style={{ bottom: `${up(score)}%` }} />
      ))}
    </span>
  );
}

/** A range widened about its middle to at least `min`. */
function widen([lo, hi]: [number, number], min: number): [number, number] {
  if (hi - lo >= min) return [lo, hi];
  const mid = (lo + hi) / 2;
  return [mid - min / 2, mid + min / 2];
}

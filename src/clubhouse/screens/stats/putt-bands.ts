import { NO_DATA } from '../../lib/format';
import { needsText, sampleState, wilson, type SampleState } from '../../lib/stats-signal';
import { plural } from '../../lib/plural';

/**
 * A band of putts as the loaders count them: its label ("5–10 ft"), the putts holed of those tried, and the Tour's make rate
 * (0 to 100) where it publishes one. Where only a rate and a count are kept (the calculator's own figures, when the putt read
 * failed), `made` is null and `rate` carries the rate as it was kept, so nothing is rounded twice.
 */
export interface PuttBandInput {
  label: string;
  made: number | null;
  attempts: number;
  bench: number | null;
  /** The kept rate, 0 to 100; read only when `made` is null. */
  rate?: number | null;
}

/** One band ready to draw: its rate, how sure it is, and whether it grades against the Tour. */
export interface PuttBandView extends Omit<PuttBandInput, 'rate'> {
  /** Make rate 0 to 100; null under the show floor (no dot). */
  rate: number | null;
  /** The 95% Wilson interval, 0 to 100; null where no dot is drawn. */
  range: { lo: number; hi: number } | null;
  /** `none` under 10 putts (no dot), `early` from 10 to 29 (hollow, never graded), `steady` from 30. */
  state: SampleState;
  /** Against the Tour, by the dot (never the whisker): only a steady band with a Tour value grades. */
  grade: '' | 'is-gain' | 'is-loss';
}

/** What a band under its floor says, in place of a dot. */
export const PUTT_NEEDS = `${needsText('make')} in the band`;

/** The Wilson interval's name, said once on the chart and in each readout. */
export const LIKELY_RANGE = 'likely range';

export function puttBandViews(bands: PuttBandInput[]): PuttBandView[] {
  return bands.map((b) => {
    const kept = b.made != null ? (b.attempts > 0 ? (b.made / b.attempts) * 100 : null) : (b.rate ?? null);
    // A band with putts but no rate kept has nothing to draw: it reads as under its floor, never as 0%.
    const state = kept == null ? 'none' : sampleState('make', b.attempts);
    const rate = state === 'none' ? null : kept;
    const w = rate == null ? null : wilson((rate / 100) * b.attempts, b.attempts);
    const grade = state === 'steady' && rate != null && b.bench != null ? (rate >= b.bench ? 'is-gain' : 'is-loss') : '';
    return { label: b.label, made: b.made, attempts: b.attempts, bench: b.bench, rate, range: w ? { lo: w.lo * 100, hi: w.hi * 100 } : null, state, grade };
  });
}

const pct = (v: number) => `${Math.round(v)}%`;

/** The count under a band: "20/51" (made/tried), or "33 putts" where only the count was kept. */
export function puttCount(b: Pick<PuttBandInput, 'made' | 'attempts'>): string {
  return b.made == null ? `${plural(b.attempts, 'putt')}` : `${b.made}/${b.attempts}`;
}

/** The count in words: "20 of 51 made", or "33 putts" where only the count was kept. */
function countWords(b: Pick<PuttBandInput, 'made' | 'attempts'>): string {
  if (!b.attempts) return 'No putts';
  return b.made == null ? puttCount(b) : `${b.made} of ${b.attempts} made`;
}

/** The rate under a band, or the no-data dash under its floor. */
export function puttRate(b: Pick<PuttBandView, 'rate'>): string {
  return b.rate == null ? NO_DATA : pct(b.rate);
}

/**
 * What a hovered, pinned or keyed band says in the chart's header line: "5–10 ft · 20 of 51 made, 39% · likely range 27% to
 * 53% · Tour 62%". An early band says so; a band under its floor says what it needs.
 */
export function puttReadout(b: PuttBandView): string {
  const parts = [b.label];
  if (b.rate == null) {
    parts.push(countWords(b), PUTT_NEEDS);
    return parts.join(' · ');
  }
  parts.push(`${countWords(b)}, ${pct(b.rate)}`);
  if (b.state === 'early') parts.push('early read');
  if (b.range) parts.push(`${LIKELY_RANGE} ${pct(b.range.lo)} to ${pct(b.range.hi)}`);
  if (b.bench != null) parts.push(`Tour ${pct(b.bench)}`);
  return parts.join(' · ');
}

/** The chart's name for a screen reader: each band in feet with its rate and count, and that the bands are evenly spaced. */
export function puttSummary(views: PuttBandView[]): string {
  const each = views.map((b) => `${b.label.replace(/ ft$/, ' feet')} ${b.rate == null ? `no rate, ${b.attempts} putts` : `${pct(b.rate)}, ${b.made == null ? puttCount(b) : `${b.made} of ${b.attempts}`}`}`);
  return `Make rate by distance: ${each.join('; ')}. Bands are evenly spaced, not to scale. Use the arrow keys to read each band.`;
}

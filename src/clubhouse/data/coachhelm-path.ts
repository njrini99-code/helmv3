import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { isPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import type { ChViewer } from './coachhelm-voice';
import { plural } from '../lib/plural';

/**
 * The path line (design call D2): the second line of every read, inside its card, in one fixed grammar: what was seen · count of
 * denominator · rounds · firmness word. Never a diagram, never a percent of confidence, never the word "because". The firmness word
 * is the one place the cause tier appears (the evidence grammar table): Seen in {First}'s shots, Likely, not yet traced, Not yet
 * traced, Shot records could not be read this run, Out of date.
 *
 * Source: the engine's own cause (`evidence.cause`, Slice 2) when the row carries one; otherwise the honest fallback from the copy
 * table, the symptom plus "Not yet traced shot by shot". The generators' placeholder cause ("… is off its benchmark. Likely cause
 * inferred from the aggregate, …") states no cause and is never a part of the line. Narrowing chips are drawn only from a narrowing
 * the engine stored (`diagnosis.basis.narrowing.path`); none is ever made up. Pure: evidence in, words out; every number is stored.
 */

export type ChPathTier = 'seen' | 'likely' | 'not_traced' | 'failed' | 'out_of_date';

export interface ChPathLine {
  tier: ChPathTier;
  /** What was seen: the counted path in arrow grammar ("approach missed → chip to inside 6 ft → 1 putt") or the symptom. */
  seen: string;
  /** "10 of 13 missed greens from 50–125 yd", "75 putts"; null when the row stores no count. */
  count: string | null;
  /** "3 rounds"; null when the row does not say. */
  rounds: string | null;
  /** The firmness word. */
  firmness: string;
  /** The steps a stored narrowing passed ("175+ yd", "long par 4s", "short-right"); null when the engine stored none. */
  narrowing: string[] | null;
}

/** The words the fallback ends on: the symptom is real, the why is not traced (design call §3, "Missing"). */
export const NOT_TRACED_SHOT_BY_SHOT = 'Not yet traced shot by shot';
/** The prefix a narrowing keeps verbatim (PR #2073 tests it): a narrowing says where, never why. */
export const NARROWING_PREFIX = 'Observed, not a cause:';

const count = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const trimEnd = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');

/**
 * A college comparison is never drawn (Q-88: the Tour is the only benchmark). The generators' template symptom names the stored
 * comparison ("Penalties per Round: 1.1 vs College cohort avg 0.6"), so a symptom that names a college one is not used.
 */
const COLLEGE = /\b(college|cohort|D[123]\b|NAIA|NJCAA)/i;

/** The symptom as stored, without a closing stop; never the placeholder cause, never a college comparison. Empty when unusable. */
function symptomOf(ev: InsightEvidence): string {
  const s = ev.diagnosis?.symptom?.trim() ?? '';
  return s && !isPlaceholderCause(s) && !COLLEGE.test(s) ? trimEnd(s) : '';
}

/** The steps a stored narrowing passed, or null. */
export function narrowingOf(ev: InsightEvidence): string[] | null {
  const path = ev.diagnosis?.basis?.narrowing?.path;
  const steps = Array.isArray(path) ? path.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim()) : [];
  return steps.length > 0 ? steps : null;
}

/** "Seen in Priya's shots" for a coach, "Seen in your shots" for the player (the roster stores no pronoun, so the name). */
function seenIn(viewer: ChViewer | undefined): string {
  return viewer?.role === 'coach' && viewer.first ? `Seen in ${viewer.first}’s shots` : 'Seen in your shots';
}

/**
 * The read's path line. `sample`: the evidence line's own count ("75 putts"), the fallback's count. `measured`: what the read
 * stands on when the row stores no usable symptom (the evidence label and the player's value, "Penalties per round: 1.1").
 * `stale`: a round newer than the read exists, so it is Out of date whatever its tier. `say`: the viewer's voice for stored prose
 * (the symptom). Null for a note, which states no finding and so has no path.
 */
export function pathLineFor(
  ev: InsightEvidence,
  opts: { viewer?: ChViewer; sample: string; measured: string; stale: boolean; note?: boolean; say?: (text: string) => string },
): ChPathLine | null {
  if (opts.note) return null;
  const say = opts.say ?? ((t: string) => t);
  const narrowing = narrowingOf(ev);
  const stored = symptomOf(ev);
  const symptom = stored ? say(stored) : opts.measured;
  const roundsN = count(ev.rounds_n) && ev.rounds_n > 0 && !/\brounds?$/.test(opts.sample) ? plural(ev.rounds_n, 'round') : null;
  const fallback: ChPathLine = { tier: 'not_traced', seen: symptom, count: opts.sample || null, rounds: roundsN, firmness: NOT_TRACED_SHOT_BY_SHOT, narrowing };
  const c = ev.cause;
  const pop = c?.population?.trim() || 'misses';
  let line: ChPathLine = fallback;

  if (c?.state === 'observed_sequence') {
    const steps = (c.path ?? []).filter((p) => typeof p === 'string' && p.trim() !== '').map((p) => p.trim());
    if (steps.length > 0) {
      line = {
        tier: 'seen',
        seen: steps.join(' → '),
        count: count(c.occurrences) && count(c.denominator) ? `${c.occurrences} of ${c.denominator} ${pop}` : null,
        rounds: count(c.distinct_rounds) && c.distinct_rounds > 0 ? plural(c.distinct_rounds, 'round') : null,
        firmness: seenIn(opts.viewer),
        narrowing,
      };
    }
  } else if (c?.state === 'inferred_hypothesis') {
    // A player is never shown an inferred cause (Q3): theirs keeps the fallback.
    const alt = c.alternatives?.[0];
    if (opts.viewer?.role === 'coach' && alt && alt.label?.trim()) {
      line = {
        tier: 'likely',
        seen: alt.label.trim(),
        count: count(alt.arm_a?.failures) && count(alt.arm_a?.n) ? `${alt.arm_a.failures} of ${alt.arm_a.n}` : null,
        rounds: count(c.distinct_rounds) && c.distinct_rounds > 0 ? plural(c.distinct_rounds, 'round') : null,
        firmness: 'Likely, not yet traced',
        narrowing,
      };
    }
  } else if (c?.state === 'not_traced') {
    if (c.not_traced_reason === 'load_failed') {
      line = { ...fallback, tier: 'failed', firmness: 'Shot records could not be read this run' };
    } else if (c.not_traced_reason === 'count_down' && c.count_down) {
      const cd = c.count_down;
      line = {
        ...fallback,
        count: `${cd.have_events} of the ${cd.need_events} ${pop} it needs`,
        rounds: `${plural(cd.have_rounds, 'round')} of ${cd.need_rounds}`,
        firmness: 'Not yet traced',
      };
    }
  }
  if (!line.seen) return null;
  return opts.stale ? { ...line, tier: 'out_of_date', firmness: 'Out of date' } : line;
}

/** The line as one string in its fixed order, for a screen reader and the tests. */
export function pathLineText(p: ChPathLine): string {
  return [p.seen, p.count, p.rounds, p.firmness].filter(Boolean).join(' · ');
}

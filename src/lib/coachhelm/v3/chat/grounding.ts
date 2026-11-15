/**
 * CoachHelm chat: the grounding check.
 *
 * After a turn, compares the numbers in the answer with the numbers the turn's reads (and this conversation's earlier
 * reads) returned. It is for the ledger and the eval only: it never hides, delays or rewrites an answer. That is why
 * it can be this small. It does not try to work out which player or metric a sentence is about; it asks one question,
 * "did a read return this number, or the difference of two figures it returned?", and lists the ones that did not.
 *
 * Pure: text and envelopes in, a verdict out.
 */
import type { ToolEnvelope } from './provenance';
import { withoutUiOnly } from './ui-only';

export interface GroundingResult {
  /** True when every checked number in the answer is supported by a read. */
  grounded: boolean;
  /** The unsupported numbers, as written, each once, in the order they appear. */
  unmatched: string[];
}

/** What a read can carry besides the envelope's own fields: the lines the model was shown. */
type Read = Pick<ToolEnvelope, 'summary' | 'measurements' | 'series' | 'coverage_note'> & { detail?: unknown; model_text?: string; window_label?: string };

const NUMBER = /[-+−]?\d[\d,]*(?:\.\d+)?/g;
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Things written with digits that are not figures: dates, clock times, ids, list markers, ordinals and labels like "hole 7" or "last 10 rounds". */
const NOT_FIGURES: RegExp[] = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  /\b\d{1,2}(?::\d{2}){1,2}\s*(?:[ap]\.?m\.?)?/gi,
  /\b\d{1,2}\s*(?:[ap]\.?m\.?)\b/gi,
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*[-–]\\s*\\d{1,2})?(?:,?\\s+(?:19|20)\\d{2})?\\b`, 'gi'),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`, 'gi'),
  /\b(?:19|20)\d{2}\b/g,
  /\b\d+(?:st|nd|rd|th)\b/gi,
  /^\s*(?:#+\s*)?\d+[.)]\s/gm,
  /\b(?:last|past|next|newest)\s+\d+(?:\s*,\s*\d+)*(?:,?\s*(?:or|and)\s*\d+)?\b/gi,
  /\b(?:holes?|par|top|bottom|first|latest|previous|round|rounds|no\.|number|division|d|grade|class of|e)\s*#?\d+\b/gi,
  // How long a round or an event is ("18 holes", "a 9-hole round", "54 holes of qualifying"): a format, not a statistic.
  /\b(?:9|18|27|36|54|72)[-\s]holes?\b/gi,
  /\b\d+\s*(?:-|–|to)\s*\d+\s*(?:ft|feet|foot|yd|yds|yards)\b/gi,
  /\b\d+\+?\s*(?:ft|feet|foot|yd|yds|yards)\b(?=\s*(?:band|range|bucket|putts?|and (?:in|out)))/gi,
  /\b(?:inside|outside|within|beyond|from|under|over)\s+\d+\s*(?:ft|feet|foot|yd|yds|yards)\b/gi,
];

/** An integer this small is a count or a place said in passing ("3 players", "the top 2"), not a statistic worth a flag. */
const SMALL_INTEGER_MAX = 12;
const FIGURE_PAIR_CAP = 120;

const toNumber = (raw: string): number => Number(raw.replace(/,/g, '').replace('−', '-'));
const decimalsOf = (raw: string): number => (raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0);

function numbersInString(text: string, out: number[]): void {
  for (const m of text.matchAll(NUMBER)) {
    const n = toNumber(m[0]);
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
}

/** Every number a value holds, at any depth, including the ones written inside its strings. */
function collect(value: unknown, out: number[], depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.push(Math.abs(value));
  } else if (typeof value === 'string') numbersInString(value, out);
  else if (Array.isArray(value)) for (const v of value) collect(v, out, depth + 1);
  else if (typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) collect(v, out, depth + 1);
}

/** The figures a difference may be taken between: measured values and what they are compared with, never sample sizes or ids. */
function figuresOf(read: Read): number[] {
  const out: number[] = [];
  for (const m of read.measurements ?? []) {
    if (typeof m.value === 'number') out.push(m.value);
    if (m.benchmark && typeof m.benchmark.value === 'number') out.push(m.benchmark.value);
    for (const c of m.comparisons ?? []) {
      if (typeof c.value === 'number') out.push(c.value);
      if (typeof c.your_value === 'number') out.push(c.your_value);
    }
  }
  for (const s of read.series ?? []) for (const p of s.points) out.push(p.value);
  return out;
}

/** What a read supports: every number in it, and the differences between its figures (a gap the answer states is their difference). */
export function supportedNumbers(reads: readonly Read[]): { all: number[]; gaps: number[] } {
  const all: number[] = [];
  const figures: number[] = [];
  for (const r of reads) {
    // A read's `ui_only` rows (the shots a coach can open) were never shown to the model, so they support no figure (ui-only.ts).
    const d = withoutUiOnly(r.detail);
    collect({ s: r.summary, n: r.coverage_note, m: r.measurements, series: r.series, d, t: r.model_text, w: r.window_label }, all);
    figures.push(...figuresOf(r));
    // A figure a read states outside its measurements (a team average in its detail) is a decimal there; whole numbers there are mostly counts and ids.
    const stated: number[] = [];
    collect({ s: r.summary, d, t: r.model_text }, stated);
    figures.push(...stated.filter((n) => !Number.isInteger(n)));
  }
  const capped = figures.slice(0, FIGURE_PAIR_CAP);
  const gaps: number[] = [];
  for (let i = 0; i < capped.length; i += 1) for (let j = i + 1; j < capped.length; j += 1) gaps.push(Math.abs(capped[i]! - capped[j]!));
  return { all, gaps };
}

/** A written number matches a read's when they agree to the precision it was written with ("74" matches 74.4; "74.2" matches 74.21). */
function matches(raw: string, percent: boolean, pool: readonly number[]): boolean {
  const value = Math.abs(toNumber(raw));
  const tolerance = 0.5 * 10 ** -decimalsOf(raw) + 1e-9;
  for (const n of pool) {
    if (Math.abs(n - value) <= tolerance) return true;
    // A rate a read holds as a fraction, said as a percentage.
    if (percent && n <= 1 && Math.abs(n * 100 - value) <= tolerance) return true;
  }
  return false;
}

/**
 * Compares the answer's numbers with the reads'. `reads` is this turn's envelopes followed by the conversation's earlier ones;
 * the order does not matter.
 */
export function checkGrounding(text: string, reads: readonly Read[], question = ''): GroundingResult {
  let body = text;
  for (const re of NOT_FIGURES) body = body.replace(re, (m) => ' '.repeat(m.length));
  const { all, gaps } = supportedNumbers(reads);
  // A number the coach gave ("who is under 75?") is theirs to hear back.
  numbersInString(question, all);
  const unmatched: string[] = [];
  for (const m of body.matchAll(NUMBER)) {
    const raw = m[0];
    const at = m.index ?? 0;
    // A hyphen that joins two words or a range is not a minus sign.
    const written = /^[-−]/.test(raw) && at > 0 && /[\w)]/.test(body[at - 1] ?? '') ? raw.slice(1) : raw;
    const digits = written.replace(/^[-+−]/, '');
    const value = toNumber(digits);
    if (!Number.isFinite(value)) continue;
    const percent = body[at + raw.length] === '%' || /^\s?percent/.test(body.slice(at + raw.length, at + raw.length + 9));
    if (value === 0 || (!digits.includes('.') && !percent && value <= SMALL_INTEGER_MAX)) continue;
    if (matches(digits, percent, all) || matches(digits, percent, gaps)) continue;
    const shown = `${written}${percent && body[at + raw.length] === '%' ? '%' : ''}`;
    if (!unmatched.includes(shown)) unmatched.push(shown);
  }
  return { grounded: unmatched.length === 0, unmatched };
}

/** The check in the shape the engine calls it with (`engine/grounding.ts`, `GroundingCheck`). */
export const groundingCheck = (args: { text: string; reads: readonly Read[]; question: string }): GroundingResult => {
  const result = checkGrounding(args.text, args.reads, args.question);
  return { grounded: result.grounded, unmatched: result.unmatched.slice(0, 20) };
};

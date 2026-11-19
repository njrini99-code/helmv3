/**
 * Numbers in a coach's sentence: find them, and decide whether each one is a fact.
 *
 * Deterministic and pure. The rules, each tested:
 *   - Digits ("3.2", "72%", "1,350") and number words from two up ("five rounds", "twenty-one") are numbers. "One" is
 *     not: it is idiom far more often than a count ("one thing", "the one band").
 *   - Golf terms are words, not counts: "three-putt", "two-putts", "par 3", "par-5s", "18 holes", "hole 1",
 *     "holes 2 to 18".
 *   - A range "30-40" or "30 to 40" is two numbers, never a negative one; signs are ignored everywhere (a strokes-gained
 *     figure of -3.2 may be written "costs 3.2").
 *   - Dates written as "21 August" or "August 21" are dates, checked against the facts' own dates, not as numbers.
 *   - Tolerance: a written number matches a fact when the fact, rounded to the precision written, equals it. "3"
 *     matches 3.2 or 2.6; "3.2" matches 3.24 but not 3.26; "72%" matches 71.6. Nothing looser.
 */

export interface FoundNumber {
  value: number;
  /** Decimal places as written: the precision the tolerance uses. */
  decimals: number;
  raw: string;
}

export interface FoundDate {
  raw: string;
  /** MM-DD, matched against the facts' dates on day and month (a year, when written, must match too). */
  month: number;
  day: number;
  year: number | null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthOf = (word: string): number => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().slice(0, 3))) + 1;

const UNITS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONE_TO_NINE: Record<string, number> = { one: 1, ...Object.fromEntries(Object.entries(UNITS).filter(([, v]) => v < 10)) };

/** Golf terms that contain a number but are not a count. Removed before numbers are read. */
export const NUMBER_TERMS: readonly RegExp[] = [
  /(^|[^-\w])(?:one|two|three|four|1|2|3|4)[- ]?putt(?:s|ed|ing)?\b/gi,
  /\bpar[- ]?[345]s?\b/gi,
  /\b(?:9|18|nine|eighteen)[- ]holes?\b/gi,
  /\bholes? 2 to 18\b/gi,
  /\bhole (?:1|one)\b/gi,
];

/** Removes the dates and returns them, so their digits are not read as numbers. */
export function extractDates(text: string): { rest: string; dates: FoundDate[] } {
  const dates: FoundDate[] = [];
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH_RE}\\b(?:,? (\\d{4}))?`, 'gi');
  const monthFirst = new RegExp(`\\b${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? (\\d{4}))?`, 'gi');
  let rest = text.replace(dayFirst, (raw, d: string, m: string, y?: string) => {
    dates.push({ raw, day: Number(d), month: monthOf(m), year: y ? Number(y) : null });
    return ' ';
  });
  rest = rest.replace(monthFirst, (raw, m: string, d: string, y?: string) => {
    dates.push({ raw, day: Number(d), month: monthOf(m), year: y ? Number(y) : null });
    return ' ';
  });
  rest = rest.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (raw) => {
    const [y, m, d] = raw.split('-').map(Number);
    dates.push({ raw, year: y!, month: m!, day: d! });
    return ' ';
  });
  return { rest, dates };
}

/** Every number written in `text`, terms and dates excluded (dates are returned by {@link extractDates}). */
export function extractNumbers(text: string): FoundNumber[] {
  let rest = extractDates(text).rest;
  for (const term of NUMBER_TERMS) rest = rest.replace(term, (_m, lead: unknown) => `${typeof lead === 'string' ? lead : ''} `);
  const found: FoundNumber[] = [];
  rest = rest.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, (raw) => {
    const clean = raw.replace(/,/g, '');
    const dot = clean.indexOf('.');
    found.push({ value: Number(clean), decimals: dot === -1 ? 0 : clean.length - dot - 1, raw });
    return ' ';
  });
  const words = new RegExp(`\\b(${Object.keys(TENS).join('|')})(?:[- ](${Object.keys(ONE_TO_NINE).join('|')}))?\\b|\\b(${Object.keys(UNITS).join('|')})\\b`, 'gi');
  for (const m of rest.matchAll(words)) {
    const value = m[1] ? TENS[m[1].toLowerCase()]! + (m[2] ? ONE_TO_NINE[m[2].toLowerCase()]! : 0) : UNITS[m[3]!.toLowerCase()]!;
    found.push({ value, decimals: 0, raw: m[0] });
  }
  return found;
}

/** The fact, rounded to the written precision, equals the written number. */
export function matchesAtPrecision(written: number, decimals: number, fact: number): boolean {
  const scale = 10 ** decimals;
  return Math.abs(Math.round(Math.abs(fact) * scale + 1e-9) - Math.round(Math.abs(written) * scale)) === 0;
}

export function inPool(n: FoundNumber, pool: readonly number[]): boolean {
  return pool.some((fact) => matchesAtPrecision(n.value, n.decimals, fact));
}

// ── Declared arithmetic ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates `+ - * /` and parentheses over plain numbers. Returns null for anything else (a name, a function, a
 * division by zero). Also returns the operands, so the caller can check each one is a fact.
 */
export function evaluate(expression: string): { value: number; operands: number[] } | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]|\S/g) ?? [];
  if (tokens.length === 0 || tokens.length > 40) return null;
  const operands: number[] = [];
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const expr = (): number | null => {
    let left = term();
    while (left !== null && (peek() === '+' || peek() === '-')) {
      const op = tokens[i++];
      const right = term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const term = (): number | null => {
    let left = factor();
    while (left !== null && (peek() === '*' || peek() === '/')) {
      const op = tokens[i++];
      const right = factor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const factor = (): number | null => {
    const t = tokens[i++];
    if (t === undefined) return null;
    if (t === '(') {
      const v = expr();
      if (tokens[i++] !== ')') return null;
      return v;
    }
    if (t === '-') {
      const v = factor();
      return v === null ? null : -v;
    }
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      operands.push(Number(t));
      return Number(t);
    }
    return null;
  };
  const value = expr();
  if (value === null || i !== tokens.length || !Number.isFinite(value)) return null;
  return { value, operands };
}

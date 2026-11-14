/*
 * A strokes gained figure's window in words (F-0005, audit 2026-11-13): the figure keeps its window, the last ten counted rounds across
 * the season start (QA-1, `playerStrokesGained`), and a figure drawn beside a season figure says which rounds it is: "Last 8 · Jun–Jul".
 * Client-safe; the window itself is found server-side (data/sg-window.ts).
 */

/** How many rounds carry the figure, and the first and last of their dates (YYYY-MM-DD). */
export interface ChSgWindow {
  n: number;
  from: string;
  to: string;
}

const monthOf = (d: string, month: 'short' | 'long', year: boolean) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month, ...(year ? { year: 'numeric' as const } : {}) }).format(new Date(`${d}T12:00:00Z`));

function months(w: ChSgWindow, month: 'short' | 'long', joiner: string): { one: string | null; range: string } {
  const years = w.from.slice(0, 4) !== w.to.slice(0, 4);
  const a = monthOf(w.from, month, years);
  const b = monthOf(w.to, month, years);
  return a === b ? { one: a, range: a } : { one: null, range: `${a}${joiner}${b}` };
}

/** "Last 8 · Jun–Jul"; "Last 3 · Sep" inside one month; both years when it crosses one. Null without a window. */
export function sgWindowLine(w: ChSgWindow | null | undefined): string | null {
  if (!w) return null;
  return `Last ${w.n} · ${months(w, 'short', '–').range}`;
}

/** The same window in words, for a figure's accessible name: "over the last 8 rounds with strokes gained, June to July". */
export function sgWindowSpoken(w: ChSgWindow | null | undefined): string | null {
  if (!w) return null;
  const m = months(w, 'long', ' to ');
  return `over the last ${w.n} ${w.n === 1 ? 'round' : 'rounds'} with strokes gained, ${m.one ? `in ${m.one}` : m.range}`;
}

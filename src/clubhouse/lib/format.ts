/**
 * Clubhouse number formatting. Figures always use a true minus, E for even,
 * and an em dash for no data. Null, zero and "early read" never look alike.
 */
export const MINUS = '−';
export const NO_DATA = '—';

/** Score relative to par: E, +3, −2, −0.4. */
export { formatToPar } from '@/lib/golf/format-to-par';

/** Signed delta, for example strokes gained: +1.8, −0.9, 0.0. */
export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return (rounded > 0 ? '+' : MINUS) + Math.abs(rounded).toFixed(digits);
}

/**
 * The tone of a change or a signed figure: green when it moved the good way, amber when the other (D-42), and none when it
 * rounds to zero at the `digits` it is shown with. "0.0" is no change, so it is never painted amber or green (F-54).
 */
export function changeTone(value: number | null | undefined, lowerIsBetter: boolean, digits = 1): '' | 'is-gain' | 'is-loss' {
  if (value == null || Number.isNaN(value) || Math.abs(value) < 0.5 * 10 ** -digits) return '';
  return value < 0 === lowerIsBetter ? 'is-gain' : 'is-loss';
}

/** `changeTone` as the text classes figures paint with: `ch-gain`, `ch-loss`, or '' when the shown value rounds to zero. */
export function changeInk(value: number | null | undefined, lowerIsBetter = false, digits = 1): '' | 'ch-gain' | 'ch-loss' {
  const tone = changeTone(value, lowerIsBetter, digits);
  return tone === 'is-gain' ? 'ch-gain' : tone === 'is-loss' ? 'ch-loss' : '';
}

/** `changeTone` as the good or bad word a figure's `tone` prop takes, and no tone when the shown value rounds to zero. */
export function changeVerdict(value: number | null | undefined, lowerIsBetter = false, digits = 1): 'good' | 'bad' | undefined {
  const tone = changeTone(value, lowerIsBetter, digits);
  return tone === 'is-gain' ? 'good' : tone === 'is-loss' ? 'bad' : undefined;
}

/**
 * Where a figure stands against the team's, decided on the values as printed at `digits` (A5): "level with the team" when
 * both print alike, otherwise the printed gap and "ahead of them" or "behind them". 0.44 against 0.36 prints 0.4 twice,
 * so it is level, never "0.1 ahead".
 */
export function versusTeam(mine: number, team: number, lowerIsBetter: boolean, digits = 1): string {
  const a = Number(mine.toFixed(digits));
  const b = Number(team.toFixed(digits));
  if (a === b) return 'level with the team';
  const better = lowerIsBetter ? a < b : a > b;
  return `${Math.abs(a - b).toFixed(digits)} ${better ? 'ahead of' : 'behind'} them`;
}

/** A percentage at a whole number by default: 61%, 0%, and an em dash for no data. */
export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  return `${value.toFixed(digits)}%`;
}

/** A scoring or stat average at one decimal (CONS-15): 72.4, and an em dash for no data. */
export function formatAvg(value: number | null | undefined): string {
  return formatFixed(value, 1);
}

/** Strokes gained, signed at one decimal everywhere (owner decision 11, 2026-10-24): +0.8, −1.2, 0.0. */
export function formatSG(value: number | null | undefined, digits = 1): string {
  return formatSigned(value, digits);
}

/** Handicap index at one decimal; a plus handicap (better than scratch, stored below zero) is written +1.2 (CONS-15). */
export function formatHcp(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  const rounded = Number(value.toFixed(1));
  return rounded < 0 ? `+${Math.abs(rounded).toFixed(1)}` : Math.abs(rounded).toFixed(1);
}

/** A distance in whole yards by default (CONS-15): 152 yds, 8.5 ft with `unit` and `digits`. */
export function formatDistance(value: number | null | undefined, unit = 'yds', digits = 0): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatFixed(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  return value.toFixed(digits);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

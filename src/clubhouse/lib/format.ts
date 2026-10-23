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

/** A percentage at a whole number by default: 61%, 0%, and an em dash for no data. */
export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  return `${value.toFixed(digits)}%`;
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

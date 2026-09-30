/**
 * Clubhouse number formatting. Figures always use a true minus, E for even,
 * and an em dash for no data. Null, zero and "early read" never look alike.
 */
export const MINUS = '−';
export const NO_DATA = '—';

/** Score relative to par: E, +3, −2, −0.4. */
export function formatToPar(value: number | null | undefined, digits?: number): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  const d = digits ?? (Number.isInteger(value) ? 0 : 1);
  const rounded = Number(value.toFixed(d));
  if (rounded === 0) return 'E';
  return (rounded > 0 ? '+' : MINUS) + Math.abs(rounded).toFixed(d);
}

/** Signed delta, for example strokes gained: +1.8, −0.9, 0.0. */
export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return (rounded > 0 ? '+' : MINUS) + Math.abs(rounded).toFixed(digits);
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

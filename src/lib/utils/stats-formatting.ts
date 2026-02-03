/**
 * Shared formatting utilities for golf stats display
 */

/**
 * Format a percentage value for display
 * Returns '-' only for null/undefined, NOT for 0
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value == null) return '-';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a numeric stat for display
 */
export function formatStat(value: number | null | undefined, decimals: number = 1): string {
  if (value == null) return '-';
  return value.toFixed(decimals);
}

/**
 * Format score to par (e.g., "+2", "-1", "E")
 */
export function formatScoreToPar(score: number | null | undefined): string {
  if (score == null) return '-';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

/**
 * Get color class for percentage-based stats
 */
export function getPercentageColor(
  value: number | null,
  thresholds: { good: number; okay: number }
): string {
  if (value == null) return 'text-gray-400';
  if (value >= thresholds.good) return 'text-emerald-600';
  if (value >= thresholds.okay) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Get color class for scoring stats (lower is better)
 */
export function getScoringColor(
  value: number | null,
  thresholds: { good: number; okay: number }
): string {
  if (value == null) return 'text-gray-400';
  if (value <= thresholds.good) return 'text-emerald-600';
  if (value <= thresholds.okay) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Format strokes gained value with sign
 */
export function formatStrokesGained(value: number | null | undefined, decimals: number = 2): string {
  if (value == null) return '-';
  const formatted = value.toFixed(decimals);
  return value >= 0 ? `+${formatted}` : formatted;
}

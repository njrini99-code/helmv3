/**
 * Per-player overlay colours for the calendar's schedule comparison.
 *
 * Applied through inline `style` objects for dynamic avatar backgrounds and
 * overlay bands, so they cannot be Tailwind classes. Each maps to a standard
 * palette value (primary-500, blue-500, amber-500, pink-500, purple-500,
 * teal-500, orange-500, cyan-500) so the Fairway calendar and the legacy
 * avatar sidebar keep the same colour per selection index.
 *
 * Lives here, not in the legacy calendar tree, so the Fairway calendar has no
 * runtime import of `components/golf/calendar` (SCREEN-BUILD-PLAN.md gate B1).
 */
export const PLAYER_COLORS = [
  { bg: '#22c55e', light: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', name: 'Green' },
  { bg: '#3b82f6', light: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', name: 'Blue' },
  { bg: '#f59e0b', light: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', name: 'Amber' },
  { bg: '#ec4899', light: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)', name: 'Pink' },
  { bg: '#8b5cf6', light: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)', name: 'Purple' },
  { bg: '#14b8a6', light: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.4)', name: 'Teal' },
  { bg: '#f97316', light: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', name: 'Orange' },
  { bg: '#06b6d4', light: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)', name: 'Cyan' },
];

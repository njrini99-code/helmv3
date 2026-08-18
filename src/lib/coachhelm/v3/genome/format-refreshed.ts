/**
 * How old a player genome is, worded once for every surface that shows one.
 *
 * WHY IT IS SHARED. `GenomeDetailView` grew its own `formatAgo` and
 * `GenomeCompareView` grew none at all — the compare route dropped
 * `computed_at` at the props boundary even though `loadGenomes` selects it
 * (genome/loader.ts:61). So the single-player view said "last refreshed
 * Jul 7, 2026" while the two-up comparison of the same two vectors said
 * nothing, and the head-to-head is the surface a coach uses to decide who
 * travels. One formatter, imported by both, is what stops that drifting again.
 *
 * WHY NULL RETURNS NULL. The previous `formatAgo(null)` returned the string
 * `'just now'` — the most reassuring possible answer for a timestamp we do not
 * have. No production row currently has a null `computed_at` (51 of 51 carry
 * one, measured 2026-08-17), so that was latent rather than live, but "unknown"
 * must never render as "fresh". Callers decide what to show for null; this
 * function refuses to invent it.
 *
 * WHY THE DATE IS FORMATTED IN UTC. `computed_at` is stamped by a nightly batch
 * job, so its calendar date is a UTC fact rather than a local one — the same
 * doctrine `eventCalendarDay` applies to all-day events. It also keeps the
 * string identical between the server render and the client hydration, which a
 * bare `toLocaleDateString` does not: the server runs UTC and the browser does
 * not, and a genome computed at 08:12Z renders as the previous day west of
 * Greenwich. That mismatch is the #418 hydration class this codebase has been
 * bitten by on the calendar.
 */

const DAY_MS = 86_400_000;

export function formatGenomeRefreshed(
  computedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!computedAt) return null;
  const ms = new Date(computedAt).getTime();
  if (!Number.isFinite(ms)) return null;

  const days = Math.floor((now.getTime() - ms) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

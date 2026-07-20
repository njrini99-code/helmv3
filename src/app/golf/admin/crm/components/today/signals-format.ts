// ============================================================================
// signals-format — pure formatting helpers for SignalsPanel.
//
// Deliberately self-contained rather than importing PipelineView's
// relativeTime() or a shared date-utils module: this file is a leaf
// component's tiny formatting layer, and the two functions here return a
// different (more compact) string shape than PipelineView's helper ("3d ago"
// vs PipelineView's "3d ago" for days but "Today"/"Yesterday" for the first
// two — this one collapses everything under a day into hour/minute buckets
// instead), so copying the *idea* rather than importing keeps each caller's
// formatting independently tunable.
// ============================================================================

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Compact relative-time label for the "Hot right now" rows' last engagement
 * event: "just now" / "12m ago" / "3h ago" / "3d ago" / "2mo ago" / "1y ago".
 * Returns '' for missing/unparseable input so callers can render nothing.
 */
export function relativeCompact(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const diffMs = now.getTime() - then;
  // Clock skew / a timestamp slightly in the future — read as "just now"
  // rather than surfacing a confusing negative duration.
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;

  const days = Math.floor(diffMs / DAY_MS);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Overdue-follow-up label: "today" for anything due within the last 24h,
 * otherwise "Nd overdue". Returns '' for missing/unparseable input.
 */
export function overdueLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const due = Date.parse(iso);
  if (Number.isNaN(due)) return '';

  const diffMs = now.getTime() - due;
  const days = Math.floor(diffMs / DAY_MS);
  if (days < 1) return 'today';
  return `${days}d overdue`;
}

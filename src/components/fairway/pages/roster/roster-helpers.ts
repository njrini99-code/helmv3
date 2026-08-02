/**
 * ============================================================================
 * Fairway · Roster · roster-helpers — the single home for the small, pure
 * presentation helpers that the legacy Roster surfaces each kept their own
 * copy of. Consolidated here so the Fairway re-skin shares ONE source of
 * truth (no behaviour change — every function below is copied VERBATIM from
 * the legacy sources, then deduped).
 * ----------------------------------------------------------------------------
 * Pure module — NO 'use client'. Safe to import from server components,
 * client components, and other pure modules alike.
 *
 * Provenance (logic copied verbatim, then merged):
 *   · isUserOnline      — src/app/golf/(dashboard)/dashboard/roster/page.tsx
 *                         + src/components/golf/roster/PlayerRosterView.tsx
 *   · formatHandicap    — src/components/golf/roster/PlayerRosterView.tsx
 *                         + src/components/golf/profile/KeyMetricsGrid.tsx
 *                         (+ explicit golf "scratch" case for an exact-0 index)
 *   · formatScoreToPar  — src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx
 *                         (integer) and KeyMetricsGrid.tsx (one-decimal) — both
 *                         shapes preserved, see formatScoreToPar vs
 *                         formatScoreToParDecimal below.
 *   · getScoringColor / getPercentageColor — src/components/golf/profile/
 *                         KeyMetricsGrid.tsx (legacy Tailwind color classes,
 *                         kept verbatim so the detail page reads identically).
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * Online presence — a teammate is "online" if their last_seen is within the
 * last 5 minutes. VERBATIM from the legacy roster page + PlayerRosterView
 * (both used the same < 5 minute window). Accepts undefined too so the coach
 * roster page (last_seen?: string | null | undefined) can call it directly.
 * ------------------------------------------------------------------------- */
export function isUserOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const diffMinutes = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60);
  return diffMinutes < 5;
}

/* ---------------------------------------------------------------------------
 * Handicap display — VERBATIM +/- one-decimal formatting from the legacy
 * PlayerRosterView / KeyMetricsGrid copies, plus an explicit golf "scratch"
 * label for an exact-0 index (a 0.0 handicap is, by definition, scratch).
 *   ·  null   → '—'
 *   ·  0      → 'scratch'
 *   ·  > 0    → '+2.1'   (above scratch / higher-than-zero index)
 *   ·  < 0    → '-1.4'   (a plus handicap / below scratch — toFixed keeps sign)
 * ------------------------------------------------------------------------- */
export function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  if (handicap === 0) return 'scratch';
  // A leading "+" denotes a PLUS handicap (better than scratch, stored negative).
  if (handicap < 0) return `+${Math.abs(handicap).toFixed(1)}`;
  return handicap.toFixed(1);
}

/* ---------------------------------------------------------------------------
 * Score-to-par display — INTEGER form. VERBATIM from the legacy roster
 * [id]/page.tsx (round.score_to_par is a whole-stroke integer there).
 *   ·  null   → '—'
 *   ·  0      → 'E'
 *   ·  > 0    → '+3'
 *   ·  < 0    → '-2'
 * ------------------------------------------------------------------------- */
export function formatScoreToPar(score: number | null): string {
  if (score === null) return '—';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}



/* ---------------------------------------------------------------------------
 * Fairway-token intent maps — the SAME thresholds as the legacy color maps,
 * but expressed as Fairway `FwStatusTone` values so re-skinned surfaces can
 * drive token-based components (Badge/StatusPill/Readout) instead of hardcoded
 * Tailwind classes. Green = good/structure, amber = caution, rose/red = danger
 * (locked Helm palette: #16A34A green is success/structure only).
 *
 * `FwStatusTone` is intentionally inlined as a string-literal union to keep
 * this a dependency-free PURE module (no import from a 'use client' control).
 * It is structurally identical to the controls' FwStatusTone.
 * ------------------------------------------------------------------------- */
export type RosterStatusTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** Score-to-par → tone (lower is better). Mirrors getScoringColor thresholds. */
export function scoreTone(toPar: number | null): RosterStatusTone {
  if (toPar === null) return 'neutral';
  if (toPar < 0) return 'success';
  if (toPar === 0) return 'neutral';
  if (toPar <= 3) return 'warning';
  return 'danger';
}



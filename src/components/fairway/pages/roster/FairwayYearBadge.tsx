/**
 * ============================================================================
 * Fairway · Roster · FairwayYearBadge — class-year / graduation-year mini-tag
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of src/components/golf/roster/YearBadge.tsx. Same input
 * contract, same FR/SO/JR/SR class-year mapping, same numeric→`'YY` short form,
 * same null/undefined guard (renders nothing) — only the colored shell swaps
 * from the legacy ui/Badge to the Fairway controls/Badge.
 *
 * Pure + SERVER-RENDERABLE — NO 'use client'. The Fairway Badge it wraps is a
 * client control, but rendering a client component from a server component is
 * allowed (this wrapper itself ships no interactivity, hooks, or handlers), so
 * FairwayYearBadge can be used directly inside server components (e.g. the
 * roster page) as well as client cards.
 *
 * Look: a compact, square-ish neutral mini-tag (uppercase, tracked, tabular
 * for the numeric `'YY` form) — the warm-glass equivalent of the legacy
 * warm-100 chip. Tone is `neutral` (soft), so it reads as quiet metadata, not
 * a status. Helm green stays reserved for success/structure.
 * ========================================================================== */

import { Badge } from '@/components/fairway/controls/badge';
import { cn } from '@/lib/utils';

/** VERBATIM class-year → short-label mapping from the legacy YearBadge. */
const YEAR_LABELS: Record<string, string> = {
  freshman: 'FR',
  sophomore: 'SO',
  junior: 'JR',
  senior: 'SR',
  graduate: 'GR',
  grad_student: 'GR',
  red_shirt_freshman: 'RS FR',
  red_shirt_sophomore: 'RS SO',
  red_shirt_junior: 'RS JR',
  red_shirt_senior: 'RS SR',
};

export interface FairwayYearBadgeProps {
  /**
   * Either a class-standing string (e.g. 'freshman', 'red_shirt_junior') or a
   * numeric graduation year (e.g. 2027 → `'27`). null / undefined renders
   * nothing — matching the legacy YearBadge guard exactly.
   */
  year: string | number | null | undefined;
  /** Optional extra classes merged onto the Badge shell. */
  className?: string;
}

export function FairwayYearBadge({ year, className }: FairwayYearBadgeProps) {
  if (year === null || year === undefined) return null;

  let label: string;
  let isNumeric = false;

  if (typeof year === 'number') {
    // Graduation year → abbreviated two-digit form (VERBATIM from legacy).
    label = `'${String(year).slice(-2)}`;
    isNumeric = true;
  } else {
    // Class-standing string → mapped short label, else first-two-chars upper
    // (VERBATIM fallback from legacy: `year.slice(0, 2).toUpperCase()`).
    label = YEAR_LABELS[year] ?? year.slice(0, 2).toUpperCase();
  }

  return (
    <Badge
      tone="neutral"
      variant="soft"
      size="sm"
      numeric={isNumeric}
      className={cn(
        // Square-ish mini-tag (the legacy YearBadge was a rounded-rect chip,
        // not a pill) with tracked uppercase metadata styling.
        'rounded-fw-sm px-1.5 uppercase tracking-[0.08em]',
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export default FairwayYearBadge;

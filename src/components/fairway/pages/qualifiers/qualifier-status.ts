/**
 * ============================================================================
 * Fairway · pages/qualifiers · shared status → {tone, label, pulse} map
 * ----------------------------------------------------------------------------
 * ONE source of truth for the qualifier status chip, consumed by BOTH
 * `FairwayQualifiers.tsx` (hero/card status pills) and
 * `FairwayQualifierDetail.tsx` (masthead status pill). Each file previously
 * kept its own drifting copy: Detail rendered `in_progress` as "In progress"
 * where the list (and its own Leaderboard child) says "Live" for the same
 * status, and the list rendered `upcoming` with an `accent` tone — the same
 * green as a genuinely live qualifier, distinguished only by the pulse dot.
 *
 * `upcoming` → `warning` (not `accent`) is the INTENTIONAL choice here, not a
 * downgrade: `FairwayMyQualifiers.tsx` (the player sibling list) already
 * documents this exact rationale on its own local copy — "Live" and
 * "Upcoming" must be separable without relying on the pulse dot, which
 * disappears in a grayscale/squinted screenshot and is fully suppressed
 * under `prefers-reduced-motion`. This map adopts that documented pairing
 * (`warning`/Upcoming, `accent`+pulse/Live, `neutral`/Completed) as the
 * canonical scheme; `FairwayMyQualifiers.tsx` keeps its own local copy for
 * now (out of this change's scope) but already matches it byte-for-byte.
 *
 * Local to this folder on purpose — matches the existing `charts/theme.ts` /
 * `roster/roster-helpers.ts` convention of small shared helpers scoped to the
 * page-group that uses them, not a new top-level shared file.
 * ========================================================================== */
import type { FwStatusTone } from '@/components/fairway';

export interface QualifierStatusMeta {
  tone: FwStatusTone;
  label: string;
  /** Whether the StatusPill should show its "live" pulse. Only `in_progress`
   *  genuinely pulses — an accent tone alone does not imply "live". */
  pulse: boolean;
}

const QUALIFIER_STATUS_META: Record<string, QualifierStatusMeta> = {
  upcoming: { tone: 'warning', label: 'Upcoming', pulse: false },
  in_progress: { tone: 'accent', label: 'Live', pulse: true },
  completed: { tone: 'neutral', label: 'Completed', pulse: false },
};

export function qualifierStatusMeta(status: string): QualifierStatusMeta {
  return (
    QUALIFIER_STATUS_META[status] ?? {
      tone: 'neutral',
      label: status.replace(/_/g, ' '),
      pulse: false,
    }
  );
}

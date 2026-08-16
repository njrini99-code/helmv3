/**
 * ============================================================================
 * NOT THE RECURRENCE ENGINE. This file is types only.
 * ----------------------------------------------------------------------------
 * The live implementation — RRULE parse/serialize/describe and the occurrence
 * expander (`generateOccurrences`) — is `src/lib/golf/recurrence.ts`.
 *
 * All that survives here is the `ExpandedEvent` shape below, which
 * `src/app/golf/actions/recurring-events.ts` still imports as a type. That one
 * importer is why this file is kept rather than deleted.
 *
 * The name is an attractive nuisance: it reads like the recurrence engine and
 * has already sent one reader (and one task brief) to the wrong file. If you
 * came here to change recurrence behaviour, you want `@/lib/golf/recurrence`.
 * ========================================================================== */

// BATCH 6: Recurrence Utilities (RRULE format)
// Extended with event expansion, academic exclusions, and filtering



// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

export interface ExpandedEvent {
  id: string;
  parentId: string | null;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  isRecurringInstance: boolean;
  originalStartDate: Date;
}



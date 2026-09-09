/**
 * ============================================================================
 * Fairway · Calendar · class detail contracts (UI-side)
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.4 (S4). Re-exports the REAL contract from
 * `src/app/golf/actions/class-detail.ts` (W-Services, landed mid-build) —
 * type-only, so a drift between this UI and the live action fails `tsc`
 * loudly instead of silently. The only thing added here is `loading`, a
 * pure client-side state with no server shape of its own.
 *
 * The server has no notion of "excluded" / "unsynced" as separate access
 * levels — those are refinements INSIDE a `detail`-access payload
 * (`ClassOccurrenceDetail.synced` and `.status.state`). `CalendarClassDetail`
 * derives its own eight-way render state from that shape; see the component
 * for the derivation.
 *
 * `offline` is the second client-only state (alongside `loading`): per
 * SCREEN-BUILD-PLAN.md §2.4's States line, a device that goes offline before
 * a read completes keeps showing the LAST successful `detail`-access
 * snapshot with a "checked at" label, rather than dropping to the generic
 * failed-read state — and "Edit class still deep-links" from it. The server
 * has no notion of "offline" of its own (fixtures note: it is a client-side
 * composition over a `detail` result, matching `loading`) — whoever manages
 * the fetch (retries, connectivity) is responsible for holding onto the last
 * successful `ClassOccurrenceDetail` and substituting this kind, with the
 * instant of that last successful read, instead of `success: false` when a
 * later read fails while offline.
 * ========================================================================== */

import type { ClassOccurrenceDetail, ClassOccurrenceDetailResult } from '@/app/golf/actions/class-detail';

export type {
  ClassOccurrenceDetail,
  ClassFreeBusyDetail,
  ClassOccurrenceStatus,
  ClassOccurrenceDetailResult,
  ClassOccurrenceDetailRequest,
} from '@/app/golf/actions/class-detail';

/** Client-only: the last successful `detail`-access read, kept on screen
 * because a subsequent read could not be completed offline. Never produced
 * by the server — see the module doc. */
export interface ClassOccurrenceOfflineView {
  kind: 'offline';
  /** The last successfully loaded detail snapshot — still rendered in full,
   * since it already cleared server-side access control when it loaded. */
  data: ClassOccurrenceDetail;
  /** ISO instant of the read `data` came from, shown as the "checked at" label. */
  checkedAt: string;
}

/** What `CalendarClassDetail` renders from: the server's resolved result,
 * plus the two client-only states (`loading`, `offline`) it can be in
 * without a fresh server read backing the screen. */
export type ClassOccurrenceView =
  | { kind: 'loading' }
  | ClassOccurrenceOfflineView
  | ClassOccurrenceDetailResult;

/** Who is looking, for the single-primary-action rule (§2.4): the class
 * owner gets Edit class, a coach of an active member gets Compare schedules,
 * anyone else gets no primary action at all. */
export type ClassDetailViewer = 'owner' | 'coach' | 'other';

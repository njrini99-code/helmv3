// ============================================================================
// demo-request-status — pure status predicates + update-payload builders for
// InboundLeadsView. Kept separate from the component so the status-domain
// logic is unit-testable without mounting React / a Supabase client.
//
// demo_requests.status CHECK domain: pending | contacted | scheduled |
// completed | declined (see demo_requests_status_check). The landing form
// only ever inserts 'pending' (or leaves it null, same meaning) — 'new' and
// 'converted' below are UI-only labels layered over 'pending' / 'completed',
// not real column values.
// ============================================================================

export interface DemoRequestStatusLike {
  status: string | null;
}

export const isNewRequest = (r: DemoRequestStatusLike): boolean =>
  !r.status || r.status === 'pending';

export const isContactedRequest = (r: DemoRequestStatusLike): boolean =>
  r.status === 'contacted';

export const isScheduledRequest = (r: DemoRequestStatusLike): boolean =>
  r.status === 'scheduled';

export const isConvertedRequest = (r: DemoRequestStatusLike): boolean =>
  r.status === 'completed';

export const isDeclinedRequest = (r: DemoRequestStatusLike): boolean =>
  r.status === 'declined';

/** True while the row is still in a state that allows further status changes. */
export const canAdvanceRequest = (r: DemoRequestStatusLike): boolean =>
  !isConvertedRequest(r) && !isDeclinedRequest(r);

/**
 * Update payload for the Decline action. Trims the reason and stores it as
 * `notes`; omits it (null, not '') when blank so we don't clobber the column
 * with an empty string.
 */
export function buildDeclineUpdate(reason: string): { status: 'declined'; notes: string | null } {
  const trimmed = reason.trim();
  return { status: 'declined', notes: trimmed.length > 0 ? trimmed : null };
}

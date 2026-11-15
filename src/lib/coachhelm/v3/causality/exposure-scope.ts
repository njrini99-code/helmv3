/**
 * Exposure rows the causality runs leave out (prod audit 2026-11-15, PMAC-01). Until 15 Nov the strip fetched a player's Team Hub
 * whole on every first open of the day, and the Hub's loader recorded its top insight as shown (`surface = 'hub_signal'`) whether
 * or not the player ever opened Team Hub. Those rows say "shown" for insights nobody saw, so they are not evidence that an insight
 * was seen: a causality run must not date a first exposure, or count a confounding one, from them. Rows with no surface (older
 * writers) still count. The rows themselves are untouched; deleting or relabelling them is the owner's call.
 *
 * When Team Hub records its card from the client after it has been on screen (the audit's follow-up), narrow this to rows written
 * before that change.
 */
export const CAUSALITY_EXCLUDED_SURFACES = ['hub_signal'] as const;

/** The PostgREST `or` filter for exposure rows a causality run may read. */
export const TRUSTED_EXPOSURE_FILTER = `surface.is.null,surface.not.in.(${CAUSALITY_EXCLUDED_SURFACES.join(',')})`;

/** Adds the filter to a `golf_insight_exposure` query. Typed loosely: the query builder's generics are too deep to constrain here. */
export function trustedExposure<Q>(query: Q): Q {
  return (query as unknown as { or: (filter: string) => Q }).or(TRUSTED_EXPOSURE_FILTER);
}

/**
 * CH-R1 (W7 P0): CoachHelm's loaders record every insight they return as shown (`insight-delivery.ts`, into
 * `golf_insight_exposure`), so any read nobody asked for (a page fetched whole ahead of the tap, or refreshed in the
 * background) counts insights nobody saw. Such an address is read only when it is opened. Every full prefetch and the
 * quiet refresh ask here first.
 *
 * Team Hub too (prod audit 2026-11-15, PMAC-01): the player's Hub reads its signal card through `getTopInsightForPlayer`,
 * which records the top insight as shown (`hub_signal`), and the strip fetched Team Hub whole on every first open of the
 * day. `__tests__/prefetch-exposure.test.ts` walks every nav page's imports and fails when a page that records is not
 * named here.
 */
const RECORDS_ON_READ = /^\/golf\/dashboard\/(?:coachhelm|team-hub)(?:[/?#]|$)/;

/** True for an address whose server render records what it shows. */
export function recordsOnRead(href: string): boolean {
  return RECORDS_ON_READ.test(href);
}

export function fullPrefetchAllowed(href: string): boolean {
  return !recordsOnRead(href);
}

/**
 * CH-R1 (W7 P0): CoachHelm's loaders record every insight they return as shown (`insight-delivery.ts`, into
 * `golf_insight_exposure`), so any read nobody asked for (a page fetched whole ahead of the tap, or refreshed in the
 * background) counts insights nobody saw. Such an address is read only when it is opened. Every full prefetch and the
 * quiet refresh ask here first.
 *
 * PMAC-01 (production audit, 15 Nov 2026): a player's Team Hub records its top insight as shown too (`data/hub.ts`, the
 * `hub_signal` surface), and the section strip fetched it whole on every app open, so every player was counted as having
 * seen it once a day. It joins CoachHelm here, for both roles (the address does not say whose hub it is).
 */
const RECORDS_ON_READ = /^\/golf\/dashboard\/(?:coachhelm|team-hub)(?:[/?#]|$)/;

/** True for an address whose server render records what it shows. */
export function recordsOnRead(href: string): boolean {
  return RECORDS_ON_READ.test(href);
}

export function fullPrefetchAllowed(href: string): boolean {
  return !recordsOnRead(href);
}

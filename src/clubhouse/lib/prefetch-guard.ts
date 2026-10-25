/**
 * CH-R1 (W7 P0): CoachHelm's loaders record every insight they return as shown (`insight-delivery.ts`, into
 * `golf_insight_exposure`), so any read nobody asked for (a page fetched whole ahead of the tap, or refreshed in the
 * background) counts insights nobody saw. Such an address is read only when it is opened. Every full prefetch and the
 * quiet refresh ask here first.
 */
const RECORDS_ON_READ = /^\/golf\/dashboard\/coachhelm(?:[/?#]|$)/;

/** True for an address whose server render records what it shows. */
export function recordsOnRead(href: string): boolean {
  return RECORDS_ON_READ.test(href);
}

export function fullPrefetchAllowed(href: string): boolean {
  return !recordsOnRead(href);
}

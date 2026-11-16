/**
 * CH-R1 (W7 P0): CoachHelm's loaders record every insight they return as shown (`insight-delivery.ts`, into
 * `golf_insight_exposure`), so any read nobody asked for (a page fetched whole ahead of the tap, or refreshed in the
 * background) counts insights nobody saw. Such an address is read only when it is opened. Every full prefetch and the
 * quiet refresh ask here first.
 *
 * PMAC-01 (production audit, 15 Nov 2026) found a player's Team Hub recording its top insight as shown on every prefetch.
 * DF-P-02 (#2534) removed the root cause: the hub aggregate no longer reads an insight, so Team Hub records nothing and
 * may be fetched ahead again (`lib/__tests__/prefetch-exposure.test.ts` walks the page for any recording read).
 */
const RECORDS_ON_READ = /^\/golf\/dashboard\/coachhelm(?:[/?#]|$)/;

/** True for an address whose server render records what it shows. */
export function recordsOnRead(href: string): boolean {
  return RECORDS_ON_READ.test(href);
}

export function fullPrefetchAllowed(href: string): boolean {
  return !recordsOnRead(href);
}

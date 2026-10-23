/**
 * CH-R1 (W7 P0): CoachHelm's loaders record every insight they return as shown (`insight-delivery.ts`, into
 * `golf_insight_exposure`), so a page fetched whole ahead of the tap counts insights nobody saw. Such an address is
 * never fetched ahead; it loads when it is opened. Every full prefetch in Clubhouse asks here first.
 */
const RECORDS_ON_READ = /^\/golf\/dashboard\/coachhelm(?:[/?#]|$)/;

export function fullPrefetchAllowed(href: string): boolean {
  return !RECORDS_ON_READ.test(href);
}

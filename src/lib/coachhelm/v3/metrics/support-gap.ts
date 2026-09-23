/**
 * `describeSupportGap` split out of `distance-profile.ts` into its own,
 * deliberately server-free module (#2008 review, URGENT — CI's Next build
 * failed with `UnhandledSchemeError: node:async_hooks`).
 *
 * `DistanceProfileSection.tsx` ('use client') imports `describeSupportGap`
 * as a VALUE to render tile/drill-down copy. When it lived in
 * `distance-profile.ts`, that one value import pulled the WHOLE module
 * into the client bundle — including its own value import of
 * `bucketApproachDistance` from `../engine/shot-source`, which imports
 * `createAdminClient` (a Node-only client). This file has only a
 * type-only import, so it is safe for a client component to import a
 * value from directly. `distance-profile.ts` re-exports this function so
 * its own (server-side) consumers see no change.
 */

import type { MetricResult, SupportFloorGap } from './types';

export function describeSupportGap(row: MetricResult): string {
  const gaps = row.failedFloors ?? [];
  if (gaps.length === 0) {
    // Defensive only — computeDistanceProfile always populates
    // `failedFloors` whenever it sets `status` to `'insufficient'`, so a
    // real row never reaches this branch.
    return 'not enough data yet';
  }
  return gaps.map(describeFloorGap).join(' and ');
}

function describeFloorGap(gap: SupportFloorGap): string {
  switch (gap.floor) {
    case 'rounds':
      return `${gap.current} of ${gap.required} rounds`;
    case 'greens':
      return `${gap.current} of ${gap.required} greens hit`;
    case 'attempts':
    default:
      return `${gap.current} of ${gap.required} attempts`;
  }
}

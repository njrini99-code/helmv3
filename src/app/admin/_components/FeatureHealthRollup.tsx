import { FeatureHealthSummary } from './FeatureHealthSummary';
import type { FeatureHealthSummary as FeatureHealthSummaryData } from '@/lib/admin/data/feature-health';

/**
 * W16 Task 5 — compact Feature-Health rollup for the Overview tab (and its
 * golf/baseball counterparts). Kept as its OWN export, with its OWN exact
 * `{ summary }` prop shape, because `src/app/admin/page.tsx` — a file this
 * task does not own — imports and renders it directly.
 *
 * Health-consolidation pass: the rendering itself now lives in
 * `FeatureHealthSummary` (`variant="compact"` there is byte-for-byte what
 * this component used to render inline), so the Overview banner, the golf
 * page's cross-link, the baseball page's cross-link, and the Health board's
 * per-group header all read the SAME "N green / M amber / R red / K
 * neutral" vocabulary from ONE place instead of three independent
 * renderings of it.
 */
export function FeatureHealthRollup({ summary }: { summary: FeatureHealthSummaryData }) {
  return <FeatureHealthSummary variant="compact" summary={summary} />;
}

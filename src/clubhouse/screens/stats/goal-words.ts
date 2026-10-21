import { getMetricDefinition, isGolfMetricId } from '@/lib/golf/metrics/display-registry';

/** A goal's stat by name: "Strokes gained: putting", never the id ("sg_putting"). An id the registry doesn't know is shown as it is. */
export function goalMetricLabel(metric: string): string {
  return isGolfMetricId(metric) ? getMetricDefinition(metric).label : metric;
}

/** How a goal's state reads on the Development tab, or null for the two a goal is simply in (active, achieved). */
export function goalStateWords(state: string | null): string | null {
  switch (state) {
    case 'paused':
      return 'Paused';
    case 'abandoned':
      return 'Abandoned';
    case 'missed':
      return 'Not reached';
    case 'partial':
      return 'Partly reached';
    case 'pending_baseline':
      return 'Waiting for a first round';
    default:
      return null;
  }
}

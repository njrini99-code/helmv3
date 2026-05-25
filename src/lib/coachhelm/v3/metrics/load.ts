/**
 * Runtime metric loader + TS<->DB parity check.
 *
 * Engine code calls {@link loadMetrics} to get a Map keyed by metric_id.
 * CI calls {@link validateMetricRegistry} on every PR to catch schema
 * drift between the SQL seed and the TS registry (Part XXVI risk H).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';

import {
  METRIC_IDS,
  type MetricId,
  isMetricId,
} from './registry';
import type { Metric } from './types';

// `golf_metrics` lands in this PR's migration. Until the generated
// Database types are regenerated post-merge (separate ops task), reads
// go through the centralized untyped escape hatch.
interface GolfMetricRow {
  metric_id: string;
  display_label: string;
  unit: string;
  direction: string;
  category: string;
  description: string | null;
  introduced_in_wave: string;
  active: boolean;
}

/**
 * Load every active metric from the DB, returning a Map keyed by
 * metric_id for O(1) lookups. Uses the admin client (RLS bypassed) since
 * `golf_metrics` is reference data and engine cron jobs need it.
 *
 * Filters to `active = true` — inactive metrics are intentionally
 * excluded so retired metrics stop leaking into the engine surface.
 */
export async function loadMetrics(): Promise<Map<MetricId, Metric>> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_metrics')
    .select(
      'metric_id, display_label, unit, direction, category, description, introduced_in_wave, active',
    )
    .eq('active', true) as { data: GolfMetricRow[] | null; error: { message: string } | null };

  if (error) {
    throw new Error(`Failed to load golf_metrics: ${error.message}`);
  }

  const map = new Map<MetricId, Metric>();
  for (const row of data ?? []) {
    if (!isMetricId(row.metric_id)) {
      // A row exists in DB that the TS registry doesn't know about. This
      // is the parity bug we guard against in validateMetricRegistry —
      // but during normal load we degrade gracefully rather than throwing,
      // so a stale TS deploy doesn't take the engine down. CI catches it.
      continue;
    }
    map.set(row.metric_id, row as Metric);
  }
  return map;
}

/**
 * Look up a single metric by id, or `null` if it isn't present (e.g.
 * deactivated). Engine code that depends on a specific metric should
 * check for `null` and degrade gracefully.
 */
export async function loadMetric(id: MetricId): Promise<Metric | null> {
  const all = await loadMetrics();
  return all.get(id) ?? null;
}

/**
 * Parity check between the TS canonical registry and the DB rows. Throws
 * on any drift in either direction so CI surfaces the problem.
 *
 * Run from a CI script:
 *
 *   ```bash
 *   tsx scripts/check-metric-registry-parity.ts
 *   ```
 *
 * (Script lives elsewhere; this function is the boundary.)
 */
export async function validateMetricRegistry(): Promise<{
  matched: number;
  missingInDb: string[];
  missingInRegistry: string[];
}> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_metrics')
    .select('metric_id') as { data: Array<{ metric_id: string }> | null; error: { message: string } | null };
  if (error) {
    throw new Error(
      `validateMetricRegistry: failed to query golf_metrics: ${error.message}`,
    );
  }

  const dbIds = new Set<string>((data ?? []).map((r) => r.metric_id));
  const tsIds = new Set<string>(METRIC_IDS);

  const missingInDb: string[] = [];
  const missingInRegistry: string[] = [];

  for (const id of tsIds) {
    if (!dbIds.has(id)) missingInDb.push(id);
  }
  for (const id of dbIds) {
    if (!tsIds.has(id)) missingInRegistry.push(id);
  }

  if (missingInDb.length > 0 || missingInRegistry.length > 0) {
    const parts: string[] = [];
    if (missingInDb.length > 0) {
      parts.push(
        `Missing in DB (defined in TS only): ${missingInDb.join(', ')}`,
      );
    }
    if (missingInRegistry.length > 0) {
      parts.push(
        `Missing in TS registry (exists in DB only): ${missingInRegistry.join(', ')}`,
      );
    }
    throw new Error(
      `golf_metrics registry parity FAILED. Ship a TS+SQL paired change to fix. ${parts.join(' / ')}`,
    );
  }

  return {
    matched: tsIds.size,
    missingInDb,
    missingInRegistry,
  };
}

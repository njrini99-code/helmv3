/**
 * Phase H / H1 — the target_metric_id FK on golf_insight_outcome_attribution
 * MUST be dropped, because the attribution cron writes the raw evidence
 * metric id (which includes attributable ALIASES like `fairways_hit_pct` and
 * `score_to_par` that are intentionally NOT canonical golf_metrics rows — see
 * metric-sources.ts). Integrity is enforced at the app layer instead:
 * computeAttribution only inserts after lookupMetricSource() resolves a
 * non-null, non-intentional-null source.
 *
 * This is a STATIC test (no DB) so it runs in `npm test` and fails fast if a
 * future migration re-adds the FK. We assert the relaxation migration exists
 * and contains the DROP CONSTRAINT, and that no LATER migration re-creates the
 * FK against golf_metrics.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const RELAX_FILE = '20260608150000_v3_relax_attribution_metric_fk.sql';

describe('Phase H/H1: attribution target_metric_id FK is relaxed', () => {
  it('ships the relaxation migration that drops the FK', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, RELAX_FILE), 'utf-8');
    // Must drop the exact constraint name observed live.
    expect(sql).toContain(
      'golf_insight_outcome_attribution_target_metric_id_fkey',
    );
    expect(sql.toUpperCase()).toContain('DROP CONSTRAINT');
  });

  it('no migration AFTER the relaxation re-adds a metric FK on that column', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f > RELAX_FILE)
      .sort();
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8').toUpperCase();
      const touchesTable = sql.includes(
        'GOLF_INSIGHT_OUTCOME_ATTRIBUTION',
      );
      if (!touchesTable) continue;
      // A re-add would pair ADD CONSTRAINT ... FOREIGN KEY (TARGET_METRIC_ID)
      const reAdds =
        sql.includes('ADD CONSTRAINT') &&
        sql.includes('FOREIGN KEY') &&
        sql.includes('TARGET_METRIC_ID') &&
        sql.includes('GOLF_METRICS');
      expect(reAdds, `migration ${f} must not re-add the metric FK`).toBe(false);
    }
  });
});

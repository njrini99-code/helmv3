import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { METRIC_IDS, METRIC_COUNT } from '@/lib/coachhelm/v3/metrics/registry';

/**
 * MR-2 (P0): golf_metrics must be reproducible from the *applied* migration
 * chain. The original seed (20260524190200_v3_golf_metrics_seed.sql) was
 * archived under migrations_archive/pre_20260527/ when the prod baseline was
 * cut; the baseline re-CREATEs golf_metrics but never re-seeds it, so a
 * fresh `supabase db reset` / CI shadow DB / DR rebuild yielded an EMPTY
 * metrics table (silent no-op engine + FK failures).
 *
 * These are static file checks (no live DB): they assert the numbered seed
 * migration exists in the ACTIVE chain, is idempotent, and contains exactly
 * the canonical registry IDs — so the TS<->SQL seed stays in lockstep
 * without waiting for the runtime parity check in load.ts.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SEED_MIGRATION =
  '20260606010000_v3_golf_metrics_seed_reproducible.sql';

function readSeedSql(): string {
  return readFileSync(join(MIGRATIONS_DIR, SEED_MIGRATION), 'utf-8');
}

describe('MR-2: reproducible golf_metrics seed', () => {
  it('the numbered seed migration exists in the active migrations chain', () => {
    expect(existsSync(join(MIGRATIONS_DIR, SEED_MIGRATION))).toBe(true);
  });

  it('the seed timestamp is after the 20260606000000 cutoff', () => {
    // Hard constraint: new migrations must sort after the cutoff so they
    // never reorder ahead of an already-applied migration.
    const ts = SEED_MIGRATION.slice(0, 14);
    expect(Number(ts)).toBeGreaterThan(20260606000000);
  });

  it('is idempotent (ON CONFLICT DO NOTHING on the metric_id PK)', () => {
    const sql = readSeedSql().toLowerCase();
    expect(sql).toContain('insert into public.golf_metrics');
    expect(sql).toMatch(/on conflict\s*\(\s*metric_id\s*\)\s*do nothing/);
  });

  it('seeds exactly the canonical registry IDs — no missing, no extras', () => {
    const sql = readSeedSql();
    // Pull every quoted metric_id literal that is the first column of a row.
    // Row literals look like: ('sg_total', 'SG: Total', ...)
    const seeded = new Set<string>();
    const rowRe = /\(\s*'([a-z0-9_]+)'\s*,/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(sql)) !== null) {
      seeded.add(m[1]!);
    }

    const registry = new Set<string>(METRIC_IDS);

    const missingInSeed = [...registry].filter((id) => !seeded.has(id));
    const extraInSeed = [...seeded].filter((id) => !registry.has(id));

    expect(missingInSeed, 'registry IDs missing from seed').toEqual([]);
    expect(extraInSeed, 'seed IDs not in registry').toEqual([]);
    expect(seeded.size).toBe(METRIC_COUNT);
    expect(seeded.size).toBe(28);
  });

  it('does not re-seed the legacy v2-mining approach_direction_* family', () => {
    // ui-tone-2: those per-bucket ids are intentional-null legacy v2 metrics
    // (see causality/metric-sources.ts) and must NOT pollute the canonical
    // registry/seed — the tone fix is owned by the regex (negative-pattern).
    const sql = readSeedSql();
    expect(sql).not.toContain('approach_direction_');
  });

  it('config.toml db.seed points at a seed file that actually exists', () => {
    // MR-2: the prior "./seed.sql" path did not exist, so `db reset` loaded
    // no seed data.
    const configPath = join(process.cwd(), 'supabase', 'config.toml');
    const config = readFileSync(configPath, 'utf-8');
    const match = config.match(/sql_paths\s*=\s*\[\s*"([^"]+)"/);
    expect(match, 'db.seed.sql_paths entry').toBeTruthy();
    const seedRel = match![1]!.replace(/^\.\//, '');
    expect(existsSync(join(process.cwd(), 'supabase', seedRel))).toBe(true);
  });

  it('the original seed migration is not present in the active chain (archived)', () => {
    // Sanity: confirms the regression precondition is real — the only
    // golf_metrics INSERT in the active chain is the new reproducible one.
    const active = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith('.sql'),
    );
    const seeders = active.filter((f) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
      return /insert\s+into\s+public\.golf_metrics/i.test(sql);
    });
    expect(seeders).toEqual([SEED_MIGRATION]);
  });
});

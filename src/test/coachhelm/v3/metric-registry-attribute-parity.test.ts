/**
 * MR-1 / MR-3 (COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06 §10.19):
 * the registry parity guard (load.ts validateMetricRegistry) only compared
 * ID-SETS and was never wired into CI. The audit asks to also compare
 * direction / unit / category / label — drift in those attributes (e.g. a seed
 * row flipped to higher_better while METRIC_RENDER_CONFIG stays lower_better)
 * silently inverts counterfactual signs and tone polarity with no test catching
 * it.
 *
 * `validateMetricRegistry` is DB-connected (owned by the metrics/load.ts owner;
 * its extension to attribute comparison + the CI script that invokes it is
 * noted as a cross-file dependency). This companion test is the STATIC,
 * DB-free half: it parses the canonical SQL seed migration (the DB source of
 * truth) and asserts every attribute is in lockstep with the two TS mirrors:
 *   - METRIC_RENDER_CONFIG  → direction + unit + display_label
 *   - metrics/types.ts unions → unit / direction / category are legal values
 * It runs in the default `npm test` lane, so attribute drift fails fast on
 * every PR without waiting for the DB-connected pgTAP lane.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { METRIC_IDS, METRIC_COUNT } from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

const SEED_PATH = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260606010000_v3_golf_metrics_seed_reproducible.sql',
);

// Mirrors the CHECK constraints documented in metrics/types.ts.
const LEGAL_UNITS = new Set(['percent', 'strokes', 'yards', 'feet', 'count']);
const LEGAL_DIRECTIONS = new Set(['higher_better', 'lower_better']);
const LEGAL_CATEGORIES = new Set([
  'sg',
  'putting',
  'approach',
  'short_game',
  'course_mgmt',
  'scoring',
  'pressure',
]);

interface SeedRow {
  metric_id: string;
  display_label: string;
  unit: string;
  direction: string;
  category: string;
}

/**
 * Parse the VALUES rows of the seed. Each row is:
 *   ('metric_id', 'Display Label', 'unit', 'direction', 'category', 'desc...', 'W9')
 * We only need the first five columns. Labels/descriptions may contain commas,
 * so split is column-aware: capture the first five single-quoted literals.
 */
function parseSeedRows(): SeedRow[] {
  const sql = readFileSync(SEED_PATH, 'utf-8');
  const rows: SeedRow[] = [];
  // A row literal starts with `('` after the VALUES list. Capture the leading
  // five quoted fields; SQL escapes an apostrophe as '' which none of our
  // first-five fields contain, so a non-greedy [^']* is safe here.
  const rowRe =
    /\(\s*'([a-z0-9_]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(sql)) !== null) {
    const [, metric_id, display_label, unit, direction, category] = m;
    // All five groups are mandatory in the pattern, so a successful match
    // guarantees them; narrow for TS-strict without a non-null assertion.
    if (
      metric_id === undefined ||
      display_label === undefined ||
      unit === undefined ||
      direction === undefined ||
      category === undefined
    ) {
      continue;
    }
    rows.push({ metric_id, display_label, unit, direction, category });
  }
  return rows;
}

describe('MR-1/MR-3: golf_metrics seed ↔ TS attribute parity', () => {
  const seedRows = parseSeedRows();
  const seedById = new Map(seedRows.map((r) => [r.metric_id, r]));

  it('parses exactly the canonical metric count from the seed', () => {
    expect(seedRows.length).toBe(METRIC_COUNT);
    expect(seedRows.length).toBe(28);
  });

  it('every seeded unit / direction / category is a legal enum value', () => {
    for (const r of seedRows) {
      expect(LEGAL_UNITS, `unit for ${r.metric_id}`).toContain(r.unit);
      expect(LEGAL_DIRECTIONS, `direction for ${r.metric_id}`).toContain(r.direction);
      expect(LEGAL_CATEGORIES, `category for ${r.metric_id}`).toContain(r.category);
    }
  });

  it('seed ↔ METRIC_RENDER_CONFIG agree on direction for every metric', () => {
    for (const id of METRIC_IDS) {
      const seed = seedById.get(id);
      expect(seed, `seed row for ${id}`).toBeDefined();
      expect(seed!.direction, `direction drift on ${id}`).toBe(
        METRIC_RENDER_CONFIG[id].direction,
      );
    }
  });

  it('seed ↔ METRIC_RENDER_CONFIG agree on unit for every metric', () => {
    for (const id of METRIC_IDS) {
      expect(seedById.get(id)!.unit, `unit drift on ${id}`).toBe(
        METRIC_RENDER_CONFIG[id].unit,
      );
    }
  });

  it('seed ↔ METRIC_RENDER_CONFIG agree on display_label for every metric', () => {
    for (const id of METRIC_IDS) {
      expect(seedById.get(id)!.display_label, `label drift on ${id}`).toBe(
        METRIC_RENDER_CONFIG[id].display_label,
      );
    }
  });

  it('METRIC_RENDER_CONFIG has an entry for every registry id (no orphan metrics)', () => {
    for (const id of METRIC_IDS) {
      expect(METRIC_RENDER_CONFIG[id], `render config for ${id}`).toBeDefined();
    }
    // No extra render-config keys beyond the registry.
    expect(Object.keys(METRIC_RENDER_CONFIG).sort()).toEqual([...METRIC_IDS].sort());
  });

  it('lower_better metrics are categorized in a non-SG bucket (sanity on polarity↔category)', () => {
    // SG metrics are always higher_better; a lower_better SG row would mean a
    // seed/category mistake (and would mis-tone the StandingBar). Cheap guard.
    for (const r of seedRows) {
      if (r.category === 'sg') {
        expect(r.direction, `SG metric ${r.metric_id} must be higher_better`).toBe(
          'higher_better',
        );
      }
    }
  });
});

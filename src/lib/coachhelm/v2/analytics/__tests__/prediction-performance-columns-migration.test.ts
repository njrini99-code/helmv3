import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { EXTENDED_COLUMNS } from '../prediction-performance-writer';

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20261023150000_golf_prediction_perf_extended_columns.sql',
);

/**
 * The writer sent these columns for weeks with no migration behind them, so
 * every nightly rollup failed once (PGRST204, Sentry JAVASCRIPT-NEXTJS-15D)
 * before its fallback. This pins the migration to exactly what the writer sends.
 */
describe('golf_prediction_model_performance extended columns migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('adds every extended column the writer sends, and nothing else', () => {
    const added = [...statements.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(added.sort()).toEqual([...EXTENDED_COLUMNS].sort());
  });

  it('is additive only: nullable columns, no default, no drop or data change', () => {
    expect(statements).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b|\bNOT NULL\b|\bDEFAULT\b/i);
    expect(statements).toMatch(/ALTER TABLE public\.golf_prediction_model_performance/);
  });

  it('is registered in HELD.md', () => {
    const held = readFileSync(join(process.cwd(), 'supabase/migrations/HELD.md'), 'utf8');
    expect(held).toContain('`20261023150000_golf_prediction_perf_extended_columns.sql` | **HOLD**');
  });
});

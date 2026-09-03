import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QA_FIXTURE_ROUND_IDS, isQaFixtureRoundId } from '@/lib/admin/qa-fixture-rounds';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260901120000_integrity_completed_round_zero_scored_holes.sql',
);

describe('QA_FIXTURE_ROUND_IDS — drift guard against the migration', () => {
  it('matches, exactly, the four ids the migration excludes from Check 6', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // The migration's own array literal:
    //   AND r.id <> ALL (ARRAY[
    //     '0b000000-0000-4000-b000-000000000001',
    //     ...
    //   ]::uuid[])
    const uuidPattern = /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi;
    const idsInMigration = [...sql.matchAll(uuidPattern)].map((m) => m[1]!.toLowerCase());

    expect(idsInMigration.length).toBeGreaterThan(0);
    expect(new Set(QA_FIXTURE_ROUND_IDS.map((id) => id.toLowerCase()))).toEqual(
      new Set(idsInMigration),
    );
    expect(QA_FIXTURE_ROUND_IDS).toHaveLength(4);
  });
});

describe('isQaFixtureRoundId', () => {
  it('matches an exact id, case-insensitively', () => {
    expect(isQaFixtureRoundId('0b000000-0000-4000-b000-000000000001')).toBe(true);
    expect(isQaFixtureRoundId('0B000000-0000-4000-B000-000000000002')).toBe(true);
  });

  it('is false for null, undefined, empty string, and a real-looking round id', () => {
    expect(isQaFixtureRoundId(null)).toBe(false);
    expect(isQaFixtureRoundId(undefined)).toBe(false);
    expect(isQaFixtureRoundId('')).toBe(false);
    expect(isQaFixtureRoundId('11111111-1111-4111-8111-111111111111')).toBe(false);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAUSALITY_EXCLUDED_SURFACES } from '@/lib/coachhelm/v3/causality/exposure-scope';

/**
 * Launch readiness DF-P-04 (15 Nov 2026): the Track record counts reads shown to a team from `golf_coachhelm_shown_reads`, and it must
 * leave out the exposures nobody saw, as causality runs do. The function lives in SQL, so this reads the newest migration that defines
 * it and requires it to leave out every surface `exposure-scope.ts` leaves out. Adding a surface there without a migration fails here.
 */
const DIR = join(process.cwd(), 'supabase/migrations');

function newestDefinition(): { file: string; sql: string } {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(join(DIR, file), 'utf8');
    if (/create\s+or\s+replace\s+function\s+public\.golf_coachhelm_shown_reads\s*\(/i.test(sql)) return { file, sql };
  }
  throw new Error('no migration defines golf_coachhelm_shown_reads');
}

describe('the Track record reads only exposures someone saw (DF-P-04)', () => {
  it('the newest definition of golf_coachhelm_shown_reads leaves out every surface the causality runs leave out', () => {
    const { file, sql } = newestDefinition();
    const body = sql.replace(/--.*$/gm, '');
    const clause = body.match(/e\.surface\s+is\s+null\s+or\s+e\.surface\s+not\s+in\s*\(([^)]*)\)/i);
    expect(clause, file).not.toBeNull();
    const left = (clause?.[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect([...left].sort(), file).toEqual([...CAUSALITY_EXCLUDED_SURFACES].sort());
  });
});

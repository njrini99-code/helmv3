import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const RETIRED = ['admin_api_perf_log', 'admin_client_errors'] as const;
const MIGRATION = join(
  ROOT,
  'supabase/migrations/20261023151000_graveyard_orphan_admin_telemetry_tables.sql',
);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !full.endsWith('src/lib/types/database.ts')) out.push(full);
  }
  return out;
}

/**
 * Both tables had no writer and no live reader (health report #2061, item F)
 * and move to graveyard in a held migration. A query or realtime subscription
 * against either would break once that migration applies: PostgREST answers
 * PGRST205, and a postgres_changes subscription to a missing table can fail
 * the whole channel it shares.
 */
describe('retired admin telemetry tables', () => {
  it('no source file queries or subscribes to them', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'scripts'))]) {
      const text = readFileSync(file, 'utf8');
      for (const table of RETIRED) {
        const used = new RegExp(`(from\\(\\s*|table:\\s*)['"\`]${table}['"\`]`).test(text);
        if (used) offenders.push(`${relative(ROOT, file)} -> ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the held migration moves exactly these two tables and drops nothing', () => {
    const statements = readFileSync(MIGRATION, 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const moved = /ARRAY\['([^\]]+)'\]/.exec(statements)?.[1]?.split(/',\s*'/);
    expect(moved?.sort()).toEqual([...RETIRED].sort());
    expect(statements).toMatch(/SET SCHEMA graveyard/);
    expect(statements).toMatch(/ALTER PUBLICATION supabase_realtime DROP TABLE/);
    // SET SCHEMA keeps the ACL, and main's anon_surface_guard pgTAP test
    // fails on any anon or authenticated grant in graveyard.
    expect(statements).toMatch(/REVOKE ALL ON TABLE graveyard\.%I FROM anon, authenticated/);
    // The publication's own `DROP TABLE` only takes the table out of realtime.
    const withoutPublication = statements.replace(/ALTER PUBLICATION supabase_realtime DROP TABLE/g, '');
    expect(withoutPublication).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|COLUMN)\b/i);
    expect(statements).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE)\b/i);
  });

  it('the migration is registered HOLD in HELD.md', () => {
    const held = readFileSync(join(ROOT, 'supabase/migrations/HELD.md'), 'utf8');
    expect(held).toMatch(/\| `20261023151000_graveyard_orphan_admin_telemetry_tables\.sql` \| \*\*HOLD\*\* \|/);
  });
});

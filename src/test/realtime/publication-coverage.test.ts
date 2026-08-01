import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every table the app subscribes to via `postgres_changes` must be added to the
 * `supabase_realtime` publication by a migration.
 *
 * WHY THIS EXISTS. `postgres_changes` only delivers events for published
 * tables. Subscribing to an unpublished table still returns SUBSCRIBED — it
 * just never fires. No error, no warning, no console output. The feature
 * silently shows stale data and looks like it works in every code review.
 *
 * Measured 2026-08-01: 18 tables subscribed, 5 published, 13 dead — including
 * `helm_lifting_sessions` behind a component called LiveWeightRoomClient, and
 * all of baseball messaging. The publication had never been touched by a
 * migration; it was enabled by hand in the dashboard for an early set of
 * tables, and everything built afterwards was written in code and never
 * switched on. Nothing in CI could notice.
 *
 * This test is a STATIC cross-check: subscriptions found in src/ vs tables
 * added by any migration. It cannot see the live database, so it proves intent
 * is recorded, not that the migration has been applied — deliberately, since
 * CI has no production credentials. `npm run db:drift:check` covers applied-vs-
 * recorded, and this repo has a documented history of migrations that were
 * recorded but never ran.
 */

const SUBSCRIPTION_RE = /postgres_changes'?\s*,\s*\{(.{0,300}?)\}/gs;
const TABLE_RE = /table:\s*'([a-z_]+)'/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(p);
    }
  }
  return out;
}

function subscribedTables(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(join(process.cwd(), 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(SUBSCRIPTION_RE)) {
      const t = TABLE_RE.exec(m[1] ?? '');
      if (t?.[1]) found.add(t[1]);
    }
  }
  return found;
}

/** Tables any migration adds to the publication, whether by a literal
 *  `ALTER PUBLICATION ... ADD TABLE public.x` or by listing them in a
 *  DO-block array the way 20260801040000 does. */
function publishedByMigrations(): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations');
  const published = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8');
    if (!sql.includes('supabase_realtime')) continue;

    for (const m of sql.matchAll(
      /ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE\s+(?:public\.)?"?([a-z_]+)"?/gi,
    )) {
      if (m[1]) published.add(m[1]);
    }
    // DO-block form: a `wanted text[] := ARRAY[ 'a', 'b' ]` list feeding an
    // ADD TABLE. Only trust it when this file actually performs an ADD.
    if (/ALTER PUBLICATION supabase_realtime ADD TABLE/i.test(sql)) {
      const arr = /wanted\s+text\[\]\s*:=\s*ARRAY\[(.*?)\]/is.exec(sql);
      for (const q of arr?.[1]?.matchAll(/'([a-z_]+)'/g) ?? []) published.add(q[1]!);
    }
  }
  return published;
}

describe('realtime publication coverage', () => {
  it('every postgres_changes subscription has a table added by a migration', () => {
    const subscribed = subscribedTables();
    const published = publishedByMigrations();

    // Non-vacuity: if the scanners silently stop matching, this fails loudly
    // rather than passing over two empty sets.
    expect(subscribed.size).toBeGreaterThan(10);
    expect(published.size).toBeGreaterThan(10);

    const unpublished = [...subscribed].filter((t) => !published.has(t)).sort();
    expect(unpublished).toEqual([]);
  });
});

/**
 * Every `heartbeatTable` in the feature registry must be a real table.
 *
 * A heartbeat that names a table which does not exist can never resolve: the
 * RPC's `information_schema` gate returns nothing, `v_heartbeat` stays NULL,
 * and `computeFeatureStatus()` skips the staleness rule entirely. The feature
 * simply never goes amber, and NOTHING anywhere says why — it looks identical
 * to a feature whose heartbeat is healthy.
 *
 * Found 2026-08-06 while sizing migration 20260806030000 (which taught the RPC
 * to accept `baseball\_%` heartbeats at all): 18 of the 43 baseball features
 * named a heartbeat that could never resolve — 15 pointing at a table that did
 * not exist (14 distinct names) and 3 at a real table with no `created_at`.
 * Many were near-misses of a real table — `baseball_watchlist` vs
 * `baseball_watchlists`, `baseball_video_class_conflicts` vs
 * `baseball_class_conflicts` — which is what a rename with no compile-time link
 * to the schema looks like six months on. `heartbeatTable` is typed
 * `string | null`, so nothing caught any of it.
 *
 * All 18 were repointed on 2026-08-07, each to the table that feature's OWN
 * server actions write — counted from the action manifest in its own registry
 * entry, which is evidence, rather than from name similarity, which is a guess.
 * (The closest textual match for `baseball_lift_programs` was
 * `baseball_program_settings`, and it is plainly wrong; the real answer was
 * `helm_lifting_sessions`.) The three with a differently named timestamp got
 * `heartbeatColumn` instead of being repointed at an unrelated table that
 * happens to have a `created_at`, which would measure a different feature.
 *
 * What this test enforces now: no NEW drift, in either field.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';

/**
 * Table names straight out of the generated Supabase types — the same file CI
 * regenerates via `npm run db:types`, so this tracks the real schema rather
 * than a hand-kept list. Parsed rather than imported because the generated
 * `Database` type carries no runtime value.
 */
function knownTables(): Set<string> {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/types/database.ts'), 'utf8');
  const names = new Set<string>();
  // Table entries sit at a fixed indent inside `Tables: {` in the generated file.
  for (const match of src.matchAll(/^ {6}([a-z][a-z0-9_]*): \{$/gm)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/**
 * KNOWN BROKEN — registry heartbeats naming a table that does not exist.
 * Each needs someone who knows the feature to pick the right table (or to set
 * `heartbeatTable: null` deliberately, which is an honest "no signal" rather
 * than an accidental one). Shrink this list; never grow it.
 */
const HEARTBEAT_DEBT = new Set<string>([
  // Empty — all 18 were repointed on 2026-08-07, each to the table that
  // feature's OWN server actions write (counted from the action manifest in
  // its registry entry, not guessed from name similarity). `baseball_lifting`
  // went to helm_lifting_sessions after production confirmed ZERO
  // baseball_lift_* tables exist; `baseball_recruiting` went to null on
  // purpose, because its only table is baseball_players and that created_at
  // means "when the player was created", which would report a healthy
  // heartbeat for a feature nobody has touched.
]);

describe('feature registry heartbeats point at real tables', () => {
  const tables = knownTables();

  it('parsed the generated types at all (guards against a silent regex break)', () => {
    // A parser that returned an empty set would make every assertion below
    // vacuously pass in the WRONG direction — everything would look broken —
    // so assert both a plausible count and two known tables.
    expect(tables.size).toBeGreaterThan(200);
    expect(tables.has('golf_rounds')).toBe(true);
    expect(tables.has('baseball_watchlists')).toBe(true);
  });

  it('no heartbeat table is missing from the schema, outside the recorded debt', () => {
    const missing = [
      ...new Set(
        FEATURE_REGISTRY.map((f) => f.heartbeatTable).filter(
          (t): t is string => typeof t === 'string' && !tables.has(t) && !HEARTBEAT_DEBT.has(t),
        ),
      ),
    ].sort();
    expect(
      missing,
      `Feature registry heartbeatTable(s) that do not exist in the schema. A ` +
        `heartbeat naming a missing table silently disables the staleness rule ` +
        `for that feature — it can never go amber, and nothing reports why:\n` +
        missing.join('\n'),
    ).toEqual([]);
  });

  it('the recorded debt is still real — entries that got fixed must be removed', () => {
    // Stops the list becoming a graveyard that quietly permits a name someone
    // has since made valid.
    const stale = [...HEARTBEAT_DEBT].filter((t) => tables.has(t)).sort();
    expect(
      stale,
      `These are in HEARTBEAT_DEBT but the table now EXISTS. Delete them from ` +
        `the list so the guard covers them:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('every heartbeatColumn is a real column of that feature\'s heartbeat table', () => {
    // get_feature_health() gates the column against information_schema exactly
    // as it does the table, so a typo here does not error — it resolves NULL
    // and silently disables the staleness rule, the same failure the table
    // typos caused. Checked against the generated types so it fails at test
    // time rather than in production silence.
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/types/database.ts'), 'utf8');
    const bad: string[] = [];
    for (const f of FEATURE_REGISTRY) {
      if (!f.heartbeatColumn) continue;
      if (!f.heartbeatTable) {
        bad.push(`${f.key}: heartbeatColumn set but heartbeatTable is null`);
        continue;
      }
      // Narrow to that table's own generated block before looking for the column.
      const block = new RegExp(
        `^ {6}${f.heartbeatTable}: \\{[\\s\\S]*?\\n {6}\\}`,
        'm',
      ).exec(src)?.[0];
      if (!block) {
        bad.push(`${f.key}: table ${f.heartbeatTable} not found in generated types`);
      } else if (!new RegExp(`\\b${f.heartbeatColumn}\\??:`).test(block)) {
        bad.push(`${f.key}: ${f.heartbeatTable} has no column ${f.heartbeatColumn}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('the heartbeatColumn guard is non-vacuous — it finds the real ones', () => {
    // If the block regex silently matched nothing, the test above would pass
    // while checking zero features. Three features carry a column today.
    const withColumn = FEATURE_REGISTRY.filter((f) => f.heartbeatColumn);
    expect(withColumn.length).toBeGreaterThanOrEqual(3);
    expect(withColumn.map((f) => f.heartbeatColumn).sort()).toContain('entered_at');
  });

  it('every debt entry is actually referenced by the registry', () => {
    // A debt entry nothing points at is dead weight that weakens the guard.
    const referenced = new Set(
      FEATURE_REGISTRY.map((f) => f.heartbeatTable).filter((t): t is string => typeof t === 'string'),
    );
    const orphaned = [...HEARTBEAT_DEBT].filter((t) => !referenced.has(t)).sort();
    expect(
      orphaned,
      `HEARTBEAT_DEBT entries no longer referenced by any feature — remove ` +
        `them:\n${orphaned.join('\n')}`,
    ).toEqual([]);
  });
});

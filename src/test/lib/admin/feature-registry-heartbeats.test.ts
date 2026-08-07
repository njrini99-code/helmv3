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
 * to accept `baseball\_%` heartbeats at all): of the 39 distinct baseball
 * heartbeat tables in the registry, 14 name a table that does not exist in the
 * database and 2 more name a table with no `created_at` column. Several are
 * near-misses of a real table — `baseball_watchlist` vs `baseball_watchlists`,
 * `baseball_video_class_conflicts` vs `baseball_class_conflicts` — which is
 * what a rename with no compile-time link to the schema looks like six months
 * on. `heartbeatTable` is typed `string | null`, so nothing caught it.
 *
 * The broken entries are recorded below rather than guessed at. Repointing a
 * heartbeat decides what a feature's health MEANS, and a wrong guess is worse
 * than the current NULL: it makes a feature look healthy on an unrelated
 * table's writes. (`baseball_lift_programs` -> `baseball_program_settings` was
 * the closest textual match and is plainly wrong.) They need a domain call.
 *
 * What this test does enforce: no NEW drift. Add a heartbeat table that does
 * not exist and this fails.
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
const HEARTBEAT_DEBT = new Set([
  'baseball_daily_contract_acknowledgements',
  'baseball_daily_contracts',
  'baseball_insights',
  'baseball_lift_programs',
  'baseball_lineups',
  'baseball_player_actions',
  'baseball_player_development_plans',
  'baseball_player_interests',
  'baseball_recruiting_exposure',
  'baseball_recruiting_philosophy',
  'baseball_scout_packet_links',
  'baseball_timeline_acknowledgements',
  'baseball_video_class_conflicts',
  'baseball_watchlist',
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

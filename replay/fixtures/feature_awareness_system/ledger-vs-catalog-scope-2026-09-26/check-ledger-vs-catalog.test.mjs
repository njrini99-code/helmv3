// Promoted to vitest directly (D4, db-tooling-drift) — see vitest.config.ts
// for why a file under scripts/__tests__/ must be named explicitly to run.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  isUserSchema,
  parseCreatedObjects,
  parseRemovedObjects,
  reconcileLedgerToCatalog,
  reconcileUnexplainedTables,
} from '../db/check-ledger-vs-catalog.mjs';

test('parseCreatedObjects finds table, function, and policy names', () => {
  const sql = `
    -- a comment mentioning CREATE TABLE fake_table should be ignored
    create table if not exists public.golf_widgets (id uuid primary key);
    create or replace function public.get_widget_count() returns int as $$ ... $$ language sql;
    create policy "widgets_select" on golf_widgets for select using (true);
  `;
  const result = parseCreatedObjects(sql);
  assert.deepEqual(result.tables, ['golf_widgets']);
  assert.deepEqual(result.functions, ['get_widget_count']);
  assert.deepEqual(result.policies, ['widgets_select']);
});

test('reconcileLedgerToCatalog: fixture catalog missing an object created by an applied migration', () => {
  const missing = reconcileLedgerToCatalog({
    ledgerRows: [{ version: '20260101000000' }],
    localFilesByVersion: new Map([['20260101000000', '20260101000000_add_widgets.sql']]),
    fileContents: new Map([
      [
        '20260101000000_add_widgets.sql',
        'create table golf_widgets (id uuid);\ncreate policy "widgets_select" on golf_widgets for select using (true);',
      ],
    ]),
    catalogTables: new Set(['golf_widgets']),
    catalogFunctions: new Set(),
    catalogPolicies: new Set(), // the policy never actually landed in the catalog
  });
  assert.deepEqual(missing, [
    { version: '20260101000000', file: '20260101000000_add_widgets.sql', kind: 'policy', name: 'widgets_select' },
  ]);
});

test('reconcileLedgerToCatalog: passes when every parsed object is in the fixture catalog', () => {
  const missing = reconcileLedgerToCatalog({
    ledgerRows: [{ version: '20260101000000' }],
    localFilesByVersion: new Map([['20260101000000', '20260101000000_add_widgets.sql']]),
    fileContents: new Map([['20260101000000_add_widgets.sql', 'create table golf_widgets (id uuid);']]),
    catalogTables: new Set(['golf_widgets']),
    catalogFunctions: new Set(),
    catalogPolicies: new Set(),
  });
  assert.equal(missing.length, 0);
});

test('reconcileLedgerToCatalog: a ledger version with no local file is skipped (version-level drift is a different check)', () => {
  const missing = reconcileLedgerToCatalog({
    ledgerRows: [{ version: '20260101000000' }],
    localFilesByVersion: new Map(),
    fileContents: new Map(),
    catalogTables: new Set(),
    catalogFunctions: new Set(),
    catalogPolicies: new Set(),
  });
  assert.equal(missing.length, 0);
});

test('reconcileUnexplainedTables: flags a public table with no explaining migration or schema file', () => {
  const unexplained = reconcileUnexplainedTables({
    catalogTables: ['golf_widgets', 'golf_mystery'],
    allMigrationFileContents: new Map([['x.sql', 'create table golf_widgets (id uuid);']]),
    schemaFileTableNames: [],
  });
  assert.deepEqual(unexplained, ['golf_mystery']);
});

test('reconcileUnexplainedTables: a table explained by a supabase/schemas/** file is not flagged', () => {
  const unexplained = reconcileUnexplainedTables({
    catalogTables: ['golf_widgets'],
    allMigrationFileContents: new Map(),
    schemaFileTableNames: ['golf_widgets'],
  });
  assert.equal(unexplained.length, 0);
});

// ---------------------------------------------------------------------------
// Issue #1897: the nightly production drift job reported 258 "missing"
// objects, and all but two of them were present or legitimately gone. Three
// causes, one test each, plus the guard that a truly missing object still
// FAILs.
// ---------------------------------------------------------------------------

test('parseCreatedObjects skips format() placeholders from DO-block dynamic SQL', () => {
  // A migration that builds policies per table with EXECUTE format(...) —
  // `%1$s_coach_select_team` and `%I` are templates, not object names.
  const sql = `
    do $$ begin
      execute format('create policy "%1$s_coach_select_team" on public.%1$s for select using (true)', t);
      execute format('create policy %I on public.golf_rounds for select using (true)', p);
    end $$;
    create policy "real_policy" on golf_widgets for select using (true);
  `;
  assert.deepEqual(parseCreatedObjects(sql).policies, ['real_policy']);
});

test('parseRemovedObjects finds schema-qualified, IF EXISTS, list and rename removals', () => {
  const sql = `
    DROP FUNCTION IF EXISTS helm_private.prevent_active_round_stranding();
    drop function if exists public.update_player_stats_cache(uuid), public.update_round_stats_cache_with_sg(uuid, numeric(10,2));
    drop table if exists public.golf_old_a, golf_old_b cascade;
    drop policy if exists "golf_shots_select_own" on public.golf_shots;
    alter table public.golf_before rename to golf_after;
    alter policy "p_before" on public.golf_widgets rename to "p_after";
  `;
  const removed = parseRemovedObjects(sql);
  assert.deepEqual(removed.functions.sort(), [
    'prevent_active_round_stranding',
    'update_player_stats_cache',
    'update_round_stats_cache_with_sg',
  ]);
  assert.deepEqual(removed.tables.sort(), ['golf_before', 'golf_old_a', 'golf_old_b']);
  assert.deepEqual(removed.policies.sort(), ['golf_shots_select_own', 'p_before']);
});

test('reconcileLedgerToCatalog: an object a LATER applied migration drops is not missing', () => {
  const missing = reconcileLedgerToCatalog({
    ledgerRows: [{ version: '20260101000000' }, { version: '20260201000000' }],
    localFilesByVersion: new Map([
      ['20260101000000', '20260101000000_create.sql'],
      ['20260201000000', '20260201000000_drop.sql'],
    ]),
    fileContents: new Map([
      ['20260101000000_create.sql', 'create or replace function helm_private.old_guard() returns trigger as $$ $$ language plpgsql;'],
      ['20260201000000_drop.sql', 'DROP FUNCTION IF EXISTS helm_private.old_guard();'],
    ]),
    catalogTables: new Set(),
    catalogFunctions: new Set(),
    catalogPolicies: new Set(),
  });
  assert.deepEqual(missing, []);
});

test('reconcileLedgerToCatalog: a drop that is EARLIER than the create, or never applied, excuses nothing', () => {
  const missing = reconcileLedgerToCatalog({
    // 20260301 is a local file the ledger has not applied.
    ledgerRows: [{ version: '20260101000000' }, { version: '20260201000000' }],
    localFilesByVersion: new Map([
      ['20260101000000', '20260101000000_drop_first.sql'],
      ['20260201000000', '20260201000000_create.sql'],
      ['20260301000000', '20260301000000_unapplied_drop.sql'],
    ]),
    fileContents: new Map([
      ['20260101000000_drop_first.sql', 'drop function if exists public.baseball_log_staff_change();'],
      ['20260201000000_create.sql', 'create or replace function public.baseball_log_staff_change() returns trigger as $$ $$ language plpgsql;'],
      ['20260301000000_unapplied_drop.sql', 'drop function if exists public.baseball_log_staff_change();'],
    ]),
    catalogTables: new Set(),
    catalogFunctions: new Set(),
    catalogPolicies: new Set(),
  });
  assert.deepEqual(missing, [
    { version: '20260201000000', file: '20260201000000_create.sql', kind: 'function', name: 'baseball_log_staff_change' },
  ]);
});

test('isUserSchema: objects in helm_debug, helm_jobs, helm_private, graveyard and storage count; system schemas do not', () => {
  for (const s of ['public', 'helm_debug', 'helm_jobs', 'helm_private', 'graveyard', 'storage']) {
    assert.equal(isUserSchema(s), true, s);
  }
  for (const s of ['pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_3']) {
    assert.equal(isUserSchema(s), false, s);
  }
});

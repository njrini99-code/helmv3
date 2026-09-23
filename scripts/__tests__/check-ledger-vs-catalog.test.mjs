// Promoted to vitest directly (D4, db-tooling-drift) — see vitest.config.ts
// for why a file under scripts/__tests__/ must be named explicitly to run.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  parseCreatedObjects,
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

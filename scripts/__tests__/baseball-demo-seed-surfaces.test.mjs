import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * #414 — demo seed must cover production-critical team-ops surfaces.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SEED_FILE = join(REPO_ROOT, 'scripts', 'seed-rini-baseball-demo.ts');

const REQUIRED_TABLES = [
  'baseball_announcements',
  'baseball_travel_itineraries',
  'baseball_travel_expenses',
  'baseball_tasks',
  'baseball_task_assignments',
];

test('rini baseball demo seed covers team-ops surfaces', async () => {
  const text = await readFile(SEED_FILE, 'utf8');
  for (const table of REQUIRED_TABLES) {
    assert.match(text, new RegExp(`upsert\\('${table}'`));
  }
  assert.match(text, /can_manage_documents:\s*true/);
});

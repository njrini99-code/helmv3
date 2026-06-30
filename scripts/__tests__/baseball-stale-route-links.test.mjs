import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCAN_ROOTS = [
  join(REPO_ROOT, 'src'),
  join(REPO_ROOT, 'e2e'),
];
const ALLOWLIST = new Set([
  join(REPO_ROOT, 'src/lib/baseball/stats-route-aliases.ts'),
  join(
    REPO_ROOT,
    'src/app/baseball/(dashboard)/dashboard/stats/games/new/page.tsx',
  ),
  join(
    REPO_ROOT,
    'src/app/baseball/(dashboard)/dashboard/stats/games/new/error.tsx',
  ),
]);

const STALE_HREF = /\/baseball\/dashboard\/stats\/games\/new(?![\w-])/;

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      await walk(full, acc);
    } else if (/\.(tsx?|jsx?|mjs|cjs|md)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test('app and e2e do not link to stale /stats/games/new (#378)', async () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    const files = await walk(root);
    for (const file of files) {
      if (ALLOWLIST.has(file)) continue;
      const text = await readFile(file, 'utf8');
      if (STALE_HREF.test(text)) offenders.push(file.replace(`${REPO_ROOT}/`, ''));
    }
  }
  assert.equal(
    offenders.length,
    0,
    `stale /stats/games/new links found in:\n${offenders.join('\n')}`,
  );
});

#!/usr/bin/env node
/**
 * Contract test for scripts/route-crawler-baseball.mjs (#373).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const script = join(resolve(import.meta.dirname, '..'), 'route-crawler-baseball.mjs');

test('baseball route crawler script exists and lists core dashboard routes', async () => {
  const text = await readFile(script, 'utf8');
  assert.match(text, /announcements/);
  assert.match(text, /stats-center/);
  assert.match(text, /E2E_BASEBALL_COACH_EMAIL/);
  assert.match(text, /nav-registry/);
});

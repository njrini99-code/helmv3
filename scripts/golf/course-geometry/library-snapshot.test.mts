import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeScorecard, readAllRows } from './library-snapshot.mts';

test('retains all holes beyond the API cap, including a lower server page cap', async () => {
  const source = Array.from({ length: 1218 }, (_, id) => ({ id: String(id) }));
  const rows = await readAllRows('holes', async (from, to) => ({
    data: source.slice(from, Math.min(to + 1, from + 300)), error: null, count: source.length,
  }));
  assert.deepEqual(rows, source);
});

test('refuses partial pages, changing counts, duplicated IDs and failed reads', async () => {
  await assert.rejects(readAllRows('holes', async () => ({ data: [], error: null, count: 18 })), /incomplete/);
  await assert.rejects(readAllRows('holes', async from => ({ data: [{ id: String(from) }], error: null, count: from ? 3 : 2 })), /changed/);
  await assert.rejects(readAllRows('holes', async () => ({ data: [{ id: 'same' }], error: null, count: 2 })), /duplicate/);
  await assert.rejects(readAllRows('holes', async () => ({ data: null, error: { message: 'offline' }, count: null })), /offline/);
  await assert.rejects(readAllRows('holes', async () => ({ data: [], error: null, count: null })), /completeness/);
});

test('only complete ordered scorecards qualify; never fill gaps or coerce unknowns', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 400 }));
  assert.equal(completeScorecard(holes, 18), true);
  assert.equal(completeScorecard(holes.slice(1), 18), false);
  assert.equal(completeScorecard(holes.map(h => ({ ...h, number: 1 })), 18), false);
  assert.equal(completeScorecard(holes.map(h => ({ ...h, par: 0 })), 18), false);
  assert.equal(completeScorecard(holes.map(h => ({ ...h, yardage: Number.NaN })), 18), false);
});

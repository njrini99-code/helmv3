import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_ACTION_CATEGORY, bridgeActionRecords, syncBridgeActions, checkRegistry } from '../registry.mjs';

const pages = [
  { id: 'P007', name: 'Messages', bridgeNamespace: 7 },
  { id: 'P017', name: 'Practice', bridgeNamespace: 17 },
];

test('category 25: three rows per page, -02 reserved, IDs from the namespace (D4)', () => {
  const recs = bridgeActionRecords(pages);
  assert.deepEqual(
    recs.map((r) => [r.id, r.page, r.name, r.status]),
    [
      [72501, 'P007', 'OPEN_IN_BRIDGE', 'implemented'],
      [72502, 'P007', 'SIGNAL_THE_BRIDGE_READS', 'reserved'],
      [72503, 'P007', 'CONTEXT_PACK', 'implemented'],
      [172501, 'P017', 'OPEN_IN_BRIDGE', 'implemented'],
      [172502, 'P017', 'SIGNAL_THE_BRIDGE_READS', 'reserved'],
      [172503, 'P017', 'CONTEXT_PACK', 'implemented'],
    ],
  );
  assert.ok(recs.every((r) => r.category === BRIDGE_ACTION_CATEGORY && !r.chCode));
});

test('sync adds the missing rows, keeps IDs, never re-mints a tombstone, and is idempotent', () => {
  const existing = [{ id: 70601, page: 'P007', category: 6, item: 1, name: 'X', chCode: 'CH-7001', meaning: 'x', status: 'implemented' }];
  const once = syncBridgeActions(existing, pages, [{ id: 172502, removedAt: '2026-11-25', reason: 'test' }]);
  assert.equal(once.length, 1 + 5);
  assert.ok(!once.some((r) => r.id === 172502));
  assert.deepEqual(syncBridgeActions(once, pages, [{ id: 172502 }]), once);
  const stale = once.map((r) => (r.id === 72502 ? { ...r, meaning: 'old', status: 'implemented' } : r));
  const fixed = syncBridgeActions(stale, pages, []).find((r) => r.id === 72502);
  assert.equal(fixed.status, 'reserved');
  assert.notEqual(fixed.meaning, 'old');
});

test('drift list 8: a page whose only IDs are category 25 has no Bridge ID of its own', () => {
  const m = { id: 'P017', slug: 'practice', name: 'Practice', bridgeNamespace: 17, status: { docs: 'missing' }, semanticFeatures: [] };
  const bridge = bridgeActionRecords([m]);
  const v = checkRegistry({
    manifests: [m],
    bridge,
    tombstones: [],
    rows: [],
    map: { kindDefaults: {}, overrides: {} },
    features: new Set(),
    progressMd: '',
    heldMd: '',
    exists: () => true,
    read: () => 'test names 172501 172503',
    migrations: {},
  });
  assert.ok(v.some((x) => x.includes('P017 has no Bridge ID of its own')), v.join('\n'));
});

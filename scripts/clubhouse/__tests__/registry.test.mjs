import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeId, decodeBridgeId, syncBridge, checkRegistry, checkContract, checkHeldPlan, parseCatalogRows, nameFrom, HOLD_HEADER, CATEGORY_COUNT } from '../registry.mjs';

const map = {
  categories: {},
  kindDefaults: { 0: { category: 6, kind: 'Error toast' }, 3: { category: 4, kind: 'Empty' }, 9: { category: 7, kind: 'Network' } },
  overrides: { 'CH-7002': { category: 8, why: 'not on team' } },
};
const catalog = { 'docs/clubhouse/catalog/messages.md': '| CH-7001 | Sending fails | x |\n| CH-7002 | Not on team | x |\n| CH-7301 | No conversations | x |\n' };
const rows = parseCatalogRows(catalog);
const page = (over = {}) => ({
  id: 'P007', name: 'Messages', slug: 'messages', bridgeNamespace: 7, routes: ['/golf/dashboard/messages'], roles: ['coach'], semanticFeatures: ['team_communications'], progressRow: 'Messages',
  status: { design: 'approved', implementation: 'in_progress', contract: 'partial', bridge: 'reserved', data: 'existing', verification: 'partial', docs: 'missing' },
  design: { desktop: ['d.html'], phone: [] }, implementation: { root: 'src/x' }, catalog: 'docs/clubhouse/catalog/messages.md', actions: [], held: [], ...over,
});
const progress = '<!-- clubhouse:screens:start -->\n| Screen | Route | a | b | c | d | e | f | g | h | i | j | k |\n| --- |\n| Messages | /m | done | done | done | doing | doing | done | doing | doing | doing | doing | doing |\n<!-- clubhouse:screens:end -->';
const ctx = (over = {}) => {
  const manifests = over.manifests ?? [page()];
  const bridge = over.bridge ?? syncBridge({ existing: [], rows, manifests, map, tombstones: [], used: new Set(['CH-7001']) });
  return { manifests, bridge, tombstones: [], rows, map, features: new Set(['team_communications']), progressMd: progress, heldMd: '', migrations: {}, exists: () => true, read: () => '', ...over, ...(over.bridge ? {} : { bridge }) };
};

test('Bridge IDs are namespace, two-digit category, two-digit item, and decode from the right (D-68)', () => {
  assert.equal(bridgeId(7, 6, 12), 70612);
  assert.equal(bridgeId(12, 6, 12), 120612);
  assert.deepEqual(decodeBridgeId(120612), { ns: 12, category: 6, item: 12 });
});

test('sync mints by category and marks rows used in code as implemented', () => {
  const b = syncBridge({ existing: [], rows, manifests: [page()], map, tombstones: [], used: new Set(['CH-7001']) });
  assert.deepEqual(b.map((r) => [r.chCode, r.id, r.status]), [['CH-7301', 70401, 'reserved'], ['CH-7001', 70601, 'implemented'], ['CH-7002', 70801, 'reserved']]);
  assert.equal(b.find((r) => r.chCode === 'CH-7001').name, 'SENDING_FAILS');
});

test('sync is append-only: an existing ID survives a category change, and new rows skip tombstones', () => {
  const first = syncBridge({ existing: [], rows, manifests: [page()], map, tombstones: [], used: new Set() });
  const moved = { ...map, overrides: { ...map.overrides, 'CH-7001': { category: 7, why: 'x' } } };
  const more = parseCatalogRows({ 'docs/clubhouse/catalog/messages.md': catalog['docs/clubhouse/catalog/messages.md'] + '| CH-7003 | Editing fails | x |\n' });
  const again = syncBridge({ existing: first, rows: more, manifests: [page()], map: moved, tombstones: [{ id: 70602, removedAt: '2026-09-29', reason: 'x' }], used: new Set() });
  assert.equal(again.find((r) => r.chCode === 'CH-7001').id, 70601);
  assert.equal(again.find((r) => r.chCode === 'CH-7003').id, 70603);
});

test('a clean registry passes', () => {
  assert.deepEqual(checkRegistry(ctx()), []);
});

test('duplicate page ids, a namespace that is not the page number, and unknown features fail', () => {
  const v = checkRegistry(ctx({ manifests: [page(), page({ slug: 'm2', bridgeNamespace: 8, semanticFeatures: ['nope'] })] }));
  assert.ok(v.some((x) => x.includes('used twice')));
  assert.ok(v.some((x) => x.includes('must use namespace 7')));
  assert.ok(v.some((x) => x.includes('nope is not in memory/registry.yml')));
});

test('a catalog row without a Bridge ID, and a category map that disagrees with a minted ID, fail', () => {
  const c = ctx();
  const missing = checkRegistry({ ...c, bridge: c.bridge.filter((r) => r.chCode !== 'CH-7301') });
  assert.ok(missing.some((x) => x.includes('CH-7301 has no Bridge ID')));
  const moved = checkRegistry({ ...c, map: { ...map, overrides: { ...map.overrides, 'CH-7001': { category: 7, why: 'x' } } } });
  assert.ok(moved.some((x) => x.includes('IDs are permanent')));
});

test('a tombstoned ID in use fails', () => {
  const c = ctx();
  const v = checkRegistry({ ...c, tombstones: [{ id: 70601, removedAt: '2026-09-29', reason: 'x' }] });
  assert.ok(v.some((x) => x.includes('reuses a tombstoned ID')));
});

test('docs "missing" is refused once a page claims completion', () => {
  const v = checkRegistry(ctx({ manifests: [page({ status: { ...page().status, implementation: 'complete' } })] }));
  assert.ok(v.some((x) => x.includes('status.docs is missing')));
});

test('a contract answers every category; loading, empty, error, offline, permission and a11y are never N/A (D-69)', () => {
  const bridge = syncBridge({ existing: [], rows, manifests: [page()], map, tombstones: [], used: new Set() });
  let md = '';
  for (let c = 1; c <= CATEGORY_COUNT; c += 1) {
    const ids = bridge.filter((r) => r.category === c).map((r) => r.id);
    md += `## ${String(c).padStart(2, '0')} — x\n` + (ids.length || c === 2 || c === 7 || c === 18 ? `Status: DEFINED\nContracts: ${ids.join(', ') || '12201'}\n` : `Status: N/A — no such behaviour\n`);
  }
  const all = [...bridge, { id: 12201, page: 'P001', category: 22, item: 1 }];
  assert.deepEqual(checkContract({ m: page(), md, bridge: all, file: 'C.md' }), []);
  const bad = md.replace(/## 04 — x\nStatus: DEFINED\nContracts: 70401\n/, '## 04 — x\nStatus: N/A — none\n').replace(/## 25 — x\nStatus: N\/A — no such behaviour\n/, '');
  const v = checkContract({ m: page(), md: bad, bridge: all, file: 'C.md' });
  assert.ok(v.some((x) => x.includes("category 04 can't be N/A")));
  assert.ok(v.some((x) => x.includes('70401')));
  assert.ok(v.some((x) => x.includes('category 25 is missing')));
});

test('a held migration needs the exact header, a HOLD row in HELD.md and a link to its plan', () => {
  const plan = 'docs/clubhouse/held/data/p.md';
  const files = { [plan]: 'Status: HELD\nMigration: supabase/migrations/1_x.sql\nWRITTEN — HOLD — NOT APPLIED\n', 'supabase/migrations/1_x.sql': '-- written\n' };
  const read = (p) => files[p];
  const exists = (p) => p in files;
  const v = checkHeldPlan({ plan, at: 'm', exists, read, heldMd: '' });
  assert.ok(v.some((x) => x.includes('first line must be')));
  assert.ok(v.some((x) => x.includes('no row for 1_x.sql')));
  files['supabase/migrations/1_x.sql'] = `${HOLD_HEADER}\n`;
  assert.deepEqual(checkHeldPlan({ plan, at: 'm', exists, read, heldMd: `| \`1_x.sql\` | **HOLD** | see ${plan} | d |` }), []);
});

test('an orphan HOLD-headed migration that no page claims fails', () => {
  const v = checkRegistry(ctx({ migrations: { 'supabase/migrations/9_y.sql': `${HOLD_HEADER}\nselect 1;` } }));
  assert.ok(v.some((x) => x.includes('no page\'s held plan names it')));
});

test('names are readable constants', () => {
  assert.equal(nameFrom('A message’s send can’t be confirmed (phone)'), 'A_MESSAGES_SEND_CANT_BE_CONFIRMED');
});

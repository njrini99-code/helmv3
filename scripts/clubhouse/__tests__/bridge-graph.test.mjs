import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBridgeGraph, buildSurfaces, catalogRowsByCode, parseFindings, parseNumberChecks, tableCells, renderGraph } from '../bridge-graph.mjs';

const manifest = (over = {}) => ({
  id: 'P007',
  name: 'Messages',
  slug: 'messages',
  bridgeNamespace: 7,
  routes: ['/golf/dashboard/messages'],
  roles: ['coach', 'player'],
  status: { design: 'approved', implementation: 'in_progress', contract: 'complete', bridge: 'reserved', data: 'existing', verification: 'partial', docs: 'current' },
  catalog: 'docs/clubhouse/catalog/messages.md',
  screens: [{ route: '/golf/dashboard/messages', audience: 'shared', coach: 'src/clubhouse/screens/messages/Messages.tsx#Messages' }],
  actions: [
    { id: 'ACT-P007-SEND-MESSAGE', label: 'Send a message', component: 'src/clubhouse/screens/messages/thread/Composer.tsx#Composer', handler: 'api.send', service: 'src/hooks/golf/use-golf-messages.ts#sendMessage', data: ['golf_messages'], bridge: { success: 70901, failure: 70603, empty: null }, tests: ['src/clubhouse/__tests__/messages.test.tsx'] },
  ],
  held: ['docs/clubhouse/held/features/files.md'],
  ...over,
});
const shell = { id: 'P001', name: 'Shell', slug: 'shell', bridgeNamespace: 1, status: {}, screens: [{ route: '/golf/dashboard/whats-new', audience: 'shared', coach: 'src/clubhouse/screens/whats-new/WhatsNew.tsx#WhatsNew' }] };
const bridge = [
  { id: 70603, page: 'P007', category: 6, item: 3, name: 'SENDING_A_MESSAGE_THROWS', chCode: 'CH-7004', meaning: 'Sending a message throws', status: 'implemented', catalog: 'docs/clubhouse/catalog/messages.md' },
  { id: 70901, page: 'P007', category: 9, item: 1, name: 'SENT', chCode: 'CH-7101', meaning: 'Sent', status: 'reserved', catalog: 'docs/clubhouse/catalog/messages.md' },
  { id: 10703, page: 'P001', category: 7, item: 3, name: 'OFFLINE', chCode: 'CH-1903', meaning: 'Offline', status: 'implemented', catalog: 'docs/clubhouse/catalog/shell.md' },
  { id: 70101, page: 'P007', category: 1, item: 1, name: 'THREAD_READY', meaning: 'The thread opens', status: 'implemented', where: 'src/clubhouse/screens/messages/Messages.tsx#Messages; `src/clubhouse/data/messages.ts`', tests: ['src/clubhouse/__tests__/messages.test.tsx'] },
];
const catalogs = {
  'docs/clubhouse/catalog/messages.md': [
    '| # | When | They see | How | Test |',
    '| --- | --- | --- | --- | --- |',
    '| CH-7004 | Sending a message throws | "Couldn\'t send" \\| Retry | `api.send` | messages.test › CH-7004 |',
    '| CH-7101 | Sent, in a short form | The bubble | `api.send` | existing |',
  ].join('\n'),
};
const files = {
  'docs/clubhouse/held/features/files.md': 'Status: HOLD\nMigration: 20261026090000_files.sql\n',
  'docs/clubhouse/pages/P007-messages/CONTRACT.md': 'From the shell (P001): 10703 CH-1903. Its own: 70603. Not an ID: 99999, CH-10703.\n',
};
const io = { read: (p) => files[p], exists: (p) => p in files || p === 'docs/clubhouse/pages/P007-messages/PAGE.md' };

const graph = (over = {}) =>
  buildBridgeGraph({
    manifests: [manifest(), shell],
    bridge,
    tombstones: [{ id: 70602, removedAt: '2026-11-01', reason: 'merged', replacement: 70603 }],
    catalogs,
    codeIndex: new Map([['CH-7004', new Set(['src/clubhouse/screens/messages/thread/Composer.tsx', 'src/clubhouse/lib/a.ts'])]]),
    surfaceIndex: new Map([
      ['messages.thread', new Set(['src/clubhouse/screens/messages/thread/Thread.tsx'])],
      ['messages.rail', new Set(['src/clubhouse/data/messages.ts'])],
      ['shell.bell', new Set(['src/clubhouse/shell/Bell.tsx'])],
      ['ask.figures', new Set(['src/clubhouse/data/ask.ts'])],
    ]),
    auditFiles: {
      'docs/clubhouse/audit/2026-11-13/findings.jsonl': [
        JSON.stringify({ id: 'F-0002', page: 'P007', screen: 'Thread', severity: 'S2', dimension: 'correctness', standard: 'CO-01', title: 'Wrong count', repro: 'Open', fix: 'Count', files: ['a.ts'], tier: 'W', observed: 'long text kept out of the graph' }),
        '',
        JSON.stringify({ id: 'F-0001', page: 'P002', screen: 'Home', severity: 'S1', dimension: 'correctness', standard: 'CO-03', title: 'Trips', repro: 'r', fix: 'f', files: [], tier: 'C', withdrawn: true }),
      ].join('\n'),
      'docs/clubhouse/audit/2026-11-13/numbers/P007-messages.md': '# P007\n\n| Shown (coach) | Expected | Verdict | Query |\n| --- | --- | --- | --- |\n| "3 unread" | 3 | Right | unread CTE |\n\nAfter the table.\n',
    },
    ...io,
    ...over,
  });

test('tableCells keeps an escaped pipe inside its cell', () => {
  assert.deepEqual(tableCells('| a | b \\| c | d |'), ['a', 'b | c', 'd']);
});

test('catalog rows are read by their own header, whatever it calls They see', () => {
  const rows = catalogRowsByCode({ x: '| # | What | How | Test |\n| --- |\n| CH-1001 | Thing | `h` | existing |', y: '| # | When | They feel | How | Test |\n| CH-2001 | Tap | A tick | `p` | t |' });
  assert.deepEqual(rows.get('CH-1001'), { when: 'Thing', how: '`h`', test: 'existing' });
  assert.deepEqual(rows.get('CH-2001'), { when: 'Tap', theySee: 'A tick', how: '`p`', test: 't' });
});

test('the graph carries pages with their gates, docs, held plans and screens', () => {
  const g = graph();
  assert.equal(g.pages.P007.name, 'Messages');
  assert.equal(g.pages.P007.gates.contract, 'complete');
  assert.equal(g.pages.P007.docs.PAGE, 'docs/clubhouse/pages/P007-messages/PAGE.md');
  assert.equal(g.pages.P007.docs.WIRING, null);
  assert.deepEqual(g.pages.P007.held, [{ plan: 'docs/clubhouse/held/features/files.md', status: 'HOLD', migration: '20261026090000_files.sql' }]);
  assert.equal(g.pages.P007.screens[0].audience, 'shared');
});

test("a page borrows the other pages' IDs its contract names, and only those", () => {
  const g = graph();
  assert.deepEqual(g.pages.P007.borrows, [10703]);
  assert.deepEqual(g.pages.P001.borrows, []);
});

test('actions keep only the outcomes they name, and their tables', () => {
  const a = graph().actions['ACT-P007-SEND-MESSAGE'];
  assert.deepEqual(a.outcomes, { success: 70901, failure: 70603 });
  assert.deepEqual(a.tables, ['golf_messages']);
  assert.equal(a.page, 'P007');
});

test('ids resolve to their code, row, paths and tests; chIndex and codeIndex point both ways', () => {
  const g = graph();
  assert.equal(g.ids[70603].ch, 'CH-7004');
  assert.deepEqual(g.ids[70603].catalogRow, { theySee: '"Couldn\'t send" | Retry', how: '`api.send`', test: 'messages.test › CH-7004' });
  assert.equal(g.ids[70901].catalogRow.when, 'Sent, in a short form', 'a row whose When differs from the meaning keeps it');
  assert.deepEqual(g.ids[70101].where, ['src/clubhouse/screens/messages/Messages.tsx', 'src/clubhouse/data/messages.ts']);
  assert.deepEqual(g.ids[70101].tests, ['src/clubhouse/__tests__/messages.test.tsx']);
  assert.equal(g.chIndex['CH-7004'], 70603);
  assert.deepEqual(g.codeIndex['CH-7004'], ['src/clubhouse/lib/a.ts', 'src/clubhouse/screens/messages/thread/Composer.tsx']);
  assert.deepEqual(g.tombstones[70602], { removedAt: '2026-11-01', replacement: 70603 });
});

test('surfaces belong to the page whose folder names them, then by their first word', () => {
  const s = graph().surfaces;
  assert.equal(s['messages.thread'].page, 'P007');
  assert.equal(s['messages.rail'].page, 'P007', 'a data file takes the page its prefix points at');
  assert.equal(s['shell.bell'].page, 'P001', 'the frame belongs to the shell');
  assert.equal(s['ask.figures'].page, null, 'no page is guessed');
});

test('buildSurfaces falls back to a page whose slug is the prefix', () => {
  const s = buildSurfaces({ surfaceIndex: new Map([['messages.x', new Set(['src/lib/x.ts'])]]), manifests: [manifest()] });
  assert.equal(s['messages.x'].page, 'P007');
});

test('findings and number checks come from every audit', () => {
  const g = graph();
  assert.deepEqual(Object.keys(g.findings), ['F-0001', 'F-0002']);
  assert.equal(g.findings['F-0001'].status, 'withdrawn');
  assert.equal(g.findings['F-0002'].status, 'open');
  assert.equal(g.findings['F-0002'].audit, '2026-11-13');
  assert.equal(g.findings['F-0002'].observed, undefined, 'evidence prose stays in the audit');
  assert.deepEqual(g.numberChecks.P007, [{ shown: '"3 unread"', expected: '3', verdict: 'Right', query: 'unread CTE', audit: '2026-11-13' }]);
});

test('parseFindings names the line that is not JSON', () => {
  assert.throws(() => parseFindings('{"id":"F-1"}\nnot json', 'a1'), /a1 findings.jsonl line 2/);
});

test('parseNumberChecks stops at the end of a table', () => {
  assert.equal(parseNumberChecks('| Shown | E | V | Q |\n| --- |\n| a | b | c | d |\ntext\n| x | y | z | w |', 'a').length, 1);
});

test('the file is one record per line and reads back as the same graph', () => {
  const g = graph();
  const text = renderGraph(g);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(g)));
  assert.ok(text.split('\n').some((l) => l.startsWith('  "70603": {"page":"P007"')));
  assert.match(text, /"controls": \{\}/);
});

test('the graph is deterministic and its hash follows its content', () => {
  const a = renderGraph(graph());
  assert.equal(renderGraph(graph()), a);
  assert.doesNotMatch(a, /builtAt|"sha"/);
  const changed = graph({ bridge: bridge.map((r) => (r.id === 70603 ? { ...r, meaning: 'Sending fails' } : r)) });
  assert.notEqual(changed.contentHash, graph().contentHash);
  assert.match(graph().contentHash, /^[0-9a-f]{16}$/);
});

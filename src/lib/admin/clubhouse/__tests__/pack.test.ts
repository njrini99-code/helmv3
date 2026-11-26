/**
 * The context pack (plan §9.1): target resolution, the seven parts from the graph, pluggable live sources that say
 * "No signal yet" by default, pseudonymous people by default (D7), and one `bridge-pack/v1` JSON block.
 */
import { describe, it, expect } from 'vitest';
import { fixtureGraph } from './fixtures';
import type { BridgeGraph } from '../graph';
import {
  DEFAULT_LIVE_SOURCES,
  PACK_SCHEMA,
  buildPack,
  noSignalSource,
  packFileName,
  renderPackMarkdown,
  resolvePackTarget,
  withSources,
  type PackLiveSource,
} from '../pack';
import { searchBridgeGraph } from '../search';

function graph(): BridgeGraph {
  const g = fixtureGraph();
  g.pages.P007 = {
    ...g.pages.P007!,
    routes: ['/golf/dashboard/messages'],
    roles: ['coach', 'player'],
    catalog: 'docs/clubhouse/catalog/messages.md',
    docs: { CONTRACT: 'docs/clubhouse/pages/P007-messages/CONTRACT.md', WIRING: null },
  };
  g.ids['70603']!.where = ['src/clubhouse/screens/messages/Composer.tsx#send'];
  g.ids['70603']!.tests = ['src/clubhouse/__tests__/messages.test.tsx'];
  g.ids['70603']!.catalogRow = { theySee: 'A toast: not sent', how: 'chReport', test: 'unit' };
  g.actions['ACT-P007-SEND-MESSAGE']!.component = 'src/clubhouse/screens/messages/Composer.tsx#Composer';
  g.controls = { 'CTL-P007-014': { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'], file: 'src/clubhouse/screens/messages/Composer.tsx:120' } };
  return g;
}

describe('resolvePackTarget', () => {
  const g = graph();
  it.each([
    ['P007', 'page', 'P007'],
    ['p007', 'page', 'P007'],
    ['CTL-P007-014', 'control', 'CTL-P007-014'],
    ['act-p007-send-message', 'action', 'ACT-P007-SEND-MESSAGE'],
    ['70603', 'code', '70603'],
    ['CH-7004', 'code', '70603'],
  ])('%s is a %s', (raw, kind, key) => {
    expect(resolvePackTarget(g, raw)).toEqual({ kind, key, page: 'P007' });
  });

  it('anything else is null', () => {
    for (const raw of ['', 'P999', 'CTL-P007-999', 'ACT-NOPE', '99999', 'CH-1', 'x'.repeat(90)]) expect(resolvePackTarget(g, raw)).toBeNull();
  });
});

describe('buildPack', () => {
  it('a code pack: the contract row, the actions that end in it, the controls that start them, the code and tests', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'CH-7004')!);
    expect(pack.schema).toBe(PACK_SCHEMA);
    expect(pack.people).toBe('pseudonymous');
    expect(pack.contractRows.ids.map((i) => i.id)).toEqual([70603]);
    expect(pack.contractRows.ids[0]!.theySee).toBe('A toast: not sent');
    expect(pack.contractRows.actions.map((a) => a.id)).toEqual(['ACT-P007-SEND-MESSAGE']);
    expect(pack.contractRows.controls.map((c) => c.id)).toEqual(['CTL-P007-014']);
    expect(pack.code.files).toEqual(['src/clubhouse/screens/messages/Composer.tsx']);
    expect(pack.code.testCommand).toBe('npm run test:file -- src/clubhouse/__tests__/messages.test.tsx');
    expect(pack.code.tables).toEqual(['golf_messages']);
    expect(pack.read).toContain('docs/clubhouse/pages/P007-messages/CONTRACT.md');
    expect(pack.read).toContain('.claude/rules/clubhouse.md');
    expect(pack.reproduce.preview).toBe('/clubhouse-preview/messages');
    expect(pack.done.codes).toEqual(['70603 CH-7004 stops firing']);
    expect(pack.ask.question).toContain('Sending a message throws');
  });

  it('every default evidence source says No signal yet; a failing source says failed, not empty', async () => {
    const g = graph();
    const t = resolvePackTarget(g, '70603')!;
    const pack = await buildPack(g, t);
    expect(pack.evidence.map((e) => e.state)).toEqual(DEFAULT_LIVE_SOURCES.map(() => 'no-signal'));
    const broken: PackLiveSource = { id: 'counters', title: 'Counts', read: async () => Promise.reject(new Error('boom')) };
    const withBroken = await buildPack(g, t, { sources: withSources(DEFAULT_LIVE_SOURCES, [broken]) });
    expect(withBroken.evidence.find((e) => e.source === 'counters')).toMatchObject({ state: 'failed', note: 'boom' });
    expect(withBroken.evidence).toHaveLength(DEFAULT_LIVE_SOURCES.length);
  });

  it('passes the names choice to the sources and records it', async () => {
    const g = graph();
    const seen: boolean[] = [];
    const probe: PackLiveSource = { id: 'probe', title: 'Probe', read: async (_t, _g, ctx) => (seen.push(ctx.includeNames), { source: 'probe', title: 'Probe', state: 'ok', note: '' }) };
    const off = await buildPack(g, resolvePackTarget(g, 'P007')!, { sources: [probe] });
    const on = await buildPack(g, resolvePackTarget(g, 'P007')!, { sources: [probe], includeNames: true });
    expect(seen).toEqual([false, true]);
    expect(off.people).toBe('pseudonymous');
    expect(on.people).toBe('names');
  });

  it('a page pack lists its failure states first and every action', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'P007')!);
    expect(pack.contractRows.ids[0]!.category.startsWith('06')).toBe(true);
    expect(pack.contractRows.ids.some((i) => i.status === 'deprecated')).toBe(false);
    expect(pack.contractRows.actions.map((a) => a.id)).toEqual(['ACT-P007-SEND-MESSAGE']);
  });

  it('a control pack takes its action’s outcomes', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'CTL-P007-014')!);
    expect(pack.contractRows.ids.map((i) => i.id)).toEqual([70603, 70901]);
  });
});

describe('renderPackMarkdown', () => {
  it('has the seven parts and one bridge-pack/v1 JSON block that parses back to the pack', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'ACT-P007-SEND-MESSAGE')!, { sources: [noSignalSource('x', 'X', 'x')] });
    const md = renderPackMarkdown(pack);
    for (const h of ['## 1. The ask', '## 2. The contract', '## 3. The evidence', '## 4. The code', '## 5. What to read', '## 6. How to reproduce', '## 7. Done means']) {
      expect(md).toContain(h);
    }
    const blocks = md.match(/```json\n([\s\S]*?)\n```/g) ?? [];
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0]!.replace(/^```json\n/, '').replace(/\n```$/, ''))).toEqual(pack);
    expect(packFileName(pack)).toBe('bridge-pack-ACT-P007-SEND-MESSAGE.md');
  });
});

describe('⌘K >pack (BR-1406)', () => {
  it('returns one hit that opens the Duet desk with the pack built', () => {
    const hits = searchBridgeGraph(graph(), '>pack CH-7004');
    expect(hits).toEqual([expect.objectContaining({ key: '70603', href: '/admin/clubhouse/duet?t=70603', rank: 0 })]);
    expect(searchBridgeGraph(graph(), '>pack nothing')).toEqual([]);
  });
});

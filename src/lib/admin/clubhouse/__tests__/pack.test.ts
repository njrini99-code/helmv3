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
  packTargetKey,
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
  g.findings = {
    'F-0001': {
      page: 'P007',
      screen: 'Messages / Composer',
      severity: 'S2',
      dimension: 'correctness',
      standard: 'CO-01 says exactly what is true',
      title: 'Send says sent before the server answers',
      repro: ['Open Messages as a coach', 'Go offline and press Send'],
      fix: 'Wait for the action result before the toast',
      files: ['src/clubhouse/screens/messages/Composer.tsx:88'],
      tier: 'W',
      audit: 'docs/clubhouse/audits/2026-11-01.md',
      status: 'open',
    },
  };
  return g;
}

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const TEAM = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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
    for (const raw of ['', 'P999', 'CTL-P007-999', 'ACT-NOPE', '99999', 'CH-1', 'x'.repeat(90), 'F-9999', 'rel:xyz', 'rel:12', 'user:not-a-uuid', 'team:', USER]) {
      expect(resolvePackTarget(g, raw), raw).toBeNull();
    }
  });

  it('reads a finding, a release, a person and a team, lower-casing the ids', () => {
    expect(resolvePackTarget(g, 'f-0001')).toEqual({ kind: 'finding', key: 'F-0001', page: 'P007', ref: 'F-0001' });
    expect(resolvePackTarget(g, 'REL:ABC1234')).toEqual({ kind: 'release', key: 'rel:abc1234', page: null, ref: 'abc1234' });
    expect(resolvePackTarget(g, `user:${USER.toUpperCase()}`)).toEqual({ kind: 'person', key: `user:${USER}`, page: null, ref: USER });
    expect(resolvePackTarget(g, `team:${TEAM}`)).toEqual({ kind: 'team', key: `team:${TEAM}`, page: null, ref: TEAM });
  });

  it('every kind round-trips through its key, as PackLink and >pack feed it back', () => {
    for (const raw of ['P007', 'CTL-P007-014', 'ACT-P007-SEND-MESSAGE', 'CH-7004', 'F-0001', packTargetKey.release('ABCDEF1234'), packTargetKey.person(USER), packTargetKey.team(TEAM)]) {
      const t = resolvePackTarget(g, raw)!;
      expect(resolvePackTarget(g, t.key), raw).toEqual(t);
    }
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

describe('live-only and finding packs', () => {
  const alias = (kind: 'person' | 'team', id: string) => `${kind === 'person' ? 'u' : 't'}-alias-${id.slice(0, 4)}`;

  it('a person pack is pseudonymous by default: the user id is nowhere in the paste', async () => {
    const g = graph();
    const target = resolvePackTarget(g, packTargetKey.person(USER))!;
    const seen: string[] = [];
    const probe: PackLiveSource = { id: 'probe', title: 'Probe', read: async (t, _g, ctx) => (seen.push(t.ref ?? '', ctx.subject), { source: 'probe', title: 'Probe', state: 'ok', note: ctx.subject }) };
    const pack = await buildPack(g, target, { pseudonymize: alias, sources: [probe] });
    const md = renderPackMarkdown(pack);
    expect(md).not.toContain(USER);
    expect(pack.target).toMatchObject({ kind: 'person', key: 'u-alias-0f8f', label: 'person u-alias-0f8f', href: '/admin/clubhouse/sessions', page: null });
    expect(pack.ask.about).toBe('person u-alias-0f8f');
    expect(packFileName(pack)).toBe('bridge-pack-u-alias-0f8f.md');
    // The source still reads by the real id; it only prints the pseudonymous subject.
    expect(seen).toEqual([USER, 'person u-alias-0f8f']);
  });

  it('without a pseudonymizer the id is withheld, and names show it only when asked', async () => {
    const g = graph();
    const target = resolvePackTarget(g, packTargetKey.team(TEAM))!;
    const off = await buildPack(g, target);
    expect(renderPackMarkdown(off)).not.toContain(TEAM);
    expect(off.target.label).toBe('team t-withheld');
    const on = await buildPack(g, target, { includeNames: true, pseudonymize: alias });
    expect(on.target).toMatchObject({ key: `team:${TEAM}`, href: `/admin/clubhouse/teams/${TEAM}` });
    expect(on.people).toBe('names');
  });

  it('a release pack has no page, no contract rows, and a regression check', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'rel:abcdef1234')!);
    expect(pack.target).toMatchObject({ label: 'release abcdef1', href: '/admin/clubhouse/releases/abcdef1234', page: null });
    expect(pack.contractRows.ids).toEqual([]);
    expect(pack.reproduce).toMatchObject({ routes: [], preview: null, steps: [] });
    expect(pack.done.checks[0]).toContain('release abcdef1');
    expect(renderPackMarkdown(pack)).toContain('## 7. Done means');
  });

  it('a finding pack carries the finding, its files, its repro as steps and a re-audit check', async () => {
    const g = graph();
    const pack = await buildPack(g, resolvePackTarget(g, 'F-0001')!);
    expect(pack.finding).toMatchObject({ id: 'F-0001', severity: 'S2', fix: 'Wait for the action result before the toast' });
    expect(pack.code.files).toEqual(['src/clubhouse/screens/messages/Composer.tsx']);
    expect(pack.reproduce.steps).toEqual(['Open Messages as a coach', 'Go offline and press Send']);
    expect(pack.reproduce.preview).toBe('/clubhouse-preview/messages');
    expect(pack.target.href).toBe('/admin/clubhouse/readiness?view=findings');
    expect(pack.done.checks).toEqual(['F-0001 is re-checked by its audit (docs/clubhouse/audits/2026-11-01.md) and marked fixed']);
    const md = renderPackMarkdown(pack);
    expect(md).toContain('Finding F-0001 (S2, open)');
    expect(md).toContain('- Step 2: Go offline and press Send');
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

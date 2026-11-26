import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BridgeGraph } from '../graph';
import { searchBridgeGraph } from '../search';
import { fixtureGraph } from './fixtures';

describe('searchBridgeGraph (B14, plan §7.2)', () => {
  it('a CH- code lands on its Bridge ID dossier, first', () => {
    const [first] = searchBridgeGraph(fixtureGraph(), 'CH-7004');
    expect(first).toMatchObject({ kind: 'code', key: '70603', href: '/admin/clubhouse/codes/70603', rank: 0 });
  });

  it('finds a Bridge ID, an action by ID or words, and a page by ID or name', () => {
    const g = fixtureGraph();
    expect(searchBridgeGraph(g, '70603')[0]).toMatchObject({ kind: 'code', key: '70603' });
    expect(searchBridgeGraph(g, 'ACT-P007-SEND')[0]).toMatchObject({ kind: 'action', href: '/admin/clubhouse/actions/ACT-P007-SEND-MESSAGE' });
    expect(searchBridgeGraph(g, 'send a message').map((h) => h.kind)).toContain('action');
    expect(searchBridgeGraph(g, 'P007')[0]).toMatchObject({ kind: 'page', href: '/admin/clubhouse/P007' });
    expect(searchBridgeGraph(g, 'messages').map((h) => h.key)).toContain('P007');
  });

  it('finds numbered controls and findings', () => {
    const g = fixtureGraph();
    g.controls['CTL-P007-014'] = { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'] };
    g.findings['F-0001'] = { page: 'P007', screen: 's', severity: 'S1', dimension: 'd', standard: 's', title: 'Home ignores trips', repro: [], fix: 'f', files: [], tier: 'W', audit: 'a', status: 'open' };
    expect(searchBridgeGraph(g, 'CTL-P007-014')[0]).toMatchObject({ kind: 'control', href: '/admin/clubhouse/controls/CTL-P007-014' });
    expect(searchBridgeGraph(g, 'ignores trips')[0]).toMatchObject({ kind: 'finding', href: '/admin/clubhouse/readiness?view=findings#F-0001' });
  });

  it('asks for two characters, and caps each kind so codes never crowd out the rest', () => {
    const g = fixtureGraph();
    expect(searchBridgeGraph(g, 'P')).toEqual([]);
    for (let i = 0; i < 40; i += 1) g.ids[300000 + i] = { page: 'P007', category: 6, name: `MSG_${i}`, meaning: 'Message failed', status: 'implemented' };
    const hits = searchBridgeGraph(g, 'message');
    expect(hits.filter((h) => h.kind === 'code').length).toBeLessThanOrEqual(5);
    expect(hits.some((h) => h.kind === 'action')).toBe(true);
    expect(hits.length).toBeLessThanOrEqual(12);
  });

  it('works on the generated graph this branch ships', () => {
    const graph = JSON.parse(
      readFileSync(join(process.cwd(), 'docs/clubhouse/generated/bridge-graph.json'), 'utf8'),
    ) as BridgeGraph;
    const [first] = searchBridgeGraph(graph, 'CH-7004');
    expect(first?.kind).toBe('code');
    expect(first?.href).toBe(`/admin/clubhouse/codes/${graph.chIndex['CH-7004']}`);
  });
});

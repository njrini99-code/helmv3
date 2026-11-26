// @vitest-environment jsdom
/**
 * Category 25, Helm Bridge action (plan §6, owner decision D4): three rows per Clubhouse page. This file proves the two
 * implemented ones, and names every one of their Bridge IDs, as the registry requires of a contract with no catalog
 * code (scripts/clubhouse/registry.mjs):
 *
 *   -01 Open in Bridge: 12501 22501 32501 42501 52501 62501 72501 82501 92501 102501 112501 122501 132501 142501 152501
 *       162501 172501
 *   -03 Context pack:   12503 22503 32503 42503 52503 62503 72503 82503 92503 102503 112503 122503 132503 142503 152503
 *       162503 172503
 *
 * -02 "Signal the Bridge reads" (…2502) stays reserved until signals reach the Bridge.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeControls, type BridgeGraph, type RawGraphControl } from '@/lib/admin/clubhouse/graph';
import { buildPack, resolvePackTarget } from '@/lib/admin/clubhouse/pack';
import { clubhouseHref } from '@/lib/admin/clubhouse/screens';

const root = process.cwd();
const graph = JSON.parse(readFileSync(join(root, 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as BridgeGraph;
graph.controls = normalizeControls(graph.controls as unknown as Record<string, RawGraphControl>);

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })) }));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: () => graph }));

const OPEN = [12501, 22501, 32501, 42501, 52501, 62501, 72501, 82501, 92501, 102501, 112501, 122501, 132501, 142501, 152501, 162501, 172501];
const PACK = [12503, 22503, 32503, 42503, 52503, 62503, 72503, 82503, 92503, 102503, 112503, 122503, 132503, 142503, 152503, 162503, 172503];

const pageOf = (id: number) => `P${String(id).slice(0, -4).padStart(3, '0')}` as const;

describe('category 25 rows', () => {
  it('every page has its three, -01 and -03 implemented, -02 reserved', () => {
    const pages = Object.keys(graph.pages).sort();
    expect(pages).toHaveLength(17);
    for (const [i, open] of OPEN.entries()) {
      const page = pages[i]!;
      expect(pageOf(open)).toBe(page);
      expect(graph.ids[String(open)]).toMatchObject({ page, category: 25, name: 'OPEN_IN_BRIDGE', status: 'implemented' });
      expect(graph.ids[String(open + 1)]).toMatchObject({ page, category: 25, name: 'SIGNAL_THE_BRIDGE_READS', status: 'reserved' });
      expect(graph.ids[String(PACK[i]!)]).toMatchObject({ page, category: 25, name: 'CONTEXT_PACK', status: 'implemented' });
    }
  });

  it('-01 Open in Bridge: each page’s dossier renders', async () => {
    const { default: PageDossier } = await import('../[page]/page');
    const { render, cleanup } = await import('@testing-library/react');
    for (const open of OPEN) {
      const page = pageOf(open);
      expect(clubhouseHref.page(page)).toBe(`/admin/clubhouse/${page}`);
      const { container } = render(await PageDossier({ params: Promise.resolve({ page }), searchParams: Promise.resolve({}) }));
      expect(container.textContent, page).toContain(page);
      cleanup();
    }
  });

  it('-03 Context pack: each page’s pack builds, with its contract and a done line', async () => {
    for (const id of PACK) {
      const page = pageOf(id);
      const target = resolvePackTarget(graph, page);
      expect(target, page).toEqual({ kind: 'page', key: page, page });
      const pack = await buildPack(graph, target!);
      expect(pack.contractRows.ids.length, page).toBeGreaterThan(0);
      expect(pack.done.gates).toContain('npm run clubhouse:check');
    }
  });
});

// One titled test per page, so each page's own coverage test finds its two Bridge IDs named here (the row's `tests`).
describe('category 25, page by page', () => {
  it('12501 12503 P001: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['12501']).toMatchObject({ page: 'P001', category: 25, status: 'implemented' });
    expect(graph.ids['12503']).toMatchObject({ page: 'P001', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P001')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('22501 22503 P002: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['22501']).toMatchObject({ page: 'P002', category: 25, status: 'implemented' });
    expect(graph.ids['22503']).toMatchObject({ page: 'P002', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P002')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('32501 32503 P003: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['32501']).toMatchObject({ page: 'P003', category: 25, status: 'implemented' });
    expect(graph.ids['32503']).toMatchObject({ page: 'P003', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P003')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('42501 42503 P004: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['42501']).toMatchObject({ page: 'P004', category: 25, status: 'implemented' });
    expect(graph.ids['42503']).toMatchObject({ page: 'P004', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P004')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('52501 52503 P005: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['52501']).toMatchObject({ page: 'P005', category: 25, status: 'implemented' });
    expect(graph.ids['52503']).toMatchObject({ page: 'P005', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P005')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('62501 62503 P006: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['62501']).toMatchObject({ page: 'P006', category: 25, status: 'implemented' });
    expect(graph.ids['62503']).toMatchObject({ page: 'P006', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P006')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('72501 72503 P007: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['72501']).toMatchObject({ page: 'P007', category: 25, status: 'implemented' });
    expect(graph.ids['72503']).toMatchObject({ page: 'P007', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P007')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('82501 82503 P008: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['82501']).toMatchObject({ page: 'P008', category: 25, status: 'implemented' });
    expect(graph.ids['82503']).toMatchObject({ page: 'P008', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P008')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('92501 92503 P009: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['92501']).toMatchObject({ page: 'P009', category: 25, status: 'implemented' });
    expect(graph.ids['92503']).toMatchObject({ page: 'P009', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P009')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('102501 102503 P010: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['102501']).toMatchObject({ page: 'P010', category: 25, status: 'implemented' });
    expect(graph.ids['102503']).toMatchObject({ page: 'P010', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P010')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('112501 112503 P011: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['112501']).toMatchObject({ page: 'P011', category: 25, status: 'implemented' });
    expect(graph.ids['112503']).toMatchObject({ page: 'P011', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P011')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('122501 122503 P012: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['122501']).toMatchObject({ page: 'P012', category: 25, status: 'implemented' });
    expect(graph.ids['122503']).toMatchObject({ page: 'P012', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P012')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('132501 132503 P013: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['132501']).toMatchObject({ page: 'P013', category: 25, status: 'implemented' });
    expect(graph.ids['132503']).toMatchObject({ page: 'P013', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P013')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('142501 142503 P014: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['142501']).toMatchObject({ page: 'P014', category: 25, status: 'implemented' });
    expect(graph.ids['142503']).toMatchObject({ page: 'P014', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P014')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('152501 152503 P015: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['152501']).toMatchObject({ page: 'P015', category: 25, status: 'implemented' });
    expect(graph.ids['152503']).toMatchObject({ page: 'P015', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P015')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('162501 162503 P016: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['162501']).toMatchObject({ page: 'P016', category: 25, status: 'implemented' });
    expect(graph.ids['162503']).toMatchObject({ page: 'P016', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P016')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
  it('172501 172503 P017: opens in the Bridge and builds its context pack', async () => {
    expect(graph.ids['172501']).toMatchObject({ page: 'P017', category: 25, status: 'implemented' });
    expect(graph.ids['172503']).toMatchObject({ page: 'P017', category: 25, status: 'implemented' });
    expect((await buildPack(graph, resolvePackTarget(graph, 'P017')!)).contractRows.ids.length).toBeGreaterThan(0);
  });
});

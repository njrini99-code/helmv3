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

/**
 * B11 Drift (plan §8): the build lists from the graph, the runtime lists from clubhouse_drift rows, and the counts.
 * The last block runs the lists on the real graph: lists 1, 6, 7 (build half), 8 and 9 are held at zero by
 * clubhouse:check (plan §13), so a regression there fails both gates.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureGraph } from './fixtures';
import { normalizeControls, type BridgeGraph, type RawGraphControl } from '../graph';
import {
  DRIFT_LISTS,
  buildTimeDrift,
  controlIsLink,
  driftCounts,
  driftExport,
  neverSeenCandidates,
  parseDriftList,
  runtimeEntries,
  whereFile,
  type RuntimeDriftRow,
} from '../drift';

function graph(): BridgeGraph {
  const g = fixtureGraph();
  g.codeIndex = { 'CH-7004': ['src/clubhouse/screens/messages/Composer.tsx'], 'CH-9999': ['src/clubhouse/screens/x.tsx'] };
  g.ids['70101']!.where = ['Composer.tsx#Composer', 'src/clubhouse/screens/messages/Thread.tsx#Thread'];
  g.actions['ACT-P007-SEND-MESSAGE']!.outcomes.retired = 70604;
  g.controls = {
    'CTL-P007-001': { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'] },
    'CTL-P007-002': { page: 'P007', labelTemplate: '{name}', actions: [], description: '"{name}" link: opens a page chosen at run time (href)' },
    'CTL-P007-003': { page: 'P007', label: 'Toggle', actions: [], description: '"Toggle" button: runs setOpen' },
    'CTL-P007-004': { page: 'P007', actions: [] },
  };
  return g;
}

const row = (over: Partial<RuntimeDriftRow>): RuntimeDriftRow => ({
  kind: 'unknown-code',
  code: 'CH-4242',
  release: 'abcdef1234',
  drift_count: 3,
  first_seen: '2026-11-20T10:00:00Z',
  last_seen: '2026-11-21T10:00:00Z',
  ...over,
});

describe('buildTimeDrift', () => {
  const d = buildTimeDrift(graph());

  it('list 1: a code the source writes that no catalog has', () => {
    expect(d.uncatalogued.map((e) => e.key)).toEqual(['CH-9999']);
  });

  it('list 6: a where that is not a path from the repo root', () => {
    expect(d.where.map((e) => e.key)).toEqual(['70101:Composer.tsx']);
  });

  it('list 7: an outcome that lands on a deprecated ID', () => {
    expect(d.outcomes).toHaveLength(1);
    expect(d.outcomes[0]!.detail).toContain('70604, which is deprecated');
  });

  it('list 8: a page whose only IDs are the Bridge’s own (category 25) has none', () => {
    const g = graph();
    g.ids['172501'] = { page: 'P017', category: 25, name: 'OPEN_IN_BRIDGE', meaning: 'Open in Bridge', status: 'reserved' };
    expect(buildTimeDrift(g).pages.map((e) => e.key)).toEqual(['P017']);
  });

  it('list 9 and §4.7: an unlabelled control; a control with neither action nor link', () => {
    expect(d.controls.map((e) => e.key)).toEqual(['CTL-P007-004']);
    expect(d.unlinked.map((e) => e.key)).toEqual(['CTL-P007-003', 'CTL-P007-004']);
  });

  it('reads a link from the ledger description or the element', () => {
    expect(controlIsLink({ page: 'P007', actions: [], element: 'Link' })).toBe(true);
    expect(controlIsLink({ page: 'P007', actions: [], description: '"Back" link: opens /golf' })).toBe(true);
    expect(controlIsLink({ page: 'P007', actions: [], description: '"Back" button: runs close' })).toBe(false);
  });

  it('whereFile drops the symbol and the line', () => {
    expect(whereFile('src/a.tsx#Sym')).toBe('src/a.tsx');
    expect(whereFile('src/a.tsx:12')).toBe('src/a.tsx');
  });
});

describe('runtime half', () => {
  it('maps drift kinds to their lists, resolving CH- codes to Bridge IDs', () => {
    const g = graph();
    const rows = [row({}), row({ kind: 'deprecated-fired', code: 'CH-7005' }), row({ kind: 'silent-action', code: '70603' })];
    expect(runtimeEntries(g, rows, 'unknown-fired').map((e) => e.label)).toEqual(['CH-4242']);
    const dep = runtimeEntries(g, rows, 'deprecated-fired');
    expect(dep[0]!.href).toBe('/admin/clubhouse/codes/70604');
    expect(dep[0]!.page).toBe('P007');
    expect(runtimeEntries(g, rows, 'wrong-page')).toHaveLength(1);
    expect(runtimeEntries(g, rows, 'uncatalogued')).toEqual([]);
  });

  it('counts build lists always, runtime lists only with a signal (never a false zero)', () => {
    const g = graph();
    const build = buildTimeDrift(g);
    const none = driftCounts(build, { state: 'no-signal', reason: 'held' }, g);
    const byKey = Object.fromEntries(none.map((c) => [c.key, c.count]));
    expect(byKey.uncatalogued).toBe(1);
    expect(byKey['unknown-fired']).toBeNull();
    expect(byKey['never-seen']).toBeNull();
    expect(byKey.outcomes).toBe(1);
    const live = Object.fromEntries(driftCounts(build, { state: 'ok', rows: [row({}), row({ kind: 'wrong-outcome', code: 'CH-7101' })] }, g).map((c) => [c.key, c.count]));
    expect(live['unknown-fired']).toBe(1);
    expect(live['reserved-fired']).toBe(0);
    expect(live.outcomes).toBe(2);
  });

  it('exports JSON for Duet with every list, in plan order', () => {
    const g = graph();
    const out = driftExport(g, buildTimeDrift(g), { state: 'no-signal', reason: 'held' });
    expect(out.schema).toBe('bridge-drift/v1');
    expect(out.lists.map((l) => l.n)).toEqual(DRIFT_LISTS.map((l) => l.n));
    expect(out.lists.find((l) => l.key === 'unknown-fired')!.count).toBeNull();
  });

  it('parses the list param, defaulting to list 1', () => {
    expect(parseDriftList('where')).toBe('where');
    expect(parseDriftList('nope')).toBe('uncatalogued');
    expect(parseDriftList(undefined)).toBe('uncatalogued');
  });

  it('splits list 5’s denominator into rare by nature and should be common', () => {
    const split = neverSeenCandidates(graph());
    expect(split.rare).toBe(1); // 10703 OFFLINE, category 7
    expect(split.common).toBe(4);
  });
});

describe('the real graph (held by clubhouse:check)', () => {
  const real = JSON.parse(readFileSync(join(process.cwd(), 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as BridgeGraph;
  real.controls = normalizeControls(real.controls as unknown as Record<string, RawGraphControl>);
  const d = buildTimeDrift(real);

  it('lists 1, 6, 7 (build half), 8 and 9 are zero', () => {
    expect(d.uncatalogued).toEqual([]);
    expect(d.where).toEqual([]);
    expect(d.outcomes).toEqual([]);
    expect(d.pages).toEqual([]);
    expect(d.controls).toEqual([]);
  });

  it('list 6: every where path exists in the repo', () => {
    const missing = Object.entries(real.ids).flatMap(([id, rec]) =>
      (rec.where ?? []).map(whereFile).filter((f) => !existsSync(join(process.cwd(), f))).map((f) => `${id} ${f}`),
    );
    expect(missing).toEqual([]);
  });
});

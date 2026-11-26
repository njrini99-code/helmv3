import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BridgeGraph } from '../graph';
import {
  CATEGORY_NAMES,
  DEFAULT_SCOPE,
  actionOutcomes,
  actionRows,
  actionsEndingIn,
  categoryFamily,
  codeFiles,
  codeRows,
  controlRows,
  controlsStarting,
  filePart,
  filterPageRows,
  findingRows,
  gateTone,
  githubBlobUrl,
  liveRef,
  pageRows,
  parseCodeFilter,
  parseScope,
  previewPath,
  previewServed,
  reproSteps,
  resolveCodeParam,
  sortPageRows,
  stateMatrix,
  withScope,
  CODE_PAGE_SIZE,
  audienceWords,
  controlDescriptionForPeople,
  controlLabelForPeople,
  readableTemplate,
} from '../screens';
import { fixtureGraph } from './fixtures';
import graphJson from '../../../../../docs/clubhouse/generated/bridge-graph.json';

/** The fixture graph plus the pieces B02-B12 read: gates, controls, a finding, a deprecated outcome. */
function graph(): BridgeGraph {
  const g = fixtureGraph();
  g.pages.P007 = {
    ...g.pages.P007!,
    roles: ['coach', 'player'],
    gates: { design: 'approved', implementation: 'in_progress', contract: 'complete', bridge: 'reserved', data: 'existing', verification: 'partial', docs: 'current' },
    held: [
      { plan: 'docs/clubhouse/held/features/a.md', status: 'HELD', migration: null },
      { plan: 'docs/clubhouse/held/data/b.md', status: 'RELEASED', migration: 'x.sql' },
    ],
    screens: [{ route: '/golf/dashboard/messages', audience: 'shared' }],
  };
  g.pages.P015 = { ...g.pages.P001!, name: 'Auth', slug: 'auth', screens: [{ route: '/golf/login', audience: 'signed-out' }] };
  g.actions['ACT-P007-OLD'] = { ...g.actions['ACT-P007-SEND-MESSAGE']!, label: 'Old path', outcomes: { failure: 70604, gone: 99999 } };
  g.controls = {
    'CTL-P007-014': { page: 'P007', label: 'Send', role: 'both', viewport: 'both', actions: ['ACT-P007-SEND-MESSAGE'], verdict: 'works' },
    'CTL-P007-021': { page: 'P007', labelTemplate: 'Schedule with {name}', role: 'coach', viewport: 'desk', actions: [], verdict: 'GAP' },
    'CTL-P001-002': { page: 'P001', role: 'player', viewport: 'phone', actions: [] },
  };
  g.findings = {
    'F-0002': { page: 'P007', screen: 'Thread', severity: 'S3', dimension: 'a11y', standard: 'A11Y-01', title: 'Low', repro: 'one step', fix: 'f', files: [], tier: 'W', audit: '2026-11-13', status: 'open' },
    'F-0001': { page: 'P007', screen: 'Thread', severity: 'S1', dimension: 'correctness', standard: 'CO-01', title: 'High', repro: ['a', 'b'], fix: 'f', files: [], tier: 'W', audit: '2026-11-13', status: 'open' },
    'F-0003': { page: 'P001', screen: 'Shell', severity: 'S1', dimension: 'craft', standard: 'X', title: 'Gone', repro: [], fix: 'f', files: [], tier: 'C', audit: '2026-11-13', status: 'withdrawn' },
  };
  g.ids[70603]!.where = ['src/clubhouse/screens/messages/Composer.tsx#send'];
  g.ids[70603]!.catalogRow = { theySee: "Couldn't send the message" };
  g.codeIndex['CH-7101'] = ['src/clubhouse/screens/messages/api.ts'];
  return g;
}

describe('categories', () => {
  it('match config/clubhouse/category-map.json word for word', () => {
    const map = JSON.parse(readFileSync(join(process.cwd(), 'config/clubhouse/category-map.json'), 'utf8')) as {
      categories: Record<string, string>;
    };
    expect(Object.fromEntries(Object.entries(CATEGORY_NAMES).map(([k, v]) => [String(k), v]))).toEqual(map.categories);
  });

  it('put the failure categories in the error family and 09 in the gain family (plan §7.4)', () => {
    expect([6, 7, 8, 11].map(categoryFamily)).toEqual(['failure', 'failure', 'failure', 'failure']);
    expect(categoryFamily(9)).toBe('success');
    expect(categoryFamily(25)).toBe('record');
  });
});

describe('the scope bar', () => {
  it('parses page, role and viewport, and falls back to all for anything unknown', () => {
    expect(parseScope({ page: 'p007', role: 'coach', vp: 'phone' }, ['P007'])).toEqual({ page: 'P007', role: 'coach', vp: 'phone' });
    expect(parseScope({ page: 'P999', role: 'admin', vp: ['tablet'] }, ['P007'])).toEqual(DEFAULT_SCOPE);
    expect(parseScope(undefined)).toEqual(DEFAULT_SCOPE);
  });

  it('follows every link, and the default scope adds nothing to a URL', () => {
    const scope = { page: 'P007' as const, role: 'coach' as const, vp: 'all' as const };
    expect(withScope('/admin/clubhouse/codes', scope, { q: 'send', p: null })).toBe('/admin/clubhouse/codes?page=P007&role=coach&q=send');
    expect(withScope('/admin/clubhouse', DEFAULT_SCOPE)).toBe('/admin/clubhouse');
    expect(withScope('/admin/clubhouse?sort=gates', DEFAULT_SCOPE, { sort: null })).toBe('/admin/clubhouse');
  });
});

describe('pages (B02, B12)', () => {
  it('counts IDs, categories answered, controls, actions, held plans, gates and open findings per page', () => {
    const p007 = pageRows(graph()).find((r) => r.id === 'P007')!;
    expect(p007.ids).toEqual({ implemented: 3, reserved: 1, deprecated: 1, total: 5 });
    expect(p007.categoriesAnswered).toBe(3); // 01, 06, 09
    expect(p007.idsLocated).toBe(1);
    expect(p007.controls).toBe(2);
    expect(p007.controlsLabelled).toBe(2);
    expect(p007.actions).toBe(2);
    expect(p007).toMatchObject({ held: 2, heldOpen: 1, gatesMet: 4 });
    expect(p007.findingsOpen).toEqual({ S1: 1, S2: 0, S3: 1, S4: 0, total: 2 });
  });

  it('sorts weakest first and filters by role, with signed out read from the screen audiences', () => {
    const g = graph();
    const rows = pageRows(g);
    expect(sortPageRows(rows, 'gates')[0]!.gatesMet).toBe(0);
    expect(filterPageRows(g, rows, { ...DEFAULT_SCOPE, role: 'signed-out' }).map((r) => r.id)).toEqual(['P015']);
    expect(filterPageRows(g, rows, { ...DEFAULT_SCOPE, role: 'coach' }).map((r) => r.id)).toEqual(['P007']);
  });

  it('reads manifest gate values as met, partial or open', () => {
    expect(['approved', 'complete', 'current', 'existing'].map(gateTone)).toEqual(['met', 'met', 'met', 'met']);
    expect(['in_progress', 'partial', 'review', 'reserved', 'draft', 'held'].every((v) => gateTone(v) === 'partial')).toBe(true);
    expect(gateTone('missing')).toBe('open');
    expect(gateTone(undefined)).toBe('unknown');
  });

  it('builds the state matrix by category, filtered by status or to the failure categories', () => {
    const g = graph();
    expect(stateMatrix(g, 'P007').map((r) => [r.category, r.cells.map((c) => c.id)])).toEqual([
      [1, [70101]],
      [6, [70603, 70604, 70605]],
      [9, [70901]],
    ]);
    expect(stateMatrix(g, 'P007', { show: 'failures' }).map((r) => r.category)).toEqual([6]);
    expect(stateMatrix(g, 'P007', { show: 'reserved' })[0]!.cells.map((c) => c.id)).toEqual([70605]);
    expect(stateMatrix(g, 'P007', { category: 9 })[0]!.cells[0]!.id).toBe(70901);
    expect(stateMatrix(g, 'P007')[1]!.cells[0]!.theySee).toBe("Couldn't send the message");
  });
});

describe('controls (B03)', () => {
  it('filters by page, role, viewport, board GAP and missing label', () => {
    const g = graph();
    expect(controlRows(g, DEFAULT_SCOPE).map((c) => c.id)).toEqual(['CTL-P001-002', 'CTL-P007-014', 'CTL-P007-021']);
    expect(controlRows(g, { ...DEFAULT_SCOPE, role: 'player' }).map((c) => c.id)).toEqual(['CTL-P001-002', 'CTL-P007-014']);
    expect(controlRows(g, { ...DEFAULT_SCOPE, vp: 'desk' }).map((c) => c.id)).toEqual(['CTL-P007-014', 'CTL-P007-021']);
    expect(controlRows(g, DEFAULT_SCOPE, 'gap').map((c) => c.id)).toEqual(['CTL-P007-021']);
    expect(controlRows(g, DEFAULT_SCOPE, 'unlabelled').map((c) => c.id)).toEqual(['CTL-P001-002']);
    expect(controlsStarting(g, ['ACT-P007-SEND-MESSAGE'])).toEqual(['CTL-P007-014']);
  });

  it('an empty ledger is an empty list, not an error', () => {
    expect(controlRows(fixtureGraph(), DEFAULT_SCOPE)).toEqual([]);
  });
});

describe('actions (B04)', () => {
  it('lists outcomes with their IDs and flags deprecated or unknown ones as drift', () => {
    const g = graph();
    const old = actionOutcomes(g, g.actions['ACT-P007-OLD']!);
    expect(old).toEqual([
      expect.objectContaining({ outcome: 'failure', id: 70604, status: 'deprecated', missing: false }),
      expect.objectContaining({ outcome: 'gone', id: 99999, missing: true }),
    ]);
    const rows = actionRows(g, DEFAULT_SCOPE);
    expect(rows.find((r) => r.id === 'ACT-P007-OLD')!.driftCount).toBe(2);
    expect(rows.find((r) => r.id === 'ACT-P007-SEND-MESSAGE')!.driftCount).toBe(0);
    expect(actionsEndingIn(g, 70603)).toEqual(['ACT-P007-SEND-MESSAGE']);
  });
});

describe('codes (B05)', () => {
  it('searches codes, CH codes, meanings, the words the coach sees and files', () => {
    const g = graph();
    const find = (q: string) => codeRows(g, parseCodeFilter({ q }, DEFAULT_SCOPE)).rows.map((r) => r.id);
    expect(find('CH-7004')).toEqual([70603]);
    expect(find('70603')).toEqual([70603]);
    expect(find("couldn't send")).toEqual([70603]);
    expect(find('Composer.tsx')).toEqual([70603]);
    expect(find('api.ts')).toEqual([70901]); // through the code index
  });

  it('filters by the scope page, category and status, and pages 50 at a time', () => {
    const g = graph();
    const f = parseCodeFilter({ cat: '6', status: 'implemented' }, { ...DEFAULT_SCOPE, page: 'P007' });
    expect(codeRows(g, f).rows.map((r) => r.id)).toEqual([70603]);
    for (let i = 0; i < 120; i += 1) g.ids[200000 + i] = { page: 'P001', category: 1, name: `N${i}`, meaning: 'm', status: 'implemented' };
    const page3 = codeRows(g, parseCodeFilter({ p: '3' }, DEFAULT_SCOPE));
    expect(page3.pages).toBe(Math.ceil(page3.total / CODE_PAGE_SIZE));
    expect(page3.p).toBe(3);
    expect(codeRows(g, parseCodeFilter({ p: '99' }, DEFAULT_SCOPE)).p).toBe(page3.pages);
  });

  it('resolves a Bridge ID, a CH code, a retired ID, and nothing else', () => {
    const g = graph();
    expect(resolveCodeParam(g, '70603')).toMatchObject({ kind: 'id', id: 70603 });
    expect(resolveCodeParam(g, 'ch-7004')).toEqual({ kind: 'ch', id: 70603 });
    expect(resolveCodeParam(g, '70602')).toEqual({ kind: 'tombstone', id: 70602, removedAt: '2026-11-01', replacement: 70603 });
    expect(resolveCodeParam(g, 'CH-1')).toEqual({ kind: 'unknown' });
    expect(resolveCodeParam(g, '../x')).toEqual({ kind: 'unknown' });
    expect(codeFiles(g, g.ids[70901]!)).toEqual({ exact: [], indexed: ['src/clubhouse/screens/messages/api.ts'] });
  });
});

describe('findings (B12)', () => {
  it('puts open findings first, worst first, and reads repro as steps', () => {
    const rows = findingRows(graph(), DEFAULT_SCOPE);
    expect(rows.map((f) => f.id)).toEqual(['F-0001', 'F-0002', 'F-0003']);
    expect(reproSteps(rows[0]!)).toEqual(['a', 'b']);
    expect(reproSteps(rows[1]!)).toEqual(['one step']);
    expect(findingRows(graph(), { ...DEFAULT_SCOPE, page: 'P001' }).map((f) => f.id)).toEqual(['F-0003']);
  });
});

describe('links', () => {
  it('opens files on GitHub at the release, with line anchors', () => {
    expect(filePart('src/a.tsx#Composer')).toBe('src/a.tsx');
    expect(filePart('src/clubhouse/data/home.ts:622-660 (golf_events only)')).toBe('src/clubhouse/data/home.ts');
    expect(githubBlobUrl('src/clubhouse/data/home.ts:622-660 (note)', 'abc1234')).toBe(
      'https://github.com/njrini99-code/helmv3/blob/abc1234/src/clubhouse/data/home.ts#L622-L660',
    );
    expect(liveRef({ NEXT_PUBLIC_SENTRY_RELEASE: 'ABCDEF1234' })).toBe('ABCDEF1234');
    expect(liveRef({ NEXT_PUBLIC_SENTRY_RELEASE: 'not a sha' })).toBe('main');
  });

  it('D6: Force this state is a link only where the preview app is served', () => {
    expect(previewPath('P007')).toBe('/clubhouse-preview/messages');
    expect(previewPath('P001')).toBeNull();
    expect(previewServed({ NODE_ENV: 'production' })).toBe(false);
    expect(previewServed({ NODE_ENV: 'development' })).toBe(true);
    // The guard this mirrors: the preview route 404s in production.
    const preview = readFileSync(join(process.cwd(), 'src/app/clubhouse-preview/[screen]/page.tsx'), 'utf8');
    expect(preview).toContain("if (process.env.NODE_ENV === 'production') notFound();");
  });
});

describe('controls from the ledger (bridge-graph.mjs shape)', () => {
  it('normalizes nulls, viewports and the board verdict', async () => {
    const { normalizeControl } = await import('../graph');
    expect(
      normalizeControl({
        page: 'P002',
        file: 'src/clubhouse/screens/home/Home.tsx',
        element: 'button',
        label: null,
        labelTemplate: 'Open {name}',
        description: 'Opens the round',
        role: 'player+visitor',
        viewport: 'desktop',
        actions: ['ACT-P002-OPEN'],
        verdict: { status: 'GAP', board: 'Coach - Home.html (coach, desktop)', control: 'Round recap' },
        code: null,
      }),
    ).toEqual({
      page: 'P002',
      file: 'src/clubhouse/screens/home/Home.tsx',
      element: 'button',
      labelTemplate: 'Open {name}',
      description: 'Opens the round',
      role: 'player+visitor',
      viewport: 'desk',
      actions: ['ACT-P002-OPEN'],
      verdict: 'GAP',
      board: 'Coach - Home.html (coach, desktop)',
      boardControl: 'Round recap',
    });
    expect(normalizeControl({ page: 'P001', viewport: 'all' }).viewport).toBe('both');
  });

  it('reads every control in the real graph without loss', async () => {
    const { readFileSync } = await import('node:fs');
    const { normalizeControls } = await import('../graph');
    const raw = JSON.parse(readFileSync('docs/clubhouse/generated/bridge-graph.json', 'utf8')).controls;
    const controls = normalizeControls(raw);
    expect(Object.keys(controls).length).toBe(Object.keys(raw).length);
    expect(Object.keys(controls).length).toBeGreaterThan(1700);
    for (const [id, c] of Object.entries(controls)) {
      expect(id).toMatch(/^CTL-P\d{3}-\d{3,}$/);
      expect(c.label || c.labelTemplate, id).toBeTruthy();
    }
  });
});

describe('run-time labels in words (controlLabelForPeople, readableTemplate)', () => {
  it('reads slots, choices and optional parts the way a person sees them', () => {
    expect(readableTemplate('{label} {{hint}|}')).toBe('‹label›');
    expect(readableTemplate('{children}')).toBe('‹its text›');
    expect(readableTemplate('Cancel {title}')).toBe('Cancel ‹title›');
    expect(readableTemplate('{actionLabel}')).toBe('‹action label›');
    expect(readableTemplate('{Trying again…|Try again}')).toBe('Try again');
    expect(readableTemplate('{Trying again…|{Reload|Try again}}')).toBe('Try again');
    expect(readableTemplate('{Back to {place}|Back to Home}')).toBe('Back to Home');
    expect(readableTemplate('{title} {{subtitle}|} Done')).toBe('‹title› Done');
  });
  it('leaves no brace in any label or description of the real Bridge map', () => {
    const real = (graphJson as unknown as BridgeGraph).controls;
    const bad: string[] = [];
    for (const [id, c] of Object.entries(real)) {
      const label = controlLabelForPeople(c);
      if (/[{}|]/.test(label.text)) bad.push(`${id} label: ${label.text}`);
      const d = controlDescriptionForPeople(c.description);
      if (d && /[{}]/.test(d)) bad.push(`${id} description: ${d}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('says who sees a control in words, never "both · both"', () => {
    expect(audienceWords('both', 'both')).toBe('Coach and player');
    expect(audienceWords('coach', 'phone')).toBe('Coach · phone only');
    expect(audienceWords('player+visitor', 'all')).toBe('Player or signed out');
    expect(audienceWords(null, null)).toBeNull();
  });
});

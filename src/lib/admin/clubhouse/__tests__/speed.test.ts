import { describe, it, expect } from 'vitest';
import { fixtureGraph } from './fixtures';
import { U, at, h } from './fixtures-live';
import { buttonSpeed, dbErrors, pageSpeed, parseSpeedScope, slowestPage, speedHref, speedRows, switchMeasured, DEFAULT_SPEED } from '../speed';
import type { FeedItem } from '../feed';

const graph = fixtureGraph();

const rows = [
  h({ kind: 'vital', act: 'LCP', page_id: 'P007', role: 'coach', platform: 'ios-app', duration_buckets: at(3000, 4) }),
  h({ kind: 'vital', act: 'LCP', page_id: 'P007', role: 'player', platform: 'ios-safari', duration_buckets: at(1000, 4) }),
  h({ kind: 'vital', act: 'INP', page_id: 'P007', role: 'player', platform: 'ios-safari', duration_buckets: at(300, 2) }),
  h({ kind: 'view', code: 'CH-7101', act: '', page_id: 'P007', role: 'coach', signal_count: 5, duration_buckets: [] }),
  h({ kind: 'view', code: 'CH-1903', act: '', page_id: 'P001', role: 'player', signal_count: 2, duration_buckets: at(750, 2) }),
  h({ kind: 'action', act: 'messages.send', outcome: 'success', role: 'coach', signal_count: 10, duration_buckets: at(500, 9).map((n, i) => n + (i === 12 ? 1 : 0)) }),
];

describe('speed scope', () => {
  it('parses role, device and window with defaults', () => {
    expect(parseSpeedScope({})).toEqual(DEFAULT_SPEED);
    expect(parseSpeedScope({ role: 'coach', device: 'desktop', w: '30d' })).toEqual({ role: 'coach', device: 'desktop', w: '30d' });
    expect(parseSpeedScope({ role: 'x', device: 'other' })).toEqual(DEFAULT_SPEED);
    expect(speedHref(DEFAULT_SPEED, { role: 'player' })).toBe('/admin/spaces/reliability/speed?role=player');
  });
});

describe('pageSpeed', () => {
  it('merges histograms for everyone instead of taking the slower role', () => {
    const p = pageSpeed(rows, graph).find((x) => x.page === 'P007')!;
    // 4 samples at 1000 and 4 at 3000 merged: the p75 is 3000 (upper edge), from one histogram.
    expect(p.lcp).toBe(3000);
    expect(p.inp).toBe(300);
    expect(p.views).toBe(5);
  });
  it('splits by role and device', () => {
    const player = pageSpeed(speedRows(rows, { role: 'player', device: 'all' }), graph).find((x) => x.page === 'P007')!;
    expect(player.lcp).toBe(1000);
    const coach = pageSpeed(speedRows(rows, { role: 'coach', device: 'all' }), graph).find((x) => x.page === 'P007')!;
    expect(coach.inp).toBeNull();
    expect(speedRows(rows, { role: 'all', device: 'ios-safari' })).toHaveLength(2);
  });
  it('switch time is null (not measured yet), never 0, until a view carries one', () => {
    const pages = pageSpeed(rows, graph);
    expect(pages.find((x) => x.page === 'P007')!.switchP75).toBeNull();
    expect(pages.find((x) => x.page === 'P001')!).toMatchObject({ switchP75: 750, switchSamples: 2, name: 'Shell' });
    expect(switchMeasured(pages)).toBe(true);
    expect(switchMeasured(pageSpeed(rows.filter((r) => r.page_id !== 'P001'), graph))).toBe(false);
  });
  it('names the slowest page, or none', () => {
    expect(slowestPage(pageSpeed(rows, graph), 'lcp')?.page).toBe('P007');
    expect(slowestPage([], 'inp')).toBeNull();
  });
});

describe('buttonSpeed', () => {
  it('labels buttons from the Bridge map and flags p95 past the slow-save line', () => {
    const [b] = buttonSpeed(rows, graph);
    expect(b).toMatchObject({ act: 'messages.send', actionId: 'ACT-P007-SEND-MESSAGE', label: 'Send a message', p50: 500, p95: 10_000, pastLine: true });
  });
});

describe('dbErrors', () => {
  const item = (over: Partial<FeedItem>): FeedItem =>
    ({ key: 'k', sessionId: 's', seq: 1, at: '', kind: 'action', outcome: 'failure', code: 'CH-7004', bridgeId: 70603, catalogCode: 'CH-7004', theySee: null, meaning: null, page: 'P007', pageName: 'Messages', control: null, controlLabel: null, action: 'ACT-P007-SEND-MESSAGE', actionLabel: null, act: null, role: 'coach', userId: U[0]!, teamId: null, teamName: null, platform: 'ios-app', release: null, serverCode: '42501', message: null, durationMs: null, trail: null, drift: [], state: null, nth: 1, ...over }) as FeedItem;
  it('groups by server code with the role split and the action’s tables from the map', () => {
    const out = dbErrors([item({}), item({ role: 'player' }), item({ role: 'signed-out', serverCode: '57014', action: null }), item({ serverCode: null })], graph);
    expect(out).toEqual([
      expect.objectContaining({ code: '42501', words: 'Not allowed by a row rule', total: 2, coach: 1, player: 1, signedOut: 0, tables: ['golf_messages'], actions: ['Send a message'] }),
      expect.objectContaining({ code: '57014', total: 1, signedOut: 1, tables: [] }),
    ]);
  });
});

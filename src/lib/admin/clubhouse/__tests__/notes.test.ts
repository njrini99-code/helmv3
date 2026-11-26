/** The Bridge's notes model (bridge_notes): expected and watched codes, and where a sent pack stands. */
import { describe, expect, it } from 'vitest';
import { REASON_MAX, cleanReason, indexNotes, oldestSent, packVerdict, queuedPack, watchedCodes, type BridgeNoteRow } from '../notes';
import { runRules, pipeStatus, categoryLookup, type HourlyRow } from '../live-model';
import { packTargetKey, packWatchCodes, resolvePackTarget } from '../pack';
import { fixtureGraph } from './fixtures';
import { LIVE_RELEASE, NOW, badDay } from './fixtures-live';

const note = (over: Partial<BridgeNoteRow>): BridgeNoteRow => ({
  id: over.id ?? 'n',
  kind: 'expected',
  code: 'CH-7004',
  bridge_id: 70603,
  page_id: 'P007',
  body: 'normal',
  created_at: '2026-11-20T10:00:00.000Z',
  created_by: 'admin-1',
  resolved_at: null,
  ...over,
});

const row = (over: Partial<HourlyRow>): HourlyRow => ({
  bucket_hour: '2026-11-21T09:00:00.000Z',
  code: 'CH-7004',
  kind: 'action',
  outcome: 'failure',
  act: 'sendMessage',
  role: 'coach',
  platform: 'ios-app',
  release: 'bbbbbbb2',
  bridge_id: 70603,
  page_id: 'P007',
  signal_count: 1,
  user_ids: ['u1'],
  duration_buckets: [],
  last_at: '2026-11-21T09:10:00.000Z',
  ...over,
});

describe('cleanReason', () => {
  it('trims, folds whitespace, drops control characters and caps the length', () => {
    expect(cleanReason('  a\n\tb \u0007c ')).toBe('a b c');
    expect(cleanReason('x'.repeat(REASON_MAX + 50))).toHaveLength(REASON_MAX);
    expect(cleanReason('   ')).toBeNull();
    expect(cleanReason(null)).toBeNull();
  });
});

describe('indexNotes', () => {
  it('keeps open notes only, the newest per code, and packs newest first', () => {
    const idx = indexNotes([
      note({ id: 'old', created_at: '2026-11-01T00:00:00.000Z', body: 'old reason' }),
      note({ id: 'new', created_at: '2026-11-10T00:00:00.000Z', body: 'new reason' }),
      note({ id: 'gone', code: 'CH-7005', resolved_at: '2026-11-11T00:00:00.000Z' }),
      note({ id: 'w', kind: 'watch', body: '' }),
      note({ id: 'p1', kind: 'pack', body: 'P007', created_at: '2026-11-02T00:00:00.000Z' }),
      note({ id: 'p2', kind: 'pack', body: '70603', created_at: '2026-11-12T00:00:00.000Z' }),
    ]);
    expect(idx.expected.get('CH-7004')?.body).toBe('new reason');
    expect(idx.expected.has('CH-7005')).toBe(false);
    expect([...idx.watched.keys()]).toEqual(['CH-7004']);
    expect(idx.packs.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(queuedPack(idx, 'P007')?.id).toBe('p1');
    expect(queuedPack(idx, 'P008')).toBeNull();
    expect(oldestSent(idx.packs)).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('packVerdict', () => {
  const sentAt = '2026-11-20T10:30:00.000Z';
  it('is "sent" when the pack has no failure codes of its own (a release or a finding)', () => {
    expect(packVerdict({ sentAt, codes: [], rows: [row({})] }).status).toBe('sent');
  });
  it('waits until a release is first seen after the hour it was sent; the same hour counts as before', () => {
    const rows = [row({ release: 'aaaaaaa1', bucket_hour: '2026-11-20T10:00:00.000Z' })];
    expect(packVerdict({ sentAt, codes: ['CH-7004'], rows })).toEqual({ status: 'waiting', release: null, firing: 0 });
  });
  it('the first release after it decides: no failure of its codes is fixed, any is regressed', () => {
    const before = row({ release: 'aaaaaaa1', bucket_hour: '2026-11-20T08:00:00.000Z', signal_count: 9 });
    const next = (outcome: string) => row({ release: 'bbbbbbb2', outcome, signal_count: 3 });
    const later = row({ release: 'ccccccc3', bucket_hour: '2026-11-22T09:00:00.000Z', signal_count: 5 });
    expect(packVerdict({ sentAt, codes: ['CH-7004'], rows: [before, next('success'), later] })).toEqual({ status: 'fixed', release: 'bbbbbbb2', firing: 0 });
    expect(packVerdict({ sentAt, codes: ['CH-7004'], rows: [before, next('failure'), later] })).toEqual({ status: 'regressed', release: 'bbbbbbb2', firing: 3 });
    // Another code failing in that release does not regress this pack.
    expect(packVerdict({ sentAt, codes: ['CH-7004'], rows: [row({ code: 'CH-7005' })] }).status).toBe('fixed');
  });
});

describe('packWatchCodes', () => {
  const g = fixtureGraph();
  it('a code pack watches its own failure code; a release pack watches none', () => {
    expect(packWatchCodes(g, resolvePackTarget(g, '70603')!)).toEqual(['CH-7004']);
    expect(packWatchCodes(g, resolvePackTarget(g, packTargetKey.release('abcdef1'))!)).toEqual([]);
  });
});

describe('watchedCodes', () => {
  it('each watched code with its failures and people, a quiet one at zero', () => {
    const idx = indexNotes([note({ kind: 'watch', code: 'CH-7004' }), note({ id: 'q', kind: 'watch', code: 'CH-7099', bridge_id: null })]);
    const out = watchedCodes(idx, [row({ signal_count: 2, user_ids: ['u1', 'u2'] }), row({ outcome: 'success', signal_count: 5 })]);
    expect(out[0]).toMatchObject({ code: 'CH-7004', failures: 2, count: 7, users: 2 });
    expect(out[1]).toMatchObject({ code: 'CH-7099', failures: 0, count: 0, users: 0, lastSeen: null });
  });
});

describe('expected codes in the rules', () => {
  it('R-01 and R-02 skip a code marked expected; the other rules still see it', () => {
    const graph = fixtureGraph();
    const day = badDay();
    const pipe = pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 60_000).toISOString(), now: NOW, activeHours: true });
    const all = runRules({ now: NOW, release: LIVE_RELEASE, ...day, pipe, categoryOf: categoryLookup(graph) });
    const target = all.find((a) => (a.rule === 'R-01' || a.rule === 'R-02') && a.code);
    expect(target, 'the bad day fires R-01 or R-02').toBeTruthy();
    const skipped = runRules({ now: NOW, release: LIVE_RELEASE, ...day, pipe, categoryOf: categoryLookup(graph), expectedCodes: new Set([target!.code!]) });
    expect(skipped.some((a) => (a.rule === 'R-01' || a.rule === 'R-02') && a.code === target!.code)).toBe(false);
    expect(skipped.filter((a) => a.rule !== 'R-01' && a.rule !== 'R-02')).toEqual(all.filter((a) => a.rule !== 'R-01' && a.rule !== 'R-02'));
  });
});

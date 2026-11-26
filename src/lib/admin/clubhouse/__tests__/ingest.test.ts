import { describe, expect, it } from 'vitest';
import { buildIngest, DURATION_EDGES_MS, durationBucket, hourOf, MAX_ADMIN_ROWS_PER_BATCH } from '../ingest';
import { fixtureGraph, signal } from './fixtures';

const NOW = 1_763_000_400_000;
const USER = '11111111-2222-4333-8444-555555555555';
const TEAM = '66666666-7777-4888-9999-000000000000';

function build(over: Partial<Parameters<typeof buildIngest>[0]> = {}) {
  return buildIngest({ signals: [], context: [], ended: false, graph: fixtureGraph(), userId: USER, now: NOW, ...over });
}

describe('duration buckets', () => {
  it('match the edges clubhouse_bucket_quantile reads', () => {
    expect(DURATION_EDGES_MS).toHaveLength(17);
    expect(durationBucket(0)).toBe(0);
    expect(durationBucket(50)).toBe(0);
    expect(durationBucket(51)).toBe(1);
    expect(durationBucket(480)).toBe(4);
    expect(durationBucket(60_000)).toBe(15);
    expect(durationBucket(60_001)).toBe(16);
    expect(durationBucket(600_000)).toBe(16);
  });

  it('floors to the UTC hour', () => {
    expect(hourOf(Date.UTC(2026, 10, 24, 10, 59, 59, 999))).toBe('2026-11-24T10:00:00.000Z');
  });
});

describe('buildIngest', () => {
  it('merges envelopes with the same key into one hourly row, with the verified user only', () => {
    const plan = build({
      signals: [
        signal({ seq: 1, kind: 'action', outcome: 'success', code: 'CH-7101', act: 'messages.send', durationMs: 120, userId: '99999999-9999-4999-8999-999999999999' }),
        signal({ seq: 2, kind: 'action', outcome: 'success', code: 'CH-7101', act: 'messages.send', durationMs: 900, at: NOW - 1000 }),
      ],
    });
    expect(plan.sessions).toHaveLength(1);
    const row = plan.sessions[0]!.hourly[0]!;
    expect(plan.sessions[0]!.hourly).toHaveLength(1);
    expect(row).toMatchObject({ code: 'CH-7101', kind: 'action', outcome: 'success', act: 'messages.send', page_id: 'P007', bridge_id: 70901, count: 2, user_ids: [USER] });
    expect(row.buckets).toHaveLength(17);
    expect(row.buckets[2]).toBe(1);
    expect(row.buckets[6]).toBe(1);
  });

  it('keeps an envelope with no duration out of the histogram', () => {
    const plan = build({ signals: [signal({ kind: 'state', outcome: undefined, code: 'CH-1903', page: 'P007' })] });
    expect(plan.sessions[0]!.hourly[0]!.buckets).toEqual([]);
  });

  it('splits the same shell code by the page it fired on', () => {
    const plan = build({
      signals: [
        signal({ seq: 1, kind: 'state', outcome: undefined, code: 'CH-1903', page: 'P007' }),
        signal({ seq: 2, kind: 'state', outcome: undefined, code: 'CH-1903', page: 'P013' }),
      ],
    });
    expect(plan.sessions[0]!.hourly.map((r) => r.page_id).sort()).toEqual(['P007', 'P013']);
  });

  it("counts a view under its page's ready row, with that row's code", () => {
    const plan = build({ signals: [signal({ kind: 'view', outcome: undefined, code: undefined })] });
    expect(plan.sessions[0]!.hourly[0]).toMatchObject({ code: '70101', bridge_id: 70101, page_id: 'P007' });
  });

  it("reads a client clock that is a day off at the server's time", () => {
    const plan = build({ signals: [signal({ kind: 'state', outcome: undefined, code: 'CH-1903', at: NOW - 3 * 24 * 3600_000 })] });
    expect(plan.sessions[0]!.hourly[0]!.hour).toBe(hourOf(NOW));
  });

  it('builds the session row, keeping a team only for a signed-in sender', () => {
    const signals = [
      signal({ seq: 3, kind: 'view', outcome: undefined, code: undefined, teamId: TEAM, at: NOW - 5000 }),
      signal({ seq: 4, page: 'P013', kind: 'state', outcome: undefined, code: 'CH-13080', at: NOW - 1000, replayId: 'a'.repeat(32) }),
    ];
    const plan = build({ signals, ended: true });
    expect(plan.sessions[0]!.session).toMatchObject({
      session_id: 'sess_12345678',
      user_id: USER,
      team_id: TEAM,
      pages: ['P007', 'P013'],
      count: 2,
      failures: 0,
      ended: true,
      replay_id: 'a'.repeat(32),
      first_at: new Date(NOW - 5000).toISOString(),
      last_at: new Date(NOW - 1000).toISOString(),
    });
    expect(build({ signals, userId: null }).sessions[0]!.session).toMatchObject({ user_id: null, team_id: null });
  });

  it('keeps context in the timeline without counting it or its drift', () => {
    const plan = build({
      context: [signal({ seq: 1, kind: 'state', outcome: undefined, code: 'CH-99999' }), signal({ seq: 2, code: 'CH-7101', outcome: 'success' })],
      signals: [signal({ seq: 2, code: 'CH-7004', outcome: 'failure', message: 'boom' }), signal({ seq: 3, code: 'CH-7004', outcome: 'failure' })],
    });
    const s = plan.sessions[0]!;
    expect(s.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(s.events[1]).toMatchObject({ code: 'CH-7004', outcome: 'failure', message: 'boom' });
    expect(s.hourly.reduce((n, r) => n + r.count, 0)).toBe(2);
    expect(s.drift).toEqual([]);
    expect(s.session.failures).toBe(2);
  });

  it('counts drift over the batch', () => {
    const plan = build({ signals: [signal({ seq: 1, code: 'CH-99999', kind: 'state', outcome: undefined }), signal({ seq: 2, code: 'CH-99999', kind: 'state', outcome: undefined })] });
    expect(plan.sessions[0]!.drift).toEqual([expect.objectContaining({ kind: 'unknown-code', code: 'CH-99999', count: 2 })]);
  });

  it('flags a start with no outcome 30 s before the newest envelope as silent, under its action', () => {
    const plan = build({
      signals: [
        signal({ seq: 1, kind: 'action', outcome: 'start', code: undefined, act: 'messages.send', at: NOW - 40_000 }),
        signal({ seq: 2, kind: 'view', outcome: undefined, code: undefined, at: NOW }),
      ],
    });
    expect(plan.sessions[0]!.drift).toEqual([expect.objectContaining({ kind: 'silent-action', code: 'messages.send', count: 1 })]);
    expect(plan.sessions[0]!.events[0]!.drift).toEqual(['silent-action']);
  });

  it('turns an unreported failure into an admin row under the resolved code, and stamps a reported one', () => {
    const graph = fixtureGraph();
    graph.ids[11703] = { ch: 'CH-1703', page: 'P001', category: 6, name: 'SAVE_FAILED', meaning: 'Save failed', status: 'implemented' };
    graph.chIndex['CH-1703'] = 11703;
    const plan = build({
      graph,
      signals: [
        signal({ seq: 1, kind: 'toast', outcome: 'failure', code: 'CH-7004', serverCode: '42501' }),
        signal({ seq: 2, kind: 'action', outcome: 'failure', code: 'CH-1703', act: 'messages.send', reported: true }),
        signal({ seq: 3, kind: 'crash', outcome: undefined, code: 'CH-7004' }),
      ],
    });
    expect(plan.adminRows.map((r) => [r.code, r.severity, r.title])).toEqual([
      ['CH-7004', 'warning', 'Sending a message throws (CH-7004)'],
      ['CH-7004', 'error', 'Sending a message throws (CH-7004)'],
    ]);
    expect(plan.adminRows[0]!.columns).toMatchObject({ ch_code: 'CH-7004', bridge_id: 70603, page_id: 'P007', server_code: '42501', session_id: 'sess_12345678' });
    expect(plan.stamps).toEqual([{ sessionId: 'sess_12345678', seq: 2, columns: expect.objectContaining({ ch_code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE' }) }]);
  });

  it('caps the admin rows one batch may write', () => {
    const signals = Array.from({ length: MAX_ADMIN_ROWS_PER_BATCH + 3 }, (_, i) => signal({ seq: i, code: 'CH-7004', outcome: 'failure' }));
    const plan = build({ signals });
    expect(plan.adminRows).toHaveLength(MAX_ADMIN_ROWS_PER_BATCH);
    expect(plan.adminCapped).toBe(3);
    expect(plan.sessions[0]!.session.failures).toBe(MAX_ADMIN_ROWS_PER_BATCH + 3);
  });

  it('plans one call per session', () => {
    const plan = build({ signals: [signal({ seq: 1, sessionId: 'sess_aaaaaaaa' }), signal({ seq: 1, sessionId: 'sess_bbbbbbbb' })] });
    expect(plan.sessions.map((s) => s.session.session_id)).toEqual(['sess_aaaaaaaa', 'sess_bbbbbbbb']);
  });
});

describe('buildIngest bounds what a client can mint (security review of #2611, M3)', () => {
  it('stores a release other than the server\'s as "other"', () => {
    const plan = build({
      serverRelease: 'abc1234',
      signals: Array.from({ length: 10 }, (_, i) => signal({ seq: i + 1, kind: 'view', outcome: undefined, code: undefined, release: `made-up-${i}` })),
    });
    const releases = new Set(plan.sessions[0]!.hourly.map((h) => h.release));
    expect([...releases]).toEqual(['other']);
    expect(plan.sessions[0]!.session.release).toBe('other');
  });

  it('keeps the release as sent when the server has none', () => {
    const plan = build({ signals: [signal({ kind: 'view', outcome: undefined, code: undefined, release: 'r1' })] });
    expect(plan.sessions[0]!.hourly[0]!.release).toBe('r1');
  });

  it('folds unknown acts, controls and codes into one hourly key each', () => {
    const plan = build({
      signals: Array.from({ length: 8 }, (_, i) => signal({ seq: i + 1, kind: 'state', outcome: undefined, code: `CH-9${i}999`, act: `NOT-AN-ACTION-${i}` })),
    });
    const hourly = plan.sessions[0]!.hourly;
    expect(hourly).toHaveLength(1);
    expect(hourly[0]).toMatchObject({ code: 'unknown', act: '', count: 8 });
  });

  it('caps drift rows per session batch', () => {
    const plan = build({
      signals: Array.from({ length: 20 }, (_, i) => signal({ seq: i + 1, kind: 'state', outcome: undefined, code: `CH-9${String(i).padStart(2, '0')}99` })),
    });
    expect(plan.sessions[0]!.drift.length).toBeLessThanOrEqual(5);
  });
});

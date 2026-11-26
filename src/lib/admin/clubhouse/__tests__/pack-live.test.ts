/**
 * The live half of a pack's evidence (pack-live.ts): what counts as "this target" in the hourly counters, the failed
 * sessions, their events and the rule hits; "No signal yet" (naming the held migration) when the tables are missing;
 * people pseudonymous through the labels the caller passes (D7); and one read shared by every live section.
 */
import { describe, it, expect, vi } from 'vitest';
import { fixtureGraph } from './fixtures';
import { BASE_RELEASE, LIVE_RELEASE, NOW, U, badDay, ev, h, session } from './fixtures-live';
import { categoryLookup, pipeStatus, runRules } from '../live-model';
import { buildPack, packTargetKey, resolvePackTarget, type PackLiveContext } from '../pack';
import {
  SIGNAL_MIGRATION,
  alertMatches,
  countersSection,
  envelopesSection,
  eventMatches,
  hourlyMatches,
  releaseSection,
  rulesSection,
  sessionsFor,
  sessionsSection,
  type PackLiveData,
} from '../pack-live';

vi.mock('server-only', () => ({}));
vi.mock('../live', () => ({ readLiveSnapshot: vi.fn(), readPeopleNames: vi.fn(async () => new Map()) }));

// Pseudonyms are keyed (pseudonym.ts): a test key, so they print rather than read "withheld".
process.env.BRIDGE_PSEUDONYM_KEY = 'test-pseudonym-key-0123456789abcdefghij';

const graph = fixtureGraph();
graph.actions['ACT-P007-SEND-MESSAGE']!.useActionName = 'messages.send';
const ctx = (subject: string): PackLiveContext => ({ includeNames: false, subject });
const labels = {
  person: (id: string | null) => (id ? `u-${id.slice(0, 4)}` : null),
  team: (id: string | null) => (id ? `t-${id.slice(0, 4)}` : null),
  session: (id: string | null) => (id ? `s-${id.slice(0, 4)}` : null),
};

const failed = session({ session_id: 'sess_fail0001', failure_count: 2, user_id: U[1]!, team_id: 'team-9' });
const other = session({ session_id: 'sess_fail0002', failure_count: 1, release: BASE_RELEASE });
const events = [
  ev({ session_id: 'sess_fail0001', seq: 1, kind: 'tap', control_id: 'CTL-P007-014' }),
  ev({ session_id: 'sess_fail0001', seq: 2, kind: 'action', outcome: 'failure', code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE', act: 'messages.send', server_code: '42501', trail: ['P002', 'P007', 'CTL-P007-014'] }),
  ev({ session_id: 'sess_fail0002', seq: 1, kind: 'crash', code: 'CH-1903', bridge_id: 10703, page_id: 'P002' }),
];

function data(over: Partial<PackLiveData> = {}): PackLiveData {
  const day = badDay();
  const alerts = runRules({
    now: NOW,
    release: LIVE_RELEASE,
    ...day,
    pipe: pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 60_000).toISOString(), now: NOW, activeHours: true }),
    categoryOf: categoryLookup(graph),
  });
  return {
    state: 'ok',
    truncated: false,
    rows: [...day.dayRows, h({ hoursAgo: 60, release: BASE_RELEASE, code: 'CH-7004', outcome: 'failure', bridge_id: 70603, signal_count: 1 })],
    sessions: [failed, other],
    events,
    alerts,
    ...over,
  };
}

const t = (raw: string) => resolvePackTarget(graph, raw)!;

describe('what belongs to a target', () => {
  it('a code matches by Bridge ID or CH code; an action by its useAction name or ACT id; a control by its id', () => {
    const code = hourlyMatches(graph, t('70603'));
    expect(code(h({ code: 'CH-7004', bridge_id: null }))).toBe(true);
    expect(code(h({ code: 'CH-9', bridge_id: 70603 }))).toBe(true);
    expect(code(h({ code: 'CH-7101' }))).toBe(false);
    expect(hourlyMatches(graph, t('ACT-P007-SEND-MESSAGE'))(h({ kind: 'action', act: 'messages.send' }))).toBe(true);
    expect(eventMatches(graph, t('ACT-P007-SEND-MESSAGE'))(events[1]!)).toBe(true);
    expect(eventMatches(graph, t('70603'))(events[2]!)).toBe(false);
  });

  it('a release, person or team picks sessions by their own columns; a code by the events in them', () => {
    expect(sessionsFor(graph, t(packTargetKey.release(LIVE_RELEASE.slice(0, 7))), [failed, other], events).map((s) => s.session_id)).toEqual(['sess_fail0001']);
    expect(sessionsFor(graph, t(packTargetKey.person(U[1]!)), [failed, other], events).map((s) => s.session_id)).toEqual(['sess_fail0001']);
    expect(sessionsFor(graph, t('CH-1903'), [failed, other], events).map((s) => s.session_id)).toEqual(['sess_fail0002']);
  });

  it('a person’s rule hits are the per-session ones in their sessions', () => {
    const match = alertMatches(graph, t(packTargetKey.person(U[1]!)), new Set(['sess_fail0001']));
    expect(match({ rule: 'R-06', severity: 'high', title: 'x', evidence: { sessionId: 'sess_fail0001' } })).toBe(true);
    expect(match({ rule: 'R-01', severity: 'high', title: 'x', code: 'CH-7004', evidence: {} })).toBe(false);
  });
});

describe('the sections', () => {
  it('counts and their split, with first and last seen', () => {
    const s = countersSection(graph, t('70603'), data(), ctx('70603 · CH-7004'));
    expect(s.state).toBe('ok');
    const expected = data().rows.filter(hourlyMatches(graph, t('70603'))).reduce((n, r) => n + r.signal_count, 0);
    expect(s.note).toMatch(new RegExp(`^${expected} signal\\(s\\) for 70603 · CH-7004 in the last 8 days, ${expected} of them failures; first seen `));
    expect(s.rows?.[0]).toMatchObject({ release: LIVE_RELEASE.slice(0, 7), role: 'coach', platform: 'ios-app', signals: expected - 1, failures: expected - 1 });
    expect(s.rows?.[1]).toMatchObject({ release: BASE_RELEASE.slice(0, 7), signals: 1 });
  });

  it('a team has no counters and says why, rather than zero', () => {
    const s = countersSection(graph, t(packTargetKey.team('7c9e6679-7425-40de-944b-e07fc1f90ae7')), data(), ctx('team t-1'));
    expect(s.state).toBe('ok');
    expect(s.rows).toBeUndefined();
    expect(s.note).toContain('carry no team');
  });

  it('envelopes are the newest failures with their trails and server codes', () => {
    const s = envelopesSection(graph, t('CH-7004'), data(), ctx('70603 · CH-7004'), labels);
    expect(s.rows).toEqual([expect.objectContaining({ session: 's-sess', code: 'CH-7004', kind: 'action failure', server: '42501', trail: 'P002 > P007 > CTL-P007-014' })]);
  });

  it('sessions print people through the labels: pseudonymous by default', () => {
    const s = sessionsSection(graph, t('70603'), data(), ctx('70603'), labels);
    expect(s.rows).toEqual([expect.objectContaining({ session: 's-sess', person: `u-${U[1]!.slice(0, 4)}`, team: 't-team', failures: 2 })]);
    expect(JSON.stringify(s)).not.toContain(U[1]!);
  });

  it('the release it started in is the earliest that sent it; a release pack lists what is new or rising', () => {
    const started = releaseSection(graph, t('70603'), data(), ctx('70603'));
    expect(started.rows?.[0]).toMatchObject({ release: BASE_RELEASE.slice(0, 7) });
    expect(started.note).toContain(`First sent by ${BASE_RELEASE.slice(0, 7)}`);
    const regression = releaseSection(graph, t(packTargetKey.release(LIVE_RELEASE)), data(), ctx('release b2c3d4e'));
    expect(regression.title).toBe('What it changed (against the release before)');
    expect(regression.note).toContain(`against ${BASE_RELEASE.slice(0, 7)}`);
  });

  it('rules firing name the target’s hits, worst first', () => {
    const s = rulesSection(graph, t('CH-7004'), data(), ctx('70603 · CH-7004'));
    expect(s.state).toBe('ok');
    expect(s.rows?.length).toBeGreaterThan(0);
    expect(s.rows!.every((r) => typeof r.rule === 'string')).toBe(true);
  });

  it('missing tables are "No signal yet" naming the held migration; a failed read is failed', () => {
    for (const section of [countersSection, envelopesSection, releaseSection, rulesSection]) {
      const s = section(graph, t('70603'), data({ state: 'no-signal' }), ctx('70603'), labels);
      expect(s.state).toBe('no-signal');
      expect(s.note).toContain(SIGNAL_MIGRATION);
    }
    expect(sessionsSection(graph, t('70603'), data({ state: 'error', error: 'boom' }), ctx('70603'), labels)).toMatchObject({ state: 'failed', note: 'boom' });
  });
});

describe('livePackSources', () => {
  it('replaces the placeholders by id, adds the rules, and reads once for the whole pack', async () => {
    const { livePackSources } = await import('../pack-server');
    const load = vi.fn(async () => data());
    const pack = await buildPack(graph, t('70603'), { sources: livePackSources(load) });
    expect(load).toHaveBeenCalledTimes(1);
    expect(pack.evidence.map((e) => [e.source, e.state])).toEqual([
      ['counters', 'ok'],
      ['envelopes', 'ok'],
      ['sessions', 'ok'],
      ['release', 'ok'],
      ['rules', 'ok'],
    ]);
  });

  it('a person pack never prints the user id, in any live section', async () => {
    const { livePackSources, packPseudonym } = await import('../pack-server');
    const pack = await buildPack(graph, t(packTargetKey.person(U[1]!)), { pseudonymize: packPseudonym, sources: livePackSources(async () => data()) });
    expect(JSON.stringify(pack)).not.toContain(U[1]!);
    expect(pack.evidence.find((e) => e.source === 'sessions')?.rows?.[0]?.person).toMatch(/^u-[0-9a-f]{12}$/);
    expect(JSON.stringify(pack)).not.toContain('sess_fail0001');
  });
});

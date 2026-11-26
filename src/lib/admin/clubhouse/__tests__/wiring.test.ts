// @vitest-environment jsdom
/**
 * The error feed's whole chain, through the real code at each hop:
 *
 *   phone: useAction's failure → chSignal (src/clubhouse/lib/signal.ts) → the beacon body
 *   route: parseSignalBatch → redactSignal → buildIngest (the /api/ch/signal route's steps)
 *   SQL:   clubhouse_ingest_signals stores each event row key for key (storedEvent mirrors its INSERT; production's
 *          function was read on 2026-11-26 and maps seq, at→sent_at, kind, outcome, code, bridge_id, page_id, act,
 *          action_id, control_id, duration_ms, server_code, message (cut to 2000), trail, drift)
 *   feed:  buildFeed with the real bridge-graph.json → headline, page, button, explanation, "still failing?"
 *
 * Offline: no network, no database. A break at any hop (a field dropped, a key renamed, a code not resolved) fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import graphJson from '../../../../../docs/clubhouse/generated/bridge-graph.json';

vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => true }));
vi.mock('@sentry/nextjs', () => ({ getReplay: () => null }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { chSignal, configureSignals, flushSignals, noteSignalTrail, resetSignalsForTests } from '@/clubhouse/lib/signal';
import { serverCodeIn } from '@/clubhouse/lib/use-action';
import { parseSignalBatch, redactSignal } from '@/lib/admin/clubhouse/signal';
import { buildIngest, type EventRow, type SessionRow as PlanSession } from '@/lib/admin/clubhouse/ingest';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import type { SessionEventRow, SessionRow } from '@/lib/admin/clubhouse/live-model';
import { EMPTY_NOTES } from '@/lib/admin/clubhouse/notes';
import { buildFeed, fixStatus, hourlyCodeOf, isCatchAll, itemExplanation, itemHeadline, itemHeadlineQuoted, trailLines, whereOf } from '@/lib/admin/clubhouse/feed';

const graph = graphJson as unknown as BridgeGraph;
const TEAM = '66666666-7777-4888-9999-000000000000';
const USER = '11111111-2222-4333-8444-555555555555';

/** clubhouse_ingest_signals' INSERT into clubhouse_session_events, as a function. */
function storedEvent(sessionId: string, e: EventRow): SessionEventRow {
  return {
    session_id: sessionId,
    seq: e.seq,
    sent_at: e.at,
    kind: e.kind,
    outcome: e.outcome,
    code: e.code,
    bridge_id: e.bridge_id,
    page_id: e.page_id,
    act: e.act,
    action_id: e.action_id,
    control_id: e.control_id,
    duration_ms: e.duration_ms,
    server_code: e.server_code,
    message: e.message === null ? null : e.message.slice(0, 2000),
    trail: e.trail,
    drift: e.drift,
  };
}

/** clubhouse_ingest_signals' upsert into clubhouse_sessions (first_at→started_at, count→signal_count, ...). */
function storedSession(s: PlanSession): SessionRow {
  return {
    session_id: s.session_id,
    user_id: s.user_id,
    role: s.role,
    team_id: s.team_id,
    platform: s.platform,
    release: s.release,
    started_at: s.first_at,
    last_at: s.last_at,
    ended_at: s.ended ? s.last_at : null,
    pages: s.pages,
    signal_count: s.count,
    failure_count: s.failures,
    replay_id: s.replay_id,
  };
}

let beacon: ReturnType<typeof vi.fn>;
const bodies = () => beacon.mock.calls.map(([, blob]) => JSON.parse((blob as { text: string }).text) as unknown);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T18:40:00.000Z'));
  resetSignalsForTests();
  sessionStorage.clear();
  vi.stubGlobal(
    'Blob',
    class {
      text: string;
      constructor(parts: string[]) {
        this.text = parts.join('');
      }
    },
  );
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Phone → route → SQL → feed, for whatever the test did on the phone. */
function throughThePipe() {
  flushSignals(true);
  const [body] = bodies();
  const batch = parseSignalBatch(body);
  if (!batch.ok) throw new Error(`batch refused: ${batch.reason}`);
  const plan = buildIngest({
    signals: batch.signals.map((s) => redactSignal(s)),
    context: batch.context.map((s) => redactSignal(s)),
    ended: batch.ended,
    graph,
    userId: USER,
    now: Date.now(),
  });
  const sessions = plan.sessions.map((p) => storedSession(p.session));
  const events = plan.sessions.flatMap((p) => p.events.map((e) => storedEvent(p.session.session_id, e)));
  const failures = events.filter((e) => e.kind === 'crash' || e.outcome === 'failure');
  const items = buildFeed({ graph, events: failures, sessions, teamNames: new Map([[TEAM, 'Demo University Golf']]), notes: EMPTY_NOTES, fresh: new Set(), release: sessions[0]?.release ?? null });
  return { plan, sessions, events, failures, items };
}

describe('error feed wiring, phone to panel', () => {
  it('a coded save that fails offline: their words, the page, the button, and the cause from the message', () => {
    configureSignals({ enabled: true, role: 'coach', teamId: TEAM, page: 'P001', userId: USER });
    chSignal({ kind: 'view' });
    chSignal({ kind: 'tap', control: 'CTL-P001-001' });
    const message = 'Load failed';
    chSignal({ kind: 'action', outcome: 'failure', code: 'CH-1001', act: 'shell.markAllRead', durationMs: 1800, message, serverCode: serverCodeIn(message) });

    const { failures, items, sessions } = throughThePipe();
    expect(failures).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ role: 'coach', team_id: TEAM, platform: 'ios-app', failure_count: 1 });
    const [item] = items;
    expect(item).toMatchObject({ code: 'CH-1001', catalogCode: 'CH-1001', role: 'coach', teamName: 'Demo University Golf', pageName: 'Shell', message: 'Load failed', act: 'shell.markAllRead' });
    expect(itemHeadline(item!)).toBe('Couldn’t mark your notifications read');
    expect(itemHeadlineQuoted(item!)).toBe(true);
    expect(itemExplanation(item!)).toMatchObject({ label: 'Connection dropped', basis: 'message' });
  });

  it('a save with no code of its own (CH-1703) still names the action, and the server code survives every hop', () => {
    configureSignals({ enabled: true, role: 'player', teamId: TEAM, page: 'P007', userId: USER });
    chSignal({ kind: 'view' });
    chSignal({ kind: 'tap', control: 'CTL-P007-015' });
    const message = 'new row violates row-level security policy for table "golf_messages" (code 42501)';
    chSignal({ kind: 'action', outcome: 'failure', code: 'CH-1703', act: 'messages.send', durationMs: 900, message, serverCode: serverCodeIn(message) });

    const { failures, items, events } = throughThePipe();
    expect(failures[0]).toMatchObject({ server_code: '42501', act: 'messages.send', code: 'CH-1703' });
    expect(failures[0]!.message).toContain('42501');
    const [item] = items;
    expect(item).toMatchObject({ serverCode: '42501', act: 'messages.send', role: 'player' });
    expect(itemExplanation(item!)).toMatchObject({ label: 'Row rule refused', owner: 'access', basis: 'server code' });
    // "Which button": the failure carries no control, so the panel takes the session's last press before it.
    const where = whereOf(item!, graph, events);
    expect(where.control?.id).toBe('CTL-P007-015');
    expect(where.actName).toBe('messages.send');
    // "Still failing?" keys on what the hourly store counts: the sent code and the action, never the generic code alone.
    expect(hourlyCodeOf(item!)).toBe('CH-1703');
    const lines = trailLines(events, graph, { sessionId: item!.sessionId, seq: item!.seq }, 'player');
    expect(lines.at(-1)!.text).toContain('Row rule refused (42501)');
  });

  it('a crash arrives as a crash, explained as one', () => {
    configureSignals({ enabled: true, role: 'coach', teamId: TEAM, page: 'P002', userId: USER });
    chSignal({ kind: 'view' });
    noteSignalTrail('opened the week strip');
    chSignal({ kind: 'crash', code: 'CH-1205', message: 'TypeError: Cannot read properties of undefined (reading "map")' });

    const { items } = throughThePipe();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'crash', code: 'CH-1205' });
    expect(itemExplanation(items[0]!)).toMatchObject({ label: 'Section crashed', basis: 'kind' });
    expect(items[0]!.trail).toContain('opened the week strip');
  });

  it('a message carrying an email or a URL secret is redacted before it is stored', () => {
    configureSignals({ enabled: true, role: 'coach', teamId: TEAM, page: 'P001', userId: USER });
    chSignal({ kind: 'action', outcome: 'failure', code: 'CH-1001', act: 'shell.markAllRead', message: 'Failed for coach.avery@example.com at https://x.test/a?token=abc123secret' });
    const { failures } = throughThePipe();
    expect(failures[0]!.message).not.toContain('coach.avery@example.com');
    expect(failures[0]!.message).not.toContain('abc123secret');
  });

  it('"still failing?" on a shell-wide catch-all code counts only this page', () => {
    // The hourly store keeps no act for an unmapped save, so two CH-1703 saves differ only by page.
    const rows = [
      { code: 'CH-1703', release: 'r1', at: '2026-11-20T10:00:00.000Z', page_id: 'P017' },
      { code: 'CH-1703', release: 'r1', at: '2026-11-21T10:00:00.000Z', page_id: 'P007' },
    ];
    const self = { release: 'r2', at: '2026-11-26T18:40:00.000Z', page: 'P007' };
    expect(fixStatus(rows, 'CH-1703', 'r2', self, 'P007')).toMatchObject({ state: 'still-failing' });
    expect(fixStatus(rows, 'CH-1703', 'r2', { ...self, page: 'P003' }, 'P003')).toMatchObject({ state: 'new-in-live' });
    expect(isCatchAll(graph, { bridgeId: graph.chIndex['CH-1703']!, page: 'P007' })).toBe(true);
    expect(isCatchAll(graph, { bridgeId: graph.chIndex['CH-1001']!, page: 'P001' })).toBe(false);
  });
});

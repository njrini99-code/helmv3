// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chSignalSchema, parseSignalBatch } from '@/lib/admin/clubhouse/signal';

vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('@sentry/nextjs', () => ({ getReplay: () => ({ getReplayId: () => 'b'.repeat(32) }) }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { logError } from '@/lib/error-logging';
import {
  chSignal,
  configureSignals,
  currentReportSignal,
  FLUSH_AT,
  FLUSH_MS,
  flushSignals,
  noteSignalTrail,
  reportingSignal,
  resetSignalsForTests,
  SIGNAL_ENDPOINT,
} from '../signal';
import { chReport } from '../track';

const TEAM = '66666666-7777-4888-9999-000000000000';

function beacons(spy: ReturnType<typeof vi.fn>): { signals: Record<string, unknown>[]; context?: Record<string, unknown>[]; ended?: boolean }[] {
  return spy.mock.calls.map(([, blob]) => JSON.parse((blob as { text: string }).text));
}

describe('client signals', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetSignalsForTests();
    sessionStorage.clear();
    vi.mocked(logError).mockClear();
    // jsdom's Blob can't be read synchronously: keep the text it was made from.
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

  it('sends nothing, and gives no ref, while the switch is off', () => {
    configureSignals({ enabled: false, role: 'coach', page: 'P007' });
    expect(chSignal({ kind: 'view' })).toBeNull();
    flushSignals();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('builds envelopes the route accepts, and posts them after 10 s', () => {
    configureSignals({ enabled: true, role: 'coach', teamId: TEAM, page: 'P007' });
    const ref = chSignal({ kind: 'action', outcome: 'success', code: 'CH-1702', act: 'messages.send', durationMs: 412.6 });
    expect(ref).toMatchObject({ seq: 0, page: 'P007', code: 'CH-1702', act: 'messages.send' });
    expect(beacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(beacon).toHaveBeenCalledOnce();
    expect(beacon.mock.calls[0]![0]).toBe(SIGNAL_ENDPOINT);
    const body = beacons(beacon)[0]!;
    const parsed = parseSignalBatch(body);
    expect(parsed).toMatchObject({ ok: true, dropped: 0 });
    expect(chSignalSchema.parse(body.signals[0])).toMatchObject({
      v: 1,
      kind: 'action',
      page: 'P007',
      role: 'coach',
      teamId: TEAM,
      sessionId: ref!.sessionId,
      durationMs: 413,
      release: 'unknown',
      platform: 'desktop',
    });
  });

  it(`posts at once at ${FLUSH_AT}`, async () => {
    configureSignals({ enabled: true, role: 'player', page: 'P011' });
    for (let i = 0; i < FLUSH_AT; i++) chSignal({ kind: 'state', code: 'CH-1903' });
    await Promise.resolve();
    expect(beacon).toHaveBeenCalledOnce();
    expect(beacons(beacon)[0]!.signals).toHaveLength(FLUSH_AT);
  });

  it("holds signals sent before the shell configured, then sends them under the shell's page", () => {
    // No place to report yet: nothing reaches chReport, the error logs or Sentry while the switch is unknown (L1).
    expect(chSignal({ kind: 'state', code: 'CH-1211' })).toBeNull();
    configureSignals({ enabled: true, role: 'coach', page: 'P003' });
    flushSignals();
    expect(beacons(beacon)[0]!.signals[0]).toMatchObject({ page: 'P003', code: 'CH-1211', seq: 0 });
  });

  it('drops what waited when the switch turns out to be off', () => {
    chSignal({ kind: 'state', code: 'CH-1211' });
    configureSignals({ enabled: false, role: 'coach', page: 'P003' });
    flushSignals();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('a toast sends its code, never its words (they can name players, teams and files)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/clubhouse/ui/Toast.tsx', 'utf8');
    const call = src.match(/chSignal\(\{ kind: 'toast', code, outcome[^)]*\)/)?.[0] ?? '';
    expect(call).not.toBe('');
    expect(call).not.toMatch(/message|title|body/);
  });

  it('starts a new session when someone else signs in on the same tab', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P007', userId: 'coach-1' });
    const coach = chSignal({ kind: 'view' })!;
    configureSignals({ enabled: true, role: 'player', page: 'P007', userId: 'player-2' });
    const player = chSignal({ kind: 'view' })!;
    expect(player.sessionId).not.toBe(coach.sessionId);
    expect(player.seq).toBe(0);
    resetSignalsForTests();
    configureSignals({ enabled: true, role: 'coach', page: 'P007', userId: 'coach-1' });
    expect(chSignal({ kind: 'view' })!.sessionId).not.toBe(player.sessionId);
  });

  it('keeps numbering through a reload in the same tab', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    const first = chSignal({ kind: 'view' })!;
    resetSignalsForTests();
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    const second = chSignal({ kind: 'view' })!;
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.seq).toBe(first.seq + 1);
    expect(first.sessionId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('gives a failure its message, trail, replay and the envelopes before it as context', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    chSignal({ kind: 'view' });
    chSignal({ kind: 'action', outcome: 'start', act: 'messages.send' });
    flushSignals();
    noteSignalTrail('tapped send');
    chSignal({ kind: 'action', outcome: 'failure', code: 'CH-1703', act: 'messages.send', message: 'x'.repeat(3000), serverCode: '42501', reported: true });
    flushSignals(true);
    const second = beacons(beacon)[1]!;
    expect(second.ended).toBe(true);
    expect(second.context?.map((s) => s.seq)).toEqual([0, 1]);
    const failure = chSignalSchema.parse(second.signals[0]);
    expect(failure).toMatchObject({ outcome: 'failure', serverCode: '42501', reported: true, replayId: 'b'.repeat(32) });
    expect(failure.message).toHaveLength(2000);
    expect(failure.trail).toEqual(['view', 'action start messages.send', 'tapped send']);
    expect(parseSignalBatch(second)).toMatchObject({ ok: true, dropped: 0 });
  });

  it('keeps free text off everything that is not a failure, and drops fields that would fail the schema', () => {
    configureSignals({ enabled: true, role: 'admin', page: 'P007' });
    chSignal({ kind: 'toast', code: 'CH-1702', message: 'saved for coach@example.test', surface: 'Not A Surface', act: 'bad act!' });
    expect(chSignal({ kind: 'state', code: 'nope' })).toBeNull();
    flushSignals();
    const sent = beacons(beacon)[0]!.signals[0]!;
    expect(sent).not.toHaveProperty('message');
    expect(sent).not.toHaveProperty('surface');
    expect(sent).not.toHaveProperty('act');
    expect(sent.role).toBe('signed-out');
    expect(chSignalSchema.safeParse(sent).success).toBe(true);
  });

  it('stores nothing in the tab until the shell turns signals on', () => {
    chSignal({ kind: 'view' });
    expect(sessionStorage.length).toBe(0);
    configureSignals({ enabled: false, role: 'coach', page: 'P007' });
    expect(chSignal({ kind: 'view' })).toBeNull();
    expect(sessionStorage.length).toBe(0);
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    expect(sessionStorage.length).toBe(1);
  });

  it('lets a report carry the signal it reports, only while reportingSignal runs it', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    const ref = chSignal({ kind: 'action', outcome: 'failure', code: 'CH-1703', act: 'messages.send', message: 'nope', reported: true });
    reportingSignal(ref, () => chReport(new Error('nope'), { surface: 'messages', action: 'messages.send', severity: 'low' }));
    chReport(new Error('later'), { surface: 'messages' });
    const [inside, outside] = vi.mocked(logError).mock.calls;
    expect(inside![1]).toMatchObject({ ui: 'clubhouse', surface: 'messages', action: 'messages.send', chSignal: ref });
    expect(inside![2]).toBe('low');
    expect(outside![1]).not.toHaveProperty('chSignal');
    // A report that throws still leaves no signal behind for the next one.
    expect(() => reportingSignal(ref, () => {
      throw new Error('boom');
    })).toThrow('boom');
    expect(currentReportSignal()).toBeNull();
  });

  it('falls back to a keepalive fetch when the beacon is refused', () => {
    beacon.mockReturnValue(false);
    const fetchSpy = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchSpy);
    configureSignals({ enabled: true, role: 'coach', page: 'P007' });
    chSignal({ kind: 'view' });
    flushSignals();
    expect(fetchSpy).toHaveBeenCalledWith(SIGNAL_ENDPOINT, expect.objectContaining({ method: 'POST', keepalive: true }));
  });
});

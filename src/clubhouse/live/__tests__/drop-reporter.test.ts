// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { chReport } from '../../lib/track';
import { channelDropReporter, REPORT_AFTER_FAILURES } from '../channel';

/**
 * 2169818a ("season home realtime channel error"): the tournaments and qualifier pages subscribe a postgres_changes channel
 * that supabase-js rejoins by itself, and each reported every CHANNEL_ERROR, so one network blip on a phone reached the
 * Bridge as an incident. joinLiveTopic already reports once per outage (#2592); these channels now share that rule.
 */
describe('channelDropReporter: one report per outage (2169818a)', () => {
  beforeEach(() => vi.mocked(chReport).mockClear());

  it('does not report a drop the channel recovers from', () => {
    const onStatus = channelDropReporter('season home realtime channel error', 'tournaments.home.live');
    onStatus('SUBSCRIBED');
    for (let i = 1; i < REPORT_AFTER_FAILURES; i += 1) onStatus('CHANNEL_ERROR');
    onStatus('SUBSCRIBED');
    expect(chReport).not.toHaveBeenCalled();
  });

  it('reports once after REPORT_AFTER_FAILURES failed statuses in a row, with the surface and the count', () => {
    const onStatus = channelDropReporter('season home realtime channel error', 'tournaments.home.live');
    for (let i = 0; i < REPORT_AFTER_FAILURES + 3; i += 1) onStatus(i % 2 ? 'TIMED_OUT' : 'CHANNEL_ERROR');
    expect(chReport).toHaveBeenCalledTimes(1);
    const [error, ctx] = vi.mocked(chReport).mock.calls[0]!;
    expect((error as Error).message).toBe('season home realtime channel error');
    expect(ctx).toMatchObject({ surface: 'tournaments.home.live', severity: 'low', extra: { failures: REPORT_AFTER_FAILURES } });
  });

  it('a SUBSCRIBED ends the outage, so the next outage is reported again', () => {
    const onStatus = channelDropReporter('qualifier realtime channel error', 'qualifiers.live');
    for (let i = 0; i < REPORT_AFTER_FAILURES; i += 1) onStatus('CHANNEL_ERROR');
    onStatus('SUBSCRIBED');
    for (let i = 0; i < REPORT_AFTER_FAILURES; i += 1) onStatus('CHANNEL_ERROR');
    expect(chReport).toHaveBeenCalledTimes(2);
  });

  it('CLOSED (the page leaving) is not a failure', () => {
    const onStatus = channelDropReporter('qualifier realtime channel error', 'qualifiers.live');
    for (let i = 0; i < REPORT_AFTER_FAILURES * 2; i += 1) onStatus('CLOSED');
    expect(chReport).not.toHaveBeenCalled();
  });
});

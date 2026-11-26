/** E5 (Bridge plan §4.2): a failed Clubhouse server read carries a `state` failure on the row chLogServer writes. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flags = { on: true };
const logServerError = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flags.on }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...args: unknown[]) => logServerError(...args) }));

import { chLogServer } from '../track-server';

beforeEach(() => {
  flags.on = true;
  logServerError.mockClear();
});

describe('chLogServer (E5)', () => {
  it('adds metadata.bridge with the surface, the read and the server code while the switch is on', () => {
    chLogServer('home', 'rounds', { code: 'PGRST116', message: 'no rows' });
    const ctx = logServerError.mock.calls[0]![1] as { action: string; metadata?: { bridge?: Record<string, unknown> } };
    expect(ctx.action).toBe('clubhouse.home.rounds');
    expect(ctx.metadata?.bridge).toEqual({ origin: 'E5', kind: 'state', outcome: 'failure', surface: 'home', read: 'rounds', serverCode: 'PGRST116' });
  });
  it('logs exactly as before with the switch off', () => {
    flags.on = false;
    chLogServer('home', 'rounds', new Error('boom'));
    const ctx = logServerError.mock.calls[0]![1] as Record<string, unknown>;
    expect(ctx).not.toHaveProperty('metadata');
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

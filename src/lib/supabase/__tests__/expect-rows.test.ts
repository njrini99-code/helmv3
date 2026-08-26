/**
 * @vitest-environment node
 *
 * expectRows ultimately writes through logServerEvent (mocked below), which
 * on the client-reachable path is reached without a `server-only` guard of
 * its own — but this MODULE (expect-rows.ts) does import 'server-only', so
 * pin to node the same way with-golf-action's tests do, for consistency with
 * the rest of this file's server-module test conventions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { expectRows } from '../expect-rows';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

beforeEach(() => {
  vi.clearAllMocks();
  __resetEmitThrottleForTests();
});

describe('expectRows', () => {
  it('returns the result unchanged and logs nothing when rows are present', async () => {
    const result = { data: [{ id: '1' }], error: null };
    const returned = expectRows(result, {
      action: 'getMyPlayerRow',
      featureArea: 'golf-player-hub',
      table: 'golf_players',
    });

    expect(returned).toBe(result);
    // Give any accidental fire-and-forget log a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('returns the result unchanged and logs nothing when a real Postgres error is present, even with empty data', async () => {
    const result = { data: null, error: { code: '42501', message: 'row-level security policy' } };
    const returned = expectRows(result, {
      action: 'getMyPlayerRow',
      featureArea: 'golf-player-hub',
      table: 'golf_players',
    });

    expect(returned).toBe(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // expectRows defers to maybeCaptureRlsDenial for an EXPLICIT error — it
    // is not this function's job to log one itself.
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('emits a source: rls_denial warning and returns the result unchanged for a silent empty array result', async () => {
    const result = { data: [] as unknown[], error: null };
    const returned = expectRows(result, {
      action: 'getMyTeamMembership',
      featureArea: 'golf-team-access',
      table: 'golf_team_members',
      userId: 'user-1',
      teamId: 'team-1',
    });

    expect(returned).toBe(result);
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [message, context, severity] = mocks.logServerEvent.mock.calls[0]! as unknown[];
    expect(message).toContain('golf_team_members');
    expect(message).toContain('getMyTeamMembership');
    expect(severity).toBe('warning');
    expect(context).toMatchObject({
      action: 'getMyTeamMembership',
      source: 'rls_denial',
      featureArea: 'golf-team-access',
      sport: 'golf',
      userId: 'user-1',
      teamId: 'team-1',
      skipSentry: true,
    });
  });

  it('emits for a silent empty single-row (null) result the same as an empty array', async () => {
    const result = { data: null as { id: string } | null, error: null };
    const returned = expectRows(result, {
      action: 'getMyPlayerRow',
      featureArea: 'golf-player-hub',
      table: 'golf_players',
    });

    expect(returned).toBe(result);
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('emits-once: a second call for the same action/table within the throttle window does not log again', async () => {
    const ctx = {
      action: 'getMyQualifierEntry',
      featureArea: 'golf-qualifiers',
      table: 'golf_qualifier_entries',
    };

    expectRows({ data: [], error: null }, ctx);
    expectRows({ data: [], error: null }, ctx);
    expectRows({ data: [], error: null }, ctx);

    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, context] = mocks.logServerEvent.mock.calls[0]! as unknown[];
    expect(context).not.toHaveProperty('metadata.collapsed_count');
  });

  it('a DIFFERENT action/table pair is not throttled by an unrelated call', async () => {
    expectRows(
      { data: [], error: null },
      { action: 'actionOne', featureArea: 'golf-a', table: 'golf_table_one' },
    );
    expectRows(
      { data: [], error: null },
      { action: 'actionTwo', featureArea: 'golf-b', table: 'golf_table_two' },
    );

    expect(mocks.logServerEvent).toHaveBeenCalledTimes(2);
  });
});

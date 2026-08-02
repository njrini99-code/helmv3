// =============================================================================
// src/lib/baseball/__tests__/timeline-writer-system-gate.test.ts
//
// deepsec wave 2 — the service-role (RLS-bypass) gate in appendTimelineEvent
// used to be keyed ONLY on `source_type`, which is derived from the
// caller-supplied `input.source`. `kind` (→ event_type) and `visibility` were
// unconstrained, so `{ kind: 'note', source: 'ai', visibility: 'staff_only' }`
// with `{ system: true }` would have selected the admin client and written a
// coach-authored note straight past the coach-only INSERT policy — exactly what
// the "a caller cannot smuggle a coach note through service-role" comment
// claimed was impossible.
//
// These lock in the gate's THREE conditions, and in particular that 'lift'
// stays on the allowlist: appendLiftTimelineEvent's player branch is the one
// legitimate service-role writer of a non-system kind.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

let clientsUsed: Array<'admin' | 'rls'> = [];

function makeClient(which: 'admin' | 'rls') {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            clientsUsed.push(which);
            return { data: { id: 'tl-1' }, error: null };
          },
        }),
      }),
    }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeClient('admin')),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient('rls')),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import {
  appendTimelineEvent,
  appendSystemTimelineEvent,
  appendLiftTimelineEvent,
} from '@/lib/baseball/timeline-writer';

const base = { teamId: 'team-1', playerId: 'player-1', title: 'x' };

describe('appendTimelineEvent service-role gate', () => {
  beforeEach(() => {
    clientsUsed = [];
  });

  it('refuses service-role for a coach-authored kind even when the source is overridden to ai', async () => {
    const res = await appendTimelineEvent(
      { ...base, kind: 'note', source: 'ai', visibility: 'staff_only' },
      { system: true },
    );

    expect(res.ok).toBe(true);
    expect(clientsUsed).toEqual(['rls']);
  });

  it.each(['stat', 'practice', 'import', 'recruiting', 'roster'] as const)(
    'refuses service-role for kind=%s with a system source override',
    async (kind) => {
      await appendTimelineEvent({ ...base, kind, source: 'system' }, { system: true });
      expect(clientsUsed).toEqual(['rls']);
    },
  );

  it('still allows service-role for genuine system/AI events', async () => {
    await appendSystemTimelineEvent({ ...base, kind: 'ai', source: 'ai' });
    await appendSystemTimelineEvent({ ...base, kind: 'system' });
    await appendSystemTimelineEvent({ ...base, kind: 'stat_milestone' });

    expect(clientsUsed).toEqual(['admin', 'admin', 'admin']);
  });

  it("keeps 'lift' on the allowlist so a player-logged lift can still reach the timeline", async () => {
    await appendLiftTimelineEvent({ ...base, actorIsCoach: false });
    expect(clientsUsed).toEqual(['admin']);
  });

  it('routes a coach-entered lift through the RLS client (honest manual provenance)', async () => {
    await appendLiftTimelineEvent({ ...base, actorIsCoach: true });
    expect(clientsUsed).toEqual(['rls']);
  });

  it('never uses service-role without the explicit opts.system opt-in', async () => {
    await appendTimelineEvent({ ...base, kind: 'system' });
    expect(clientsUsed).toEqual(['rls']);
  });
});

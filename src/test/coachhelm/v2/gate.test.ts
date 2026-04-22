import { describe, it, expect } from 'vitest';
import {
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from '@/lib/coachhelm/v2/gate';

function makeSupabaseWithCoachLookupError() {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () => ({
            data: null,
            error: { message: 'transient db error' },
          }),
          maybeSingle: async () => ({
            data: null,
            error: { message: 'transient db error' },
          }),
        }),
      }),
    }),
  } as unknown;
}

describe('gate fail-closed behavior (LIVE-17)', () => {
  it('coach gate returns effectivelyEnabled=false when coach lookup errors', async () => {
    const supabaseMock = makeSupabaseWithCoachLookupError();
    const result = await isCoachHelmEnabledForCoach('coach-1', supabaseMock as never);
    expect(result.effectivelyEnabled).toBe(false);
    expect(result.disabledReason).toMatch(/lookup failed/i);
  });

  it('player gate returns effectivelyEnabled=false when player lookup errors', async () => {
    const supabaseMock = makeSupabaseWithCoachLookupError();
    const result = await isCoachHelmEnabledForPlayer('player-1', supabaseMock as never);
    expect(result.effectivelyEnabled).toBe(false);
    expect(result.disabledReason).toMatch(/lookup failed/i);
  });
});

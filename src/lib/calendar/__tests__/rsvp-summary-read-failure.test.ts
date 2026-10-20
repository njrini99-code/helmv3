/**
 * getEventRSVPStats on a failed attendance read. The read's error used to be dropped, so a failure came back as zero
 * invitees and Fairway's People section said "No one invited yet". It now rejects, getEventRSVP returns
 * `success: false`, and the section shows its Retry state.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { getEventRSVPStats } from '../rsvp';

function clientReturning(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: async () => result }) }),
  } as unknown as SupabaseClient;
}

describe('getEventRSVPStats', () => {
  it('rejects when the attendance read fails, instead of reporting nobody invited', async () => {
    const supabase = clientReturning({ data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(getEventRSVPStats('e1', supabase)).rejects.toThrow('permission denied');
  });

  it('still reports an event with no attendance rows as empty', async () => {
    const stats = await getEventRSVPStats('e1', clientReturning({ data: [], error: null }));
    expect(stats.summary.total).toBe(0);
    expect(stats.summary.attendees).toEqual([]);
  });
});

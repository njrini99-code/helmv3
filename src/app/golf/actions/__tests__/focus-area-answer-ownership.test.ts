/**
 * C-11 (authz). acceptFocusArea / declineFocusArea filtered on the focus-area id and status only and relied on RLS.
 * RLS also lets coaches UPDATE these rows, so any signed-in user holding an id could accept or decline on behalf of
 * the player. The caller must now BE the player the area belongs to: their own golf_players row is resolved and
 * `player_id` is part of the filter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => false }));

import { acceptFocusArea, declineFocusArea } from '../development';

type Row = Record<string, unknown>;

function world(callerUserId: string | null) {
  const tables: Record<string, Row[]> = {
    golf_players: [
      { id: 'player-1', user_id: 'user-player-1' },
      { id: 'player-2', user_id: 'user-player-2' },
    ],
    golf_coaches: [{ id: 'coach-1', user_id: 'user-coach-1' }],
    golf_player_focus_areas: [
      { id: 'fa-1', player_id: 'player-1', coach_id: 'coach-1', status: 'proposed', current_value: 1.5, baseline_value: 2 },
    ],
  };
  fake = createFakeSupabase({ user: callerUserId ? { id: callerUserId } : null, tables });
  return tables;
}

const statusOf = (tables: Record<string, Row[]>) => tables.golf_player_focus_areas![0]!.status;

beforeEach(() => vi.clearAllMocks());

describe('acceptFocusArea ownership (C-11)', () => {
  it('lets the player the area belongs to accept it', async () => {
    const tables = world('user-player-1');
    expect(await acceptFocusArea('fa-1')).toEqual({ success: true });
    expect(statusOf(tables)).toBe('active');
    expect(tables.golf_player_focus_areas![0]!.baseline_value).toBe(1.5);
  });

  it("refuses another player answering for them, and leaves the row proposed", async () => {
    const tables = world('user-player-2');
    const result = await acceptFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(statusOf(tables)).toBe('proposed');
  });

  it('refuses a coach (who has UPDATE rights through RLS but is not the player)', async () => {
    const tables = world('user-coach-1');
    const result = await acceptFocusArea('fa-1');
    expect(result).toEqual({ success: false, error: 'Only the player can accept a focus area' });
    expect(statusOf(tables)).toBe('proposed');
  });
});

describe('declineFocusArea ownership (C-11)', () => {
  it('lets the player the area belongs to decline it', async () => {
    const tables = world('user-player-1');
    expect(await declineFocusArea('fa-1')).toEqual({ success: true });
    expect(statusOf(tables)).toBe('declined');
  });

  it('refuses another player declining for them, and leaves the row proposed', async () => {
    const tables = world('user-player-2');
    const result = await declineFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(statusOf(tables)).toBe('proposed');
  });

  it('refuses a coach', async () => {
    const tables = world('user-coach-1');
    const result = await declineFocusArea('fa-1');
    expect(result).toEqual({ success: false, error: 'Only the player can decline a focus area' });
    expect(statusOf(tables)).toBe('proposed');
  });

  it('refuses when nobody is signed in', async () => {
    const tables = world(null);
    expect((await declineFocusArea('fa-1')).success).toBe(false);
    expect(statusOf(tables)).toBe('proposed');
  });
});

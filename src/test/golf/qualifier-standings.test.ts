import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/** Swap audit §11.3: a player with no scored round has no stored score, not 0/0 (which ranked them at even par). */

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.current }));

import { updateQualifierEntryStats } from '@/lib/golf/qualifier-standings';

function sb(rounds: Array<Record<string, unknown>>) {
  return createFakeSupabase({
    tables: {
      golf_rounds: rounds,
      golf_qualifier_entries: [{ id: 'e1', qualifier_id: 'q1', player_id: 'p1', score: 70, total_score: 70, total_to_par: -2, rounds_completed: 1 }],
    },
  });
}

async function entryAfter(rounds: Array<Record<string, unknown>>) {
  const fake = sb(rounds);
  db.current = fake;
  await updateQualifierEntryStats('q1', 'p1');
  const { data } = await fake.from('golf_qualifier_entries').select('*').eq('id', 'e1').maybeSingle();
  return data as Record<string, unknown>;
}

describe('updateQualifierEntryStats', () => {
  it('no scored round: the stored score is null, not 0', async () => {
    // The only round was moved out of the qualifier; a completed round without a total doesn't count.
    const e = await entryAfter([{ id: 'r1', qualifier_id: 'q1', player_id: 'p1', status: 'completed', is_test: false, total_score: null, score_to_par: null }]);
    expect(e).toMatchObject({ score: null, total_score: null, total_to_par: null, rounds_completed: 0 });
  });

  it('scored rounds are summed; a test round never counts', async () => {
    const e = await entryAfter([
      { id: 'r1', qualifier_id: 'q1', player_id: 'p1', status: 'completed', is_test: false, total_score: 72, score_to_par: 0 },
      { id: 'r2', qualifier_id: 'q1', player_id: 'p1', status: 'completed', is_test: false, total_score: 74, score_to_par: 2 },
      { id: 'r4', qualifier_id: 'q1', player_id: 'p1', status: 'completed', is_test: true, total_score: 60, score_to_par: -12 },
      { id: 'r3', qualifier_id: 'q1', player_id: 'p1', status: 'in_progress', is_test: false, total_score: 40, score_to_par: 4 },
    ]);
    expect(e).toMatchObject({ score: 146, total_score: 146, total_to_par: 2, rounds_completed: 2 });
  });
});

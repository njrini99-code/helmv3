import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import type { ChQualifierOption, ChRoundTypeOptions } from '../screens/rounds/entry/round-type';

type Supabase = Awaited<ReturnType<typeof createClient>>;
type QRow = { id: string; name: string | null; num_rounds: number | null; status: string | null };

/**
 * The qualifiers a SUBMITTED round may be re-typed into, from its review (CH-11522), by the rules of the Fairway
 * round page (`rounds/[id]/page.tsx`, the reads behind its `RoundTypeEditor`):
 *  - every qualifier the round's player is entered in, finished ones included (owner, 2026-08-31: no time limit on
 *    correcting what a round counts toward), and
 *  - for a coach, the other qualifiers of the ROUND's team (`golf_rounds.team_id`, the team `reclassify_golf_round`
 *    checks, not the coach's active team), test ones left out. The player isn't entered in those yet
 *    (`playerEntered: false`); `updateRoundType` enters them on save, which only a coach may do under RLS.
 * Each carries the round numbers the player's OTHER rounds hold (this round excluded, abandoned ones too: the
 * action's clash rule), so a taken slot is shown and never offered.
 *
 * Any read that fails makes the whole answer "couldn't tell" (`readFailed`, CH-11218), never a shorter list: without
 * the taken slots every number would look free, and without the team's qualifiers a coach would be told the team has
 * none. Fairway degrades to a partial list here; Clubhouse says it didn't load, as its Continue sheet does.
 */
export async function readRoundTypeOptions(
  supabase: Supabase,
  input: { playerId: string; roundId: string; roundTeamId: string | null; coach: boolean },
): Promise<ChRoundTypeOptions> {
  try {
    return await read(supabase, input);
  } catch (err) {
    // The review stands without it: a thrown read is "couldn't tell", like a failed one.
    chLogServer('rounds.review', 'roundTypeOptions', err, 'rounds');
    return { qualifiers: [], readFailed: true };
  }
}

async function read(supabase: Supabase, input: { playerId: string; roundId: string; roundTeamId: string | null; coach: boolean }): Promise<ChRoundTypeOptions> {
  const failed = (what: string, err: unknown): ChRoundTypeOptions => {
    chLogServer('rounds.review', what, err, 'rounds');
    return { qualifiers: [], readFailed: true };
  };

  const teamRead =
    input.coach && input.roundTeamId
      ? supabase.from('golf_qualifiers').select('id, name, num_rounds, status').eq('team_id', input.roundTeamId).eq('is_test', false)
      : Promise.resolve({ data: [] as QRow[], error: null });
  const [entriesRes, teamRes] = await Promise.all([
    supabase.from('golf_qualifier_entries').select('qualifier:golf_qualifiers(id, name, num_rounds, status)').eq('player_id', input.playerId),
    teamRead,
  ]);
  if (entriesRes.error) return failed('roundTypeQualifiers', entriesRes.error);
  if (teamRes.error) return failed('roundTypeTeamQualifiers', teamRes.error);

  const entered = (entriesRes.data ?? [])
    .map((row) => {
      const q = (row as { qualifier?: unknown }).qualifier;
      return (Array.isArray(q) ? q[0] : q) as QRow | null | undefined;
    })
    .filter((q): q is QRow => Boolean(q && q.id));
  const enteredIds = new Set(entered.map((q) => q.id));
  const notEntered = ((teamRes.data ?? []) as QRow[]).filter((q) => q?.id && !enteredIds.has(q.id));
  const all = [...entered.map((q) => ({ q, playerEntered: true })), ...notEntered.map((q) => ({ q, playerEntered: false }))];
  if (all.length === 0) return { qualifiers: [], readFailed: false };

  const { data: takenRows, error: takenError } = await supabase
    .from('golf_rounds')
    .select('qualifier_id, qualifier_round_number')
    .eq('player_id', input.playerId)
    .in(
      'qualifier_id',
      all.map(({ q }) => q.id),
    )
    .neq('status', 'abandoned')
    .neq('id', input.roundId);
  if (takenError) return failed('roundTypeTakenSlots', takenError);

  const taken = (takenRows ?? []) as Array<{ qualifier_id: string | null; qualifier_round_number: number | null }>;
  const qualifiers: ChQualifierOption[] = all.map(({ q, playerEntered }) => ({
    id: q.id,
    name: q.name?.trim() || 'Qualifier',
    numRounds: q.num_rounds ?? 1,
    takenRoundNumbers: taken.filter((r) => r.qualifier_id === q.id && r.qualifier_round_number != null).map((r) => r.qualifier_round_number as number),
    isCompleted: q.status === 'completed',
    playerEntered,
  }));
  return { qualifiers, readFailed: false };
}

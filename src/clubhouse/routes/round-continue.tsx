import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { ContinueRound, type ContinueRoundProps } from '../screens/rounds/entry/ContinueRound';
import type { ChRoundTypeOptions, ChQualifierOption } from '../screens/rounds/entry/round-type';

/**
 * The qualifiers a live round may be re-typed into (owner, 2026-08-31: players can edit a live round's type; Q-92b).
 * Player rules, as the Fairway editor's server page reads them: only the qualifiers this player is already entered in
 * (entry creation is coach-only under RLS, so offering more would be a dead end one step later), each with the round
 * numbers the player's OTHER rounds already hold, so a round never reads its own slot as taken.
 *
 * Either read failing makes the whole answer "couldn't tell" (`readFailed`), never an empty list: without the taken
 * slots every number would look free and the save would die on the server's clash check.
 */
export async function loadRoundTypeOptions(input: { playerId: string; roundId: string }): Promise<ChRoundTypeOptions> {
  const supabase = await createClient();
  const { data: entryRows, error: entriesError } = await supabase
    .from('golf_qualifier_entries')
    .select('qualifier:golf_qualifiers(id, name, num_rounds, status)')
    .eq('player_id', input.playerId);
  if (entriesError) {
    chLogServer('rounds', 'roundTypeQualifiers', entriesError, 'rounds');
    return { qualifiers: [], readFailed: true };
  }

  type QRow = { id: string; name: string | null; num_rounds: number | null; status: string | null };
  const entered = (entryRows ?? [])
    .map((row) => {
      const q = (row as { qualifier?: unknown }).qualifier;
      return (Array.isArray(q) ? q[0] : q) as QRow | null | undefined;
    })
    .filter((q): q is QRow => Boolean(q && q.id));
  if (entered.length === 0) return { qualifiers: [], readFailed: false };

  const { data: takenRows, error: takenError } = await supabase
    .from('golf_rounds')
    .select('qualifier_id, qualifier_round_number')
    .eq('player_id', input.playerId)
    .in(
      'qualifier_id',
      entered.map((q) => q.id),
    )
    .neq('status', 'abandoned')
    .neq('id', input.roundId);
  if (takenError) {
    chLogServer('rounds', 'roundTypeTakenSlots', takenError, 'rounds');
    return { qualifiers: [], readFailed: true };
  }

  const taken = (takenRows ?? []) as Array<{ qualifier_id: string | null; qualifier_round_number: number | null }>;
  const qualifiers: ChQualifierOption[] = entered.map((q) => ({
    id: q.id,
    name: q.name?.trim() || 'Qualifier',
    numRounds: q.num_rounds ?? 1,
    takenRoundNumbers: taken.filter((r) => r.qualifier_id === q.id && r.qualifier_round_number != null).map((r) => r.qualifier_round_number as number),
    isCompleted: q.status === 'completed',
  }));
  return { qualifiers, readFailed: false };
}

/**
 * /golf/dashboard/rounds/continue/[id] in Clubhouse, for players: a round already started, over the continue engine.
 * The page has already loaded and checked the round (its owner, that it is still in progress, its holes, shots and
 * course yardages, the qualifier round numbers left to choose), and hands over what the engine needs, so the loader
 * exists once and both UIs read the same round. This route adds the one read only Clubhouse draws here: the qualifiers
 * the live round's type can change to (the round-type sheet, CH-11521).
 */
export async function ClubhouseContinueRoundRoute(props: Omit<ContinueRoundProps, 'roundTypeOptions'>) {
  const roundTypeOptions = await loadRoundTypeOptions({ playerId: props.playerId, roundId: props.roundId });
  return <ContinueRound {...props} roundTypeOptions={roundTypeOptions} />;
}

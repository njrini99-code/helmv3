import 'server-only';

/**
 * Loads the player's open one-tap data-gap asks for shot entry (Slice 8a).
 *
 * Behind `coachhelm_data_gap_prompt_v1` (OFF): with the flag off this reads
 * nothing and returns `[]`, so the round entry pages do exactly what they did
 * before. With it on, it reads the player's visible v3 reads that carry an
 * `evidence.data_gap` with the caller's own client (RLS: a player reads their
 * own reads and shots only), then counts the matching failures already
 * tagged in rounds after each read's window. Every read error is logged and
 * answers `[]`: no prompt is better than a wrong counter, and a failed read
 * must never block round entry.
 */

import { createClient } from '@/lib/supabase/server';
import { isFlagEnabled } from '@/lib/flags';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { logServerError } from '@/lib/server-error-logger';
import {
  countTagged,
  openAsks,
  parseDataGapAsk,
  storedGapFacts,
  type DataGapAsk,
  type StoredPuttRow,
} from './asks';

export const DATA_GAP_PROMPT_FLAG = 'coachhelm_data_gap_prompt_v1';

/** Reads scanned per player: a player has a handful of open reads. */
const READ_LIMIT = 20;
/** Newest rounds after the oldest read window that are counted. 20 rounds of
 *  putts stay under PostgREST's 1,000-row cap; a read 20 rounds stale has been
 *  rechecked by the engine long before the counter could matter. */
const ROUND_LIMIT = 20;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function loadDataGapAsks(
  supabase: ServerClient,
  playerId: string,
  opts: { flagEnabled?: boolean } = {},
): Promise<DataGapAsk[]> {
  const enabled = opts.flagEnabled ?? isFlagEnabled(DATA_GAP_PROMPT_FLAG);
  if (!enabled) return [];

  const fail = (what: string, message: string): DataGapAsk[] => {
    void logServerError(
      `[data-gap prompt] ${what} read failed; shot entry shows no prompt: ${message}`,
      { action: 'coachhelm.dataGapAsks', featureArea: 'coachhelm' },
      'warning',
    );
    return [];
  };

  const { data: reads, error: readsError } = await applyInsightVisibility(
    supabase
      .from('golf_coach_insights')
      .select('id, title, evidence, created_at')
      .eq('player_id', playerId)
      .not('evidence->data_gap', 'is', null),
  )
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(READ_LIMIT);
  if (readsError) return fail('reads', readsError.message);

  const parsed = (reads ?? [])
    .map((r) => parseDataGapAsk({ id: r.id, title: r.title, evidence: r.evidence }))
    .filter((a): a is NonNullable<typeof a> => a !== null);
  if (parsed.length === 0) return [];

  // Rounds after the oldest window. A read without a window cannot say which
  // rounds came after it, so it counts nothing (Slice 2 never writes a gap
  // without a window: `no_window` is its own not-traced reason).
  const ends = parsed.map((a) => a.windowEnd).filter((d): d is string => d !== null).sort();
  let facts: ReturnType<typeof storedGapFacts> = [];
  let roundDate = new Map<string, string>();
  if (ends.length > 0) {
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, round_date')
      .eq('player_id', playerId)
      .gt('round_date', ends[0]!)
      .or('status.is.null,status.neq.abandoned')
      .order('round_date', { ascending: false })
      .limit(ROUND_LIMIT);
    if (roundsError) return fail('rounds', roundsError.message);
    roundDate = new Map((rounds ?? []).map((r) => [r.id, r.round_date.slice(0, 10)]));
    if (roundDate.size > 0) {
      const { data: putts, error: puttsError } = await supabase
        .from('golf_shots')
        .select(
          'round_id, hole_number, shot_number, shot_type, is_penalty, distance_to_hole_before, distance_unit_before, result, putt_made, miss_direction',
        )
        .in('round_id', [...roundDate.keys()])
        .eq('shot_type', 'putting');
      if (puttsError) return fail('putts', puttsError.message);
      facts = storedGapFacts((putts ?? []) as StoredPuttRow[]);
    }
  }

  const asks: DataGapAsk[] = parsed.map((a) => {
    const since =
      a.windowEnd === null ? [] : facts.filter((f) => (roundDate.get(f.round_id) ?? '') > a.windowEnd!);
    return { ...a, taggedSince: countTagged(since, a) };
  });
  return openAsks(asks);
}

/**
 * For the round entry pages: `undefined` with the flag off (nothing is read,
 * nothing is passed down, shot entry is unchanged), else the open asks.
 * Never throws: round entry must open whatever this read does.
 */
export async function dataGapAsksForShotEntry(playerId: string): Promise<DataGapAsk[] | undefined> {
  if (!isFlagEnabled(DATA_GAP_PROMPT_FLAG)) return undefined;
  try {
    return await loadDataGapAsks(await createClient(), playerId, { flagEnabled: true });
  } catch (error) {
    void logServerError(
      `[data-gap prompt] load threw; shot entry shows no prompt: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'coachhelm.dataGapAsks', featureArea: 'coachhelm' },
      'warning',
    );
    return [];
  }
}

import 'server-only';
import { tool, type ToolSet } from 'ai';
import type { z } from 'zod';
import type { CoachChatContext } from './context';
import type { ToolEnvelope } from './provenance';
import { SummariseInputCoach, SummariseInputPlayer, summariseData, type SummariseInput } from './summarise-data';
import { queryTeamData, type TeamQueryInput } from './team-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/** What the thread says while it runs and when it is done. Raw tool names never reach the interface. */
export const SUMMARISE_STEP = { doing: 'Working out the figures', done: 'Worked out the figures', playerDoing: 'Working out your figures', playerDone: 'Worked out your figures' } as const;

const DESCRIPTION =
  'Arithmetic done for you, over rows you have already read: a count, a count by value, a sum, an average, the lowest or highest, a place in a ranking ("3 of 7", ties shared), a list of the rows that match, a difference or ratio of two figures, and a join of two reads on a key. ' +
  'Every number it returns is evidence with its own evidence_ref. USE IT for any count, rank, average, total, join or difference you would otherwise work out yourself: never add, subtract, count rows or average in your head. ' +
  'source: { ref } is the evidence_ref of a read you made (its rows, or its first list of records; { ref, list: "measurements" } treats a ranking\'s figures as rows). ' +
  'Several ops in one call: give each a short id, and a difference or ratio can name an earlier op by { op: id } or a figure of a read by { ref, metric_id, subject }. ' +
  'Field names: a ranking read as { ref, list: "measurements" } has rows with value, unit, player, player_id, entity.id, entity.label, metric_id, window_start, window_end and sample_size. ' +
  'A join keeps every field of the first read under its own name; every field of the second read is also there as right_<field> (a field only the second read has is also there under its own name), so use right_<field> when both reads have it. ' +
  'In a difference or ratio, subject is a player id or name, or "team": the team average a read of the roster\'s figures states beside the players (a ranking, a comparison); a mean over the figures is "an average of those N players\' figures", a different number from it. ' +
  'The unit of a result is the unit of the figures it was worked on. It refuses a field the rows do not have, naming the ones they do, and a figure a read does not hold, naming the ones it does: read the message and try again.';

type Sb = SupabaseClient<Database>;
type Read = <I extends Record<string, unknown>>(name: string, run: (input: I) => Promise<ToolEnvelope>) => (input: I) => Promise<unknown>;

/** The coach's `summarise_data`: refs of this turn, or a `query_team_data` spec run by that same reader. */
export function coachSummariseTools({ sb, ctx, read, evidence, tournamentsOn }: { sb: Sb; ctx: CoachChatContext; read: Read; evidence: ReadonlyMap<string, ToolEnvelope>; tournamentsOn: boolean }): ToolSet {
  return {
    summarise_data: tool({
      description: `${DESCRIPTION} A source can also be { query: ... } with the same fields as query_team_data (same tables, columns and limits).`,
      inputSchema: SummariseInputCoach,
      execute: read('summarise_data', (input: SummariseInput) => summariseData(ctx, input, { evidence, query: (spec: z.infer<typeof TeamQueryInput>) => queryTeamData(sb, ctx, spec, { tournamentsOn }) })),
    }),
  };
}

/** The player's: refs of this turn only. A player has no generic reader, so there is no query to run. */
export function playerSummariseTools({ ctx, read, evidence }: { ctx: CoachChatContext; read: (name: string, run: (input: SummariseInput) => Promise<ToolEnvelope>) => (input: SummariseInput) => Promise<unknown>; evidence: ReadonlyMap<string, ToolEnvelope> }): ToolSet {
  return {
    summarise_data: tool({
      description: DESCRIPTION,
      inputSchema: SummariseInputPlayer,
      execute: read('summarise_data', (input) => summariseData(ctx, input, { evidence })),
    }),
  };
}

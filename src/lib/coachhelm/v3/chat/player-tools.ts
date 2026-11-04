import 'server-only';
import { tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { METRIC_IDS } from './metrics-catalog';
import type { CoachChatContext } from './context';
import { getFocusAreas, getPlayerMetric, getPlayerTrend, getRecentRounds, getUpcomingEvents } from './read-tools';
import { getRoundDetail, getShotPattern } from './shot-reads';
import { compareSeasons } from './engine-reads';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { compileComposition } from './visuals/compile-composition';
import { CompositionSpecV2, ShowVisualInputV2 } from './visuals/composition';

type Sb = SupabaseClient<Database>;

/** Own reads, read through the coach's own pipeline's reader but only titles and the read word: never a guessed cause (Read CR0). */
async function myReads(sb: Sb, playerId: string): Promise<ToolEnvelope> {
  const { data, error } = await applyInsightVisibility(sb.from('golf_coach_insights').select('title, category').eq('player_id', playerId).not('evidence', 'is', null)).limit(12);
  if (error) return unavailableEnvelope('Could not read your CoachHelm reads.', 'The reads query failed.');
  return { summary: `${(data ?? []).length} open reads.`, measurements: [], series: [], detail: { reads: data ?? [] }, coverage: (data ?? []).length ? 'complete' : 'empty', coverage_note: null, as_of: nowIso() };
}

/**
 * A player's Ask: an allowlist. Reads and `show_visual`, own data only, every tool overwrites `player_id` with the session's. No write, no ranking, no comparison, no team read, no brief, no prefill.
 */
export function buildPlayerTools({ sb, ctx, playerId, writer, collect }: { sb: Sb; ctx: CoachChatContext; playerId: string; writer: UIMessageStreamWriter; collect: (e: ToolEnvelope) => void }): ToolSet {
  const evidenceByRef = new Map<string, ToolEnvelope>();
  let n = 0;
  const read =
    <I extends object>(name: string, label: string, done: string, run: (input: I) => Promise<ToolEnvelope>) =>
    async (input: I) => {
      const id = `progress-${(n += 1)}`;
      writer.write({ type: 'data-progress', id, data: { label, tool: name } });
      let envelope: ToolEnvelope;
      try {
        envelope = await run(input);
      } catch {
        envelope = unavailableEnvelope('Could not complete that read.', 'That read could not be completed.');
      }
      collect(envelope);
      writer.write({ type: 'data-progress', id, data: { label, tool: name, state: envelope.coverage === 'unavailable' ? 'failed' : 'done', done } });
      const ref = `e${evidenceByRef.size + 1}`;
      evidenceByRef.set(ref, envelope);
      writer.write({ type: 'data-evidence', id: `evidence-${name}-${n}`, data: { tool: name, envelope, ref } });
      return { ...envelope, evidence_ref: ref };
    };
  return {
    get_player_metrics: tool({ description: 'Your computed statistics.', inputSchema: z.object({ metric_ids: z.array(z.enum(METRIC_IDS)).min(1).max(8) }), execute: read('get_player_metrics', 'Reading your statistics', 'Read your statistics', (i: { metric_ids: Array<(typeof METRIC_IDS)[number]> }) => getPlayerMetric(sb, ctx, { player_id: playerId, metric_ids: i.metric_ids })) }),
    get_player_trend: tool({ description: 'Your movement on one metric over rounds.', inputSchema: z.object({ metric_id: z.enum(METRIC_IDS), last_n: z.number().int().min(3).max(30).default(10) }), execute: read('get_player_trend', 'Reading your recent rounds', 'Read your recent rounds', (i: { metric_id: string; last_n: number }) => getPlayerTrend(sb, ctx, { player_id: playerId, metric_id: i.metric_id, last_n: i.last_n })) }),
    get_recent_rounds: tool({ description: 'Your recent rounds.', inputSchema: z.object({ last_n: z.number().int().min(1).max(20).default(5) }), execute: read('get_recent_rounds', 'Reading your rounds', 'Read your rounds', (i: { last_n: number }) => getRecentRounds(sb, ctx, { player_id: playerId, last_n: i.last_n })) }),
    get_focus_areas: tool({ description: 'Your focus areas.', inputSchema: z.object({}), execute: read('get_focus_areas', 'Checking your focus areas', 'Checked your focus areas', () => getFocusAreas(sb, ctx, { player_id: playerId })) }),
    get_upcoming_events: tool({ description: 'Your team schedule.', inputSchema: z.object({ days_ahead: z.number().int().min(1).max(60).default(14) }), execute: read('get_upcoming_events', 'Checking the schedule', 'Checked the schedule', (i: { days_ahead: number }) => getUpcomingEvents(sb, ctx, i)) }),
    get_shot_pattern: tool({ description: 'Your misses, or your putting by distance.', inputSchema: z.object({ since_days: z.number().int().min(1).max(365).default(60), mode: z.enum(['approach', 'putting']).default('approach') }), execute: read('get_shot_pattern', 'Reading your shots', 'Read your shots', (i: { since_days: number; mode: 'approach' | 'putting' }) => getShotPattern(sb, ctx, { player_id: playerId, since_days: i.since_days, mode: i.mode })) }),
    get_round_detail: tool({ description: 'One of your rounds, hole by hole.', inputSchema: z.object({ round_id: z.string().uuid() }), execute: read('get_round_detail', 'Reading the round', 'Read the round', (i: { round_id: string }) => getRoundDetail(sb, ctx, i)) }),
    compare_seasons: tool({ description: 'This season against last, yours.', inputSchema: z.object({}), execute: read('compare_seasons', 'Comparing your seasons', 'Compared your seasons', () => compareSeasons(sb, ctx, { player_id: playerId })) }),
    get_my_reads: tool({ description: 'Your open CoachHelm reads.', inputSchema: z.object({}), execute: read('get_my_reads', 'Reading your CoachHelm', 'Read your CoachHelm', () => myReads(sb, playerId)) }),
    show_visual: tool({
      description: 'Show one visual built from reads you already made this answer.',
      inputSchema: ShowVisualInputV2,
      execute: async (input) => {
        const parsed = CompositionSpecV2.safeParse(input);
        if (!parsed.success) return { status: 'refused', message: 'A composition needs a title and at least one block.' };
        const result = compileComposition(parsed.data, evidenceByRef);
        if (!result.ok) return { status: 'refused', message: result.message };
        writer.write({ type: 'data-visual-composition', id: `visual-${result.composition.artifactId}`, data: result.composition });
        return { status: 'shown', message: `Shown: ${result.composition.title}.` };
      },
    }),
  };
}

export const PLAYER_INSTRUCTIONS = (first: string, team: string, zone: string) => `You are CoachHelm, talking with ${first}, a player on ${team}. Their timezone is ${zone}.

Say "you". Be encouraging and plain. Use only your tools; every figure must come from a read this turn, followed by that read's evidence_ref in square brackets, like [e2].
Never name another player, even if asked. You can only read this player's own data. The only comparisons are the PGA Tour and the team average, and never who on the team did what.
You cannot change anything. If asked to write or send something, say to ask their coach.`;

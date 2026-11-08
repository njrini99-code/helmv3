import 'server-only';
import { tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { METRIC_IDS } from './metrics-catalog';
import type { CoachChatContext } from './context';
import { WINDOW_NOTE } from './agent-tools';
import { FIGURE_WINDOWS, getFocusAreas, getPlayerMetric, type PlayerFiguresSource, getPlayerTrend, getRecentRounds, readUpcomingEventRows, replyOf } from './read-tools';
import { getRoundDetail, getShotPattern } from './shot-reads';
import { compareSeasons } from './engine-reads';
import { getSeasonScoring } from './season-reads';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { playerTitle } from '@/lib/coachhelm/reads/player-cause';
import { compileComposition } from './visuals/compile-composition';
import { CompositionSpecV2, ShowVisualInputV2 } from './visuals/composition';
import { applyTourBenchmarks, benchmarkSource } from './benchmark-reads';
import { benchmarkTools } from './wide-read-tools';
import { PLAYER_BENCHMARK_STEP, WIDE_READ_STEPS } from './wide-read-names';

type Sb = SupabaseClient<Database>;

/** Own reads, read through the coach's own pipeline's reader but only titles and the read word: never a guessed cause (Read CR0). The evidence is read to judge the title, and stays here. */
async function myReads(sb: Sb, playerId: string): Promise<ToolEnvelope> {
  const { data, error } = await applyInsightVisibility(sb.from('golf_coach_insights').select('title, category, evidence').eq('player_id', playerId).not('evidence', 'is', null)).limit(12);
  if (error) return unavailableEnvelope('Could not read your CoachHelm reads.', 'The reads query failed.');
  const reads = (data ?? []).map((r) => ({ title: playerTitle(r.title, r.evidence), category: r.category }));
  return { summary: `${reads.length} open reads.`, measurements: [], series: [], detail: { reads }, coverage: reads.length ? 'complete' : 'empty', coverage_note: null, as_of: nowIso() };
}

/**
 * The schedule as a player's: the team's events and this player's own reply. A coach's read (`getUpcomingEvents`) counts the team's replies and names who has not replied; a player never receives a teammate's, so
 * attendance is read for this player alone and no count is built. `no_reply`: an RSVP event they have not answered.
 */
async function myUpcomingEvents(sb: Sb, ctx: CoachChatContext, playerId: string, input: { days_ahead: number }): Promise<ToolEnvelope> {
  const days = Math.min(Math.max(input.days_ahead, 1), 60);
  const read = await readUpcomingEventRows(sb, ctx, days);
  if (!read) return unavailableEnvelope('Could not read the calendar.', 'The events query failed.');
  const { rows } = read;
  if (rows.length === 0) return { summary: `Nothing scheduled in the next ${days} days.`, measurements: [], series: [], detail: { events: [] }, coverage: 'empty', coverage_note: null, as_of: nowIso() };
  const rsvp = rows.filter((e) => e.requires_rsvp === true).map((e) => e.id);
  const mine = rsvp.length ? await sb.from('golf_event_attendance').select('event_id, status').eq('player_id', playerId).in('event_id', rsvp) : { data: [], error: null };
  const reply = new Map((mine.data ?? []).map((a) => [a.event_id, a.status]));
  const events = rows.map((e) => {
    const base = { event_id: e.id, title: e.title, event_type: e.event_type, starts_at: e.start_time, ends_at: e.end_time, location: e.location, requires_rsvp: e.requires_rsvp === true };
    if (e.requires_rsvp !== true) return base;
    const said = reply.get(e.id);
    // A failed read is not "you have not replied".
    return { ...base, rsvp_deadline: e.rsvp_deadline, my_rsvp: mine.error ? null : replyOf(said) === 'pending' ? 'no_reply' : replyOf(said) };
  });
  return { summary: `${events.length} event${events.length === 1 ? '' : 's'} in the next ${days} days.`, measurements: [], series: [], detail: { timezone: ctx.timezone, events }, coverage: mine.error ? 'partial' : 'complete', coverage_note: mine.error ? 'Your replies could not be read.' : null, as_of: nowIso() };
}

/** One of this player's own rounds. The owner is checked first, so a teammate's round id reads as no round at all: neither its holes nor that it exists. */
async function myRoundDetail(sb: Sb, ctx: CoachChatContext, playerId: string, input: { round_id: string }): Promise<ToolEnvelope> {
  const own = await sb.from('golf_rounds').select('id').eq('id', input.round_id).eq('player_id', playerId).maybeSingle();
  if (own.error) return unavailableEnvelope('Could not read that round.', 'The round query failed.');
  if (!own.data) return { summary: 'That round is not one of yours.', measurements: [], series: [], coverage: 'empty', coverage_note: 'No round of yours with that id.', as_of: nowIso() };
  return getRoundDetail(sb, ctx, input);
}

/**
 * A player's Ask: an allowlist. Reads and `show_visual`, own data only, every tool overwrites `player_id` with the session's. No write, no ranking, no comparison, no team read, no brief, no prefill.
 */
/**
 * A read as the player's own: the words the thread draws as titles and notes address them ("Your last round.", "4 metrics for you."),
 * never their own name in the third person. Summary, note and entity labels only; ids, figures and detail are untouched.
 */
export function inSecondPerson<E extends ToolEnvelope>(envelope: E, name: string): E {
  const n = name.trim();
  if (!n) return envelope;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const say = (text: string) =>
    text
      .replace(new RegExp(`^${escaped}['’]s\\b`), 'Your')
      .replace(new RegExp(`${escaped}['’]s\\b`, 'g'), 'your')
      .replace(new RegExp(`^${escaped}\\b`), 'You')
      .replace(new RegExp(`\\b${escaped}\\b`, 'g'), 'you')
      // The verb follows the new subject: "You has no rounds" becomes "You have no rounds".
      .replace(/\b(You|you) (has|is|was|hasn['’]t|isn['’]t|wasn['’]t)\b/g, (_m, who: string, verb: string) => `${who} ${{ has: 'have', is: 'are', was: 'were' }[verb.toLowerCase()] ?? verb.replace(/^has/, 'have').replace(/^is/, 'are').replace(/^was/, 'were')}`);
  const who = <T extends { entity: { kind: string; label: string } }>(x: T): T => (x.entity.kind === 'player' && x.entity.label.trim() === n ? { ...x, entity: { ...x.entity, label: 'You' } } : x);
  return {
    ...envelope,
    summary: say(envelope.summary),
    coverage_note: envelope.coverage_note ? say(envelope.coverage_note) : envelope.coverage_note,
    measurements: envelope.measurements.map(who),
    series: envelope.series.map(who),
  };
}

export function buildPlayerTools({ sb, ctx, playerId, writer, collect, playerFigures }: { sb: Sb; ctx: CoachChatContext; playerId: string; writer: UIMessageStreamWriter; collect: (e: ToolEnvelope) => void; playerFigures?: PlayerFiguresSource }): ToolSet {
  const evidenceByRef = new Map<string, ToolEnvelope>();
  // The player's team's Tour and standards, read once for the turn: a measurement a read returns carries the Tour's value where there is one.
  const benchSource = benchmarkSource(sb, ctx.team_id);
  let n = 0;
  const read =
    <I extends object>(name: string, label: string, done: string, run: (input: I) => Promise<ToolEnvelope>) =>
    async (input: I) => {
      const id = `progress-${(n += 1)}`;
      writer.write({ type: 'data-progress', id, data: { label, tool: name } });
      let envelope: ToolEnvelope;
      try {
        envelope = inSecondPerson(await applyTourBenchmarks(await run(input), benchSource), ctx.roster.find((p) => p.id === playerId)?.name ?? '');
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
  /** The shared benchmark reads, announced in the player's words. */
  const wide = <I extends Record<string, unknown>>(name: string, run: (input: I) => Promise<ToolEnvelope>) => {
    const [doing, done] = name === 'get_benchmarks' ? PLAYER_BENCHMARK_STEP : (WIDE_READ_STEPS[name] ?? ['Reading', 'Read']);
    return read(name, doing, done, run);
  };
  return {
    ...benchmarkTools({ sb, ctx, read: wide, source: benchSource, who: { role: 'player', playerId } }),
    get_player_metrics: tool({ description: `Your computed statistics. ${WINDOW_NOTE}`, inputSchema: z.object({ metric_ids: z.array(z.enum(METRIC_IDS)).min(1).max(8), window: z.enum(FIGURE_WINDOWS).default('last10') }), execute: read('get_player_metrics', 'Reading your statistics', 'Read your statistics', (i: { metric_ids: Array<(typeof METRIC_IDS)[number]>; window: (typeof FIGURE_WINDOWS)[number] }) => getPlayerMetric(sb, ctx, { player_id: playerId, metric_ids: i.metric_ids, window: i.window }, playerFigures)) }),
    get_player_trend: tool({ description: 'Your movement on one metric over rounds.', inputSchema: z.object({ metric_id: z.enum(METRIC_IDS), last_n: z.number().int().min(3).max(30).default(10) }), execute: read('get_player_trend', 'Reading your recent rounds', 'Read your recent rounds', (i: { metric_id: string; last_n: number }) => getPlayerTrend(sb, ctx, { player_id: playerId, metric_id: i.metric_id, last_n: i.last_n })) }),
    get_recent_rounds: tool({ description: 'Your recent rounds.', inputSchema: z.object({ last_n: z.number().int().min(1).max(20).default(5) }), execute: read('get_recent_rounds', 'Reading your rounds', 'Read your rounds', (i: { last_n: number }) => getRecentRounds(sb, ctx, { player_id: playerId, last_n: i.last_n })) }),
    get_focus_areas: tool({ description: 'Your focus areas.', inputSchema: z.object({}), execute: read('get_focus_areas', 'Checking your focus areas', 'Checked your focus areas', () => getFocusAreas(sb, ctx, { player_id: playerId })) }),
    get_upcoming_events: tool({ description: 'Your team schedule.', inputSchema: z.object({ days_ahead: z.number().int().min(1).max(60).default(14) }), execute: read('get_upcoming_events', 'Checking the schedule', 'Checked the schedule', (i: { days_ahead: number }) => myUpcomingEvents(sb, ctx, playerId, i)) }),
    get_shot_pattern: tool({ description: 'Your misses, or your putting by distance.', inputSchema: z.object({ since_days: z.number().int().min(1).max(365).default(60), mode: z.enum(['approach', 'putting']).default('approach') }), execute: read('get_shot_pattern', 'Reading your shots', 'Read your shots', (i: { since_days: number; mode: 'approach' | 'putting' }) => getShotPattern(sb, ctx, { player_id: playerId, since_days: i.since_days, mode: i.mode })) }),
    get_round_detail: tool({ description: 'One of your rounds, hole by hole.', inputSchema: z.object({ round_id: z.string().uuid() }), execute: read('get_round_detail', 'Reading the round', 'Read the round', (i: { round_id: string }) => myRoundDetail(sb, ctx, playerId, i)) }),
    get_season_scoring: tool({ description: 'Your scoring average and to par this season: full 18-hole rounds since 1 August, practice left out. Use for any question about your scoring this season.', inputSchema: z.object({}), execute: read('get_season_scoring', 'Reading your season', 'Read your season', () => getSeasonScoring(sb, ctx, { player_id: playerId })) }),
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

Say "you". In a visual's title, lede and notes too: "Your last round", never their name. Be encouraging and plain. Use only your tools; every figure must come from a read this turn, followed by that read's evidence_ref in square brackets, like [e2].
Never name another player, even if asked. You can only read this player's own data. The comparisons you can make are the Tour, college and high-school averages, the team average and the average at your level, and never who on the team did what.
To compare, read the benchmarks first: they return the Tour and college averages with their source, and your standing (your value, the Tour, the team average, the level average). Say which level and where the value comes from. A benchmark is an average, not anyone's result: never write it as if it were yours or a teammate's.
For golf knowledge (what a stat means, how putting or approach play affects scoring, what is typical), read the golf reference. Its figures are published research: say where they come from, keep them in their own sentence apart from your numbers, and never invent a distance, count of reps or target that no read returned. If a read has nothing, say so.
You cannot change anything. If asked to write or send something, say to ask their coach.`;

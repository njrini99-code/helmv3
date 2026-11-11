/**
 * CoachHelm chat: what a player's own reads are made of. Each takes the caller's id from the session, never from the model.
 * (Moved here unchanged from the old `player-tools.ts`, which registered them on the Vercel AI SDK.)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { playerTitle } from '@/lib/coachhelm/reads/player-cause';
import type { CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { readUpcomingEventRows, replyOf } from './read-tools';
import { getRoundDetail } from './shot-reads';

type Sb = SupabaseClient<Database>;

/** Own reads, read through the coach's own pipeline's reader but only titles and the read word: never a guessed cause (Read CR0). The evidence is read to judge the title, and stays here. */
export async function myReads(sb: Sb, playerId: string): Promise<ToolEnvelope> {
  const { data, error } = await applyInsightVisibility(sb.from('golf_coach_insights').select('title, category, evidence').eq('player_id', playerId).not('evidence', 'is', null)).limit(12);
  if (error) return unavailableEnvelope('Could not read your CoachHelm reads.', 'The reads query failed.');
  const reads = (data ?? []).map((r) => ({ title: playerTitle(r.title, r.evidence), category: r.category }));
  return { summary: `${reads.length} open reads.`, measurements: [], series: [], detail: { reads }, coverage: reads.length ? 'complete' : 'empty', coverage_note: null, as_of: nowIso() };
}

/**
 * The schedule as a player's: the team's events and this player's own reply. A coach's read (`getUpcomingEvents`) counts the team's replies and names who has not replied; a player never receives a teammate's, so
 * attendance is read for this player alone and no count is built. `no_reply`: an RSVP event they have not answered.
 */
export async function myUpcomingEvents(sb: Sb, ctx: CoachChatContext, playerId: string, input: { days_ahead: number }): Promise<ToolEnvelope> {
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
export async function myRoundDetail(sb: Sb, ctx: CoachChatContext, playerId: string, input: { round_id: string }): Promise<ToolEnvelope> {
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

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachChatContext } from './context';

export interface LandingRow {
  title: string;
  sub: string;
}

const LIMIT = 2;
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

/**
 * The real rows a draft lands between (ask/06 E-HS), read before the card is shown. Decoration for the card only: it never stops the
 * draft.
 *
 * Two answers that must not be confused: an empty list (the read worked; that screen has nothing yet, or the flow has no neighbours) and
 * NULL (the read failed, so what is on that screen is not known). A failed read is logged. The caller draws the new row alone in both
 * cases, which is honest only because a card with no neighbours says nothing about what else is on the screen.
 */
export async function landingRows(sb: SupabaseClient<Database>, ctx: CoachChatContext, tool: string, input: unknown): Promise<LandingRow[] | null> {
  const i = (input ?? {}) as { player_id?: string };
  const today = new Date().toISOString().slice(0, 10);
  const unread = (what: string, problem: unknown): null => {
    const p = (problem ?? {}) as { message?: string; code?: string };
    void logServerError(`landingRows ${what} failed: ${p.message ?? 'unknown'}`, { action: 'coachhelm.ask.landing_rows', feature: 'coachhelm_chat', userId: ctx.user_id, errorCode: p.code, handled: true });
    return null;
  };
  try {
    if (tool === 'create_goal' && i.player_id) {
      const { data, error } = await sb.from('golf_goals').select('title, ends_at').eq('team_id', ctx.team_id).eq('player_id', i.player_id).eq('state', 'active').order('created_at', { ascending: false }).limit(LIMIT);
      if (error) return unread('goals', error);
      return (data ?? []).map((g) => ({ title: g.title ?? 'Goal', sub: g.ends_at ? `By ${day(g.ends_at)}` : 'No end date' }));
    }
    if (tool === 'create_task') {
      const { data, error } = await sb.from('golf_tasks').select('title, due_date').eq('team_id', ctx.team_id).is('completed_at', null).is('parent_task_id', null).order('due_date', { ascending: true, nullsFirst: false }).limit(LIMIT);
      if (error) return unread('tasks', error);
      return (data ?? []).map((t) => ({ title: t.title, sub: t.due_date ? `Due ${day(t.due_date)}` : 'No due date' }));
    }
    if (tool === 'create_team_announcement' || tool === 'create_announcement') {
      const { data, error } = await sb.from('golf_announcements').select('title, published_at').eq('team_id', ctx.team_id).not('published_at', 'is', null).order('published_at', { ascending: false }).limit(LIMIT);
      if (error) return unread('announcements', error);
      return (data ?? []).map((a) => ({ title: a.title, sub: day(a.published_at) }));
    }
    if (tool === 'create_trip') {
      const { data, error } = await sb.from('golf_travel_itineraries').select('event_name, destination, departure_date').eq('team_id', ctx.team_id).gte('departure_date', today).order('departure_date', { ascending: true }).limit(LIMIT);
      if (error) return unread('trips', error);
      return (data ?? []).map((t) => ({ title: t.event_name ?? t.destination ?? 'Trip', sub: day(t.departure_date) }));
    }
    if (tool === 'create_qualifier') {
      const { data, error } = await sb.from('golf_qualifiers').select('name, start_date').eq('team_id', ctx.team_id).order('start_date', { ascending: false }).limit(LIMIT);
      if (error) return unread('qualifiers', error);
      return (data ?? []).map((q) => ({ title: q.name, sub: day(q.start_date) }));
    }
    if (tool === 'create_recruit') {
      const { data, error } = await sb.from('golf_recruits').select('first_name, last_name, hs_class').eq('team_id', ctx.team_id).order('created_at', { ascending: false }).limit(LIMIT);
      if (error) return unread('recruits', error);
      return (data ?? []).map((r) => ({ title: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Recruit', sub: r.hs_class ? `Class of ${r.hs_class}` : 'Recruit' }));
    }
  } catch (thrown) {
    // A read that threw (the network, not PostgREST) is a failed read too.
    return unread(tool, thrown);
  }
  // A flow with no neighbours to show.
  return [];
}

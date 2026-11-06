import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';

export interface LandingRow {
  title: string;
  sub: string;
}

const LIMIT = 2;
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

/**
 * The real rows a draft lands between (ask/06 E-HS), read before the card is shown. Decoration for the card only, so a
 * read that fails or a screen with nothing yet draws the new row alone; it never stops the draft.
 */
export async function landingRows(sb: SupabaseClient<Database>, ctx: CoachChatContext, tool: string, input: unknown): Promise<LandingRow[]> {
  const i = (input ?? {}) as { player_id?: string };
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (tool === 'create_goal' && i.player_id) {
      const { data } = await sb.from('golf_goals').select('title, ends_at').eq('team_id', ctx.team_id).eq('player_id', i.player_id).eq('state', 'active').order('created_at', { ascending: false }).limit(LIMIT);
      return (data ?? []).map((g) => ({ title: g.title ?? 'Goal', sub: g.ends_at ? `By ${day(g.ends_at)}` : 'No end date' }));
    }
    if (tool === 'create_task') {
      const { data } = await sb.from('golf_tasks').select('title, due_date').eq('team_id', ctx.team_id).is('completed_at', null).is('parent_task_id', null).order('due_date', { ascending: true, nullsFirst: false }).limit(LIMIT);
      return (data ?? []).map((t) => ({ title: t.title, sub: t.due_date ? `Due ${day(t.due_date)}` : 'No due date' }));
    }
    if (tool === 'create_team_announcement' || tool === 'create_announcement') {
      const { data } = await sb.from('golf_announcements').select('title, published_at').eq('team_id', ctx.team_id).not('published_at', 'is', null).order('published_at', { ascending: false }).limit(LIMIT);
      return (data ?? []).map((a) => ({ title: a.title, sub: day(a.published_at) }));
    }
    if (tool === 'create_trip') {
      const { data } = await sb.from('golf_travel_itineraries').select('event_name, destination, departure_date').eq('team_id', ctx.team_id).gte('departure_date', today).order('departure_date', { ascending: true }).limit(LIMIT);
      return (data ?? []).map((t) => ({ title: t.event_name ?? t.destination ?? 'Trip', sub: day(t.departure_date) }));
    }
    if (tool === 'create_qualifier') {
      const { data } = await sb.from('golf_qualifiers').select('name, start_date').eq('team_id', ctx.team_id).order('start_date', { ascending: false }).limit(LIMIT);
      return (data ?? []).map((q) => ({ title: q.name, sub: day(q.start_date) }));
    }
    if (tool === 'create_recruit') {
      const { data } = await sb.from('golf_recruits').select('first_name, last_name, hs_class').eq('team_id', ctx.team_id).order('created_at', { ascending: false }).limit(LIMIT);
      return (data ?? []).map((r) => ({ title: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Recruit', sub: r.hs_class ? `Class of ${r.hs_class}` : 'Recruit' }));
    }
  } catch {
    return [];
  }
  return [];
}

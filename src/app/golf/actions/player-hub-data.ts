'use server';

/**
 * ============================================================================
 * getPlayerHubSummaryData — extracted for the WAVE W2 nav consolidation.
 * ----------------------------------------------------------------------------
 * Previously this query set lived inline in dashboard/hub/page.tsx (the
 * standalone player "Hub" front door). The Target IA (PRODUCTION_READINESS_
 * MISSION_2026-07-09.md) merges the Hub INTO the Dashboard — the player gets
 * ONE home instead of two — so the same triage data (tasks / RSVP events /
 * announcements / upcoming trips + the top CoachHelm signal) is now fetched
 * by the Dashboard route and rendered as a section there. /dashboard/hub
 * itself becomes a server-redirect to /golf/dashboard (see that route).
 *
 * The query logic below is VERBATIM from the former hub/page.tsx — only the
 * shape of the return value changed (one object instead of a page render).
 * ========================================================================== */

import { createClient } from '@/lib/supabase/server';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { getTopInsightForPlayer } from '@/app/golf/actions/insight-delivery';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { TripData, PlayerTask, EventInvite } from '@/components/fairway/pages/hub/hub-parts';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { withAdminObserved } from '@/lib/admin/observed-action';

interface RawAssignment {
  task_id: string;
  status: string;
  completed_at: string | null;
}

interface HubEventRow {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}

export interface PlayerHubSummaryData {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  announcements: GolfAnnouncementMeta[];
  announcementsLoadError: boolean;
  topInsight: EvidenceInsight | null;
}

/** Whether a task expects the player to submit a file (see hub/page.tsx history). */
function taskRequiresUpload(taskType: string | null, category: string | null): boolean {
  const haystack = `${taskType ?? ''} ${category ?? ''}`.toLowerCase();
  return /upload|submission|submit|video|film|recording|photo/.test(haystack);
}

/**
 * Fetch the player's triage data (tasks / RSVP events / announcements /
 * upcoming trips / top insight) for a resolved team + player. Returns honest
 * empty arrays on a genuinely-empty team, never fabricated data; a real
 * DB/network failure is allowed to throw (the route's error.tsx / retry
 * boundary is the correct place to surface that — mirrors the pattern the
 * former hub/page.tsx and dashboard/page.tsx already both rely on).
 */
async function getPlayerHubSummaryDataImpl(
  teamId: string,
  playerId: string,
): Promise<PlayerHubSummaryData> {
  const supabase = await createClient();

  const eventSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tripsSince = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [tripsResult, tasksRaw, eventsResult, announcementsResult, topInsight] = await Promise.all([
    supabase
      .from('golf_travel_itineraries')
      .select(
        'id, event_name, destination, transportation_type, departure_date, departure_time, departure_location, return_date, return_time, hotel_name, hotel_address, hotel_phone, hotel_confirmation, uniform_requirements, gear_list, room_assignments, notes, flight_info',
      )
      .eq('team_id', teamId)
      .gte('departure_date', tripsSince)
      .order('departure_date', { ascending: true })
      .limit(100),

    supabase
      .from('golf_task_assignments' as 'golf_shots')
      .select('task_id, status, completed_at')
      .eq('player_id' as 'id', playerId) as unknown as Promise<{ data: RawAssignment[] | null; error: unknown }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_player_hub_events', {
      p_team_id: teamId,
      p_player_id: playerId,
      p_since: eventSince,
    }) as Promise<{ data: HubEventRow[] | null; error: unknown }>,

    getPlayerHubAnnouncements(teamId, playerId),

    getTopInsightForPlayer(playerId),
  ]);

  const trips: TripData[] = (tripsResult.data || []).map((item) => ({
    id: item.id,
    event_name: item.event_name || '',
    destination: item.destination || '',
    transportation_type: (item.transportation_type as TripData['transportation_type']) || 'bus',
    departure_date: item.departure_date || '',
    departure_time: item.departure_time,
    departure_location: item.departure_location,
    return_date: item.return_date,
    return_time: item.return_time,
    hotel_name: item.hotel_name,
    hotel_address: item.hotel_address,
    hotel_phone: item.hotel_phone,
    hotel_confirmation: item.hotel_confirmation,
    uniform_requirements: item.uniform_requirements,
    gear_list: Array.isArray(item.gear_list) ? item.gear_list.join(', ') : (item.gear_list as string | null),
    room_assignments:
      typeof item.room_assignments === 'string'
        ? item.room_assignments
        : item.room_assignments &&
            typeof item.room_assignments === 'object' &&
            !Array.isArray(item.room_assignments) &&
            'text' in item.room_assignments
          ? String(item.room_assignments.text)
          : item.room_assignments
            ? JSON.stringify(item.room_assignments)
            : null,
    notes: item.notes,
    flight_info:
      typeof item.flight_info === 'string'
        ? item.flight_info
        : item.flight_info &&
            typeof item.flight_info === 'object' &&
            !Array.isArray(item.flight_info) &&
            'text' in item.flight_info
          ? String(item.flight_info.text)
          : item.flight_info
            ? JSON.stringify(item.flight_info)
            : null,
  }));

  const rawAssignments = (tasksRaw.data || []) as unknown as RawAssignment[];
  const assignmentMap = new Map(rawAssignments.map((a) => [a.task_id, a]));
  const taskIds = [...new Set(rawAssignments.map((a) => a.task_id))];

  let tasks: PlayerTask[] = [];
  if (taskIds.length > 0) {
    const { data: taskDetails } = await supabase
      .from('golf_tasks')
      .select('id, title, description, due_date, category, task_type')
      .in('id', taskIds)
      .eq('team_id', teamId)
      .order('due_date', { ascending: true, nullsFirst: false });

    tasks = (taskDetails || []).map((t) => {
      const assignment = assignmentMap.get(t.id);
      const isCompleted = assignment?.status === 'completed';
      const completedAt = assignment?.completed_at || null;
      const isOverdue = !isCompleted && t.due_date && new Date(t.due_date) < new Date();
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        category: t.category || null,
        requires_upload: taskRequiresUpload(t.task_type, t.category),
        status: isCompleted ? 'completed' : isOverdue ? 'overdue' : 'pending',
        completed_at: completedAt,
      };
    });
  }

  const events: EventInvite[] = (eventsResult.data ?? []).map((e) => ({
    id: e.id,
    event_id: e.event_id,
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    is_mandatory: Boolean(e.is_mandatory),
    rsvp_status: e.rsvp_status ?? null,
    going_count: e.going_count ?? 0,
    maybe_count: e.maybe_count ?? 0,
  }));

  const announcements = announcementsResult.success ? (announcementsResult.data ?? []) : [];
  const announcementsLoadError = !announcementsResult.success;

  return { trips, tasks, events, announcements, announcementsLoadError, topInsight };
}

const observedGetPlayerHubSummaryData = withAdminObserved(
  'getPlayerHubSummaryData',
  { sport: 'golf', feature: 'notifications' },
  getPlayerHubSummaryDataImpl,
);

export async function getPlayerHubSummaryData(
  teamId: string,
  playerId: string,
): Promise<PlayerHubSummaryData> {
  return observedGetPlayerHubSummaryData(teamId, playerId);
}

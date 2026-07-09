import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import Link from 'next/link';
import { Plane } from 'lucide-react';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTravel } from '@/components/fairway/pages/travel';
import { ViewHeader, Surface, EmptyState, Button } from '@/components/fairway';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

export const metadata: Metadata = {
  title: 'Travel | Helm Golf',
  description: 'Track tournament travel, manage logistics, and coordinate team itineraries for your golf program.',
};

// Auth-dependent page — must render per-request so each user sees their own data
export const dynamic = 'force-dynamic';

export default async function GolfTravelPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  // Team lookups in parallel (coach via org — deterministic helper handles orgs
  // with >1 team; player via membership)
  const [coachTeamId, playerTeamResult] = await Promise.all([
    coach?.organization_id
      ? resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)
      : Promise.resolve(null),
    player?.id
      ? supabase.from('golf_team_members').select('team_id').eq('player_id', player.id).eq('status', 'active').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const playerTeamId = playerTeamResult.data?.team_id || null;
  const isCoach = !!coach && !!coachTeamId;
  const teamId = coachTeamId || playerTeamId;

  if (!teamId) {
    // Keep the no-team edge case visually consistent with the rest of the
    // travel surface (canvas + masthead + EmptyState) and give it a next
    // action instead of a dead end (P320).
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8 pb-24">
          <ViewHeader
            eyebrow="Travel"
            title="Trips on the calendar."
            description="Travel itineraries live with your team — join one to see and manage trips."
          />
          <div className="mt-8">
            <Surface elevation="shadow" padding="lg">
              <EmptyState
                icon={<Plane strokeWidth={1.75} />}
                title="You're not on a team yet"
                description="Travel itineraries are scoped to a team. Join your program to view and manage tournament trips, lodging, and expenses."
                action={
                  <Button asChild variant="primary">
                    <Link href="/golf/join">Join a team</Link>
                  </Button>
                }
              />
            </Surface>
          </div>
        </div>
      </div>
    );
  }

  // Fetch travel itineraries. A program with a full multi-season history can
  // exceed the previous hard .limit(100) (and PostgREST's 1000-row default cap),
  // which silently truncated the list and dropped older trips. Paginate past the
  // cap so every trip is available to the client; the secondary `.order('id')`
  // is a STABLE tiebreaker that keeps page boundaries deterministic without
  // changing the primary departure_date-ascending order both forks expect.
  const { data: itinerariesRaw } = await fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_travel_itineraries')
      .select('*')
      .eq('team_id', teamId)
      .order('departure_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );

  // Resolve titles for any linked golf_events so the Fairway detail panel can
  // surface "Linked to: <event>" without a second client-side fetch. event_id is
  // round-tripped below so the create/edit picker prefills on re-edit (it was
  // previously dropped from the mapped object → the picker silently un-linked).
  const linkedEventIds = Array.from(
    new Set((itinerariesRaw || []).map((i) => i.event_id).filter((id): id is string => !!id)),
  );
  const eventTitleById = new Map<string, string>();
  if (linkedEventIds.length > 0) {
    const { data: linkedEvents } = await supabase
      .from('golf_events')
      .select('id, title')
      .in('id', linkedEventIds);
    for (const ev of linkedEvents || []) {
      if (ev.id) eventTitleById.set(ev.id, ev.title || '');
    }
  }

  // Transform database data to match TravelItinerary interface expected by client component
  const itineraries = (itinerariesRaw || []).map(item => ({
    id: item.id,
    event_id: item.event_id ?? null,
    event_title: item.event_id ? (eventTitleById.get(item.event_id) ?? null) : null,
    event_name: item.event_name || '',
    destination: item.destination || '',
    transportation_type: (item.transportation_type as 'bus' | 'van' | 'flight' | 'carpool') || 'bus',
    departure_date: item.departure_date || '',
    departure_time: item.departure_time,
    departure_location: item.departure_location,
    return_date: item.return_date,
    return_time: item.return_time,
    flight_info: typeof item.flight_info === 'string' ? item.flight_info : (item.flight_info && typeof item.flight_info === 'object' && !Array.isArray(item.flight_info) && 'text' in item.flight_info ? String(item.flight_info.text) : (item.flight_info ? JSON.stringify(item.flight_info) : null)),
    hotel_name: item.hotel_name,
    hotel_address: item.hotel_address,
    hotel_phone: item.hotel_phone,
    hotel_confirmation: item.hotel_confirmation,
    check_in_date: null, // Not in database schema
    check_out_date: null, // Not in database schema
    room_assignments: typeof item.room_assignments === 'string' ? item.room_assignments : (item.room_assignments && typeof item.room_assignments === 'object' && !Array.isArray(item.room_assignments) && 'text' in item.room_assignments ? String(item.room_assignments.text) : (item.room_assignments ? JSON.stringify(item.room_assignments) : null)),
    uniform_requirements: item.uniform_requirements,
    gear_list: Array.isArray(item.gear_list) ? item.gear_list.join(', ') : (item.gear_list as string | null),
    notes: item.notes,
    created_at: item.created_at,
  }));

  // Reuses the SAME mapped golf_travel_itineraries rows + role resolved
  // above; renders onto the warm-matte Fairway system.
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayTravel
        itineraries={itineraries}
        coachId={coach?.id || ''}
        teamId={teamId}
        isCoach={isCoach}
        nowISO={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { TravelClient } from './travel-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayTravel } from '@/components/fairway/pages/travel';

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
      ? resolveCoachTeamId(supabase, coach.organization_id, coach.id)
      : Promise.resolve(null),
    player?.id
      ? supabase.from('golf_team_members').select('team_id').eq('player_id', player.id).eq('status', 'active').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const playerTeamId = playerTeamResult.data?.team_id || null;
  const isCoach = !!coach && !!coachTeamId;
  const teamId = coachTeamId || playerTeamId;

  if (!teamId) {
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h1>
          <p className="text-warm-600">You must be on a team to access travel itineraries.</p>
        </div>
      </div>
    );
  }

  // Fetch travel itineraries
  const { data: itinerariesRaw } = await supabase
    .from('golf_travel_itineraries')
    .select('*')
    .eq('team_id', teamId)
    .order('departure_date', { ascending: true })
    .limit(100);

  // Transform database data to match TravelItinerary interface expected by client component
  const itineraries = (itinerariesRaw || []).map(item => ({
    id: item.id,
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

  // ── Fairway redesign fork (flag-gated, additive) ──────────────────────────
  // Reuses the SAME mapped golf_travel_itineraries rows + role resolved above;
  // re-skins onto the warm-matte Fairway system. Legacy branch below is
  // unchanged when the flag is off.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayTravel
          itineraries={itineraries}
          coachId={coach?.id || ''}
          teamId={teamId}
          isCoach={isCoach}
        />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <TravelClient
          itineraries={itineraries}
          coachId={coach?.id || ''}
          teamId={teamId}
          isCoach={isCoach}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}

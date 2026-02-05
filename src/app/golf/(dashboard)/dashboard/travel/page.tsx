import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { TravelClient } from './travel-client';

export const metadata: Metadata = {
  title: 'Travel | Helm Golf',
  description: 'Track tournament travel, manage logistics, and coordinate team itineraries for your golf program.',
};

// Cache travel info for 5 minutes (travel plans don't change frequently)
export const revalidate = 300;

export default async function GolfTravelPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Determine user role
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Get team_id from coach's organization
  let coachTeamId: string | null = null;
  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    coachTeamId = orgTeam?.id || null;
  }

  // Check if player and get team via golf_team_members
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let playerTeamId: string | null = null;
  if (player?.id) {
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();
    playerTeamId = teamMember?.team_id || null;
  }

  const isCoach = !!coach && !!coachTeamId;
  const teamId = coachTeamId || playerTeamId;

  if (!teamId) {
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h1>
          <p className="text-slate-600">You must be on a team to access travel itineraries.</p>
        </div>
      </div>
    );
  }

  // Fetch travel itineraries
  const { data: itinerariesRaw } = await supabase
    .from('golf_travel_itineraries')
    .select('*')
    .eq('team_id', teamId)
    .order('departure_date', { ascending: true });

  // Transform database data to match TravelItinerary interface expected by client component
  const itineraries = (itinerariesRaw || []).map(item => ({
    id: item.id,
    event_name: item.event_name || '',
    destination: item.destination || '',
    transportation_type: (item.transportation_type as 'bus' | 'van' | 'fly' | 'carpool') || 'bus',
    departure_date: item.departure_date || '',
    departure_time: item.departure_time,
    departure_location: item.departure_location,
    return_date: item.return_date,
    return_time: item.return_time,
    flight_info: typeof item.flight_info === 'string' ? item.flight_info : (item.flight_info ? JSON.stringify(item.flight_info) : null),
    hotel_name: item.hotel_name,
    hotel_address: item.hotel_address,
    hotel_phone: item.hotel_phone,
    hotel_confirmation: item.hotel_confirmation,
    check_in_date: null, // Not in database schema
    check_out_date: null, // Not in database schema
    room_assignments: typeof item.room_assignments === 'string' ? item.room_assignments : (item.room_assignments ? JSON.stringify(item.room_assignments) : null),
    uniform_requirements: item.uniform_requirements,
    gear_list: Array.isArray(item.gear_list) ? item.gear_list.join(', ') : (item.gear_list as string | null),
    notes: item.notes,
    created_at: item.created_at,
  }));

  return (
    <TravelClient
      itineraries={itineraries}
      coachId={coach?.id || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

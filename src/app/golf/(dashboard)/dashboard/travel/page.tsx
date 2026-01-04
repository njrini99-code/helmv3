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
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const isCoach = !!coach;
  const teamId = coach?.team_id || player?.team_id;

  if (!teamId) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h1>
          <p className="text-slate-600">You must be on a team to access travel itineraries.</p>
        </div>
      </div>
    );
  }

  // Fetch travel itineraries
  const { data: itineraries } = await supabase
    .from('golf_travel_itineraries')
    .select('*')
    .eq('team_id', teamId)
    .order('departure_date', { ascending: true });

  return (
    <TravelClient
      itineraries={itineraries || []}
      coachId={coach?.id || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

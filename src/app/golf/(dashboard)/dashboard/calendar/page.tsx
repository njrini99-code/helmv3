import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CalendarView } from '@/components/golf/calendar/CalendarView';
import { EventsList } from '@/components/golf/calendar/EventsList';
import { CreateEventButton } from '@/components/golf/calendar/CreateEventButton';
import type { GolfEvent } from '@/lib/types/golf';

export default async function GolfCalendarPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role;

  let teamId: string | null = null;
  let events: GolfEvent[] = [];

  if (userRole === 'coach') {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = coach?.team_id || null;
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = player?.team_id || null;
  }

  if (teamId) {
    const { data: eventsData } = await supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: true });

    events = eventsData || [];
  }

  const isCoach = userRole === 'coach';

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
            <p className="text-slate-500 mt-1">Team schedule and events</p>
          </div>
          {isCoach && <CreateEventButton />}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar View */}
          <div className="lg:col-span-2">
            <CalendarView events={events} />
          </div>

          {/* Events List */}
          <div>
            <EventsList events={events} isCoach={isCoach} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CalendarContainer } from '@/components/golf/calendar/CalendarContainer';
import { EventsList } from '@/components/golf/calendar/EventsList';
import { CreateEventButton } from '@/components/golf/calendar/CreateEventButton';
import { CalendarClassesList } from '@/components/golf/calendar/CalendarClassesList';
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
  let playerId: string | null = null;
  let events: GolfEvent[] = [];
  let classes: any[] = [];

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
    playerId = player?.id || null;

    // Fetch player's classes
    if (playerId) {
      const { data: classesData } = await supabase
        .from('golf_player_classes')
        .select('id, course_code, course_name, days, start_time, end_time, location, color, instructor')
        .eq('player_id', playerId)
        .order('start_time', { ascending: true });

      classes = (classesData || []).map(cls => ({
        ...cls,
        days: Array.isArray(cls.days) ? cls.days : [],
      }));
    }
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
  const isPlayer = userRole === 'player';

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
            <p className="text-slate-500 mt-1">
              {isPlayer && classes.length > 0 
                ? `Team schedule, events & ${classes.length} classes`
                : 'Team schedule and events'
              }
            </p>
          </div>
          {isCoach && <CreateEventButton />}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar View */}
          <div className="lg:col-span-2">
            <CalendarContainer events={events} classes={classes} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Events List */}
            <EventsList events={events} isCoach={isCoach} />
            
            {/* Classes List (for players) */}
            {isPlayer && classes.length > 0 && (
              <CalendarClassesList classes={classes} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

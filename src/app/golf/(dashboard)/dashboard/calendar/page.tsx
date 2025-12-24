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

  // Count upcoming events
  const upcomingCount = events.filter(e => new Date(e.start_date) >= new Date()).length;

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Calendar</h1>
              <p className="text-slate-500 mt-0.5">
                {upcomingCount} upcoming event{upcomingCount !== 1 ? 's' : ''}
                {isPlayer && classes.length > 0 && ` • ${classes.length} class${classes.length !== 1 ? 'es' : ''}`}
              </p>
            </div>
            {isCoach && <CreateEventButton />}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar View */}
          <div 
            className="lg:col-span-2"
            style={{ animation: 'fadeInUp 0.4s ease-out forwards', opacity: 0 }}
          >
            <CalendarContainer events={events} classes={classes} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Events List */}
            <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '100ms', opacity: 0 }}>
              <EventsList events={events} isCoach={isCoach} />
            </div>
            
            {/* Classes List (for players) */}
            {isPlayer && classes.length > 0 && (
              <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '200ms', opacity: 0 }}>
                <CalendarClassesList classes={classes} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

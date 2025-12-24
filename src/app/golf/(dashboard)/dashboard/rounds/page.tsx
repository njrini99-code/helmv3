import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconPlus, IconGolf, IconCalendar, IconMapPin, IconCheck, IconChevronRight } from '@/components/icons';
import type { GolfRound } from '@/lib/types/golf';

interface RoundWithPlayer extends GolfRound {
  player: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export default async function RoundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Check if user is a coach or player
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  const userRole = coach ? 'coach' : player ? 'player' : null;

  if (!userRole) {
    redirect('/golf/login');
  }

  // Fetch rounds based on role
  let rounds: RoundWithPlayer[] = [];

  if (userRole === 'coach' && coach?.team_id) {
    const { data } = await supabase
      .from('golf_rounds')
      .select(`
        *,
        player:golf_players!inner(first_name, last_name, team_id)
      `)
      .eq('player.team_id', coach.team_id)
      .order('round_date', { ascending: false })
      .limit(50);

    rounds = data as RoundWithPlayer[] || [];
  } else if (userRole === 'player' && player) {
    const { data } = await supabase
      .from('golf_rounds')
      .select(`
        *,
        player:golf_players(first_name, last_name)
      `)
      .eq('player_id', player.id)
      .order('round_date', { ascending: false });

    rounds = data as RoundWithPlayer[] || [];
  }

  // Group rounds by date
  const groupedRounds = rounds.reduce((acc, round) => {
    const date = new Date(round.round_date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(round);
    return acc;
  }, {} as Record<string, RoundWithPlayer[]>);

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rounds</h1>
              <p className="text-slate-500 mt-0.5">
                {rounds.length} round{rounds.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
            {userRole === 'player' && (
              <Link href="/golf/dashboard/rounds/new">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-medium text-sm rounded-xl hover:bg-slate-800 transition-colors">
                  <IconPlus size={16} />
                  New Round
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {rounds.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconGolf size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Rounds Yet</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              {userRole === 'coach' 
                ? "Your players haven't submitted any rounds yet."
                : 'Start tracking your golf rounds to see stats and improvement over time.'}
            </p>
            {userRole === 'player' && (
              <Link href="/golf/dashboard/rounds/new">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-medium text-sm rounded-xl hover:bg-slate-800 transition-colors">
                  <IconPlus size={16} />
                  Submit First Round
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedRounds).map(([monthYear, monthRounds], groupIndex) => (
              <div key={monthYear}>
                <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                  {monthYear}
                </h2>
                <div className="space-y-2">
                  {monthRounds.map((round, index) => {
                    const playerName = round.player 
                      ? `${round.player.first_name} ${round.player.last_name}`
                      : 'Unknown Player';
                    
                    const scoreToPar = round.total_to_par || 0;

                    return (
                      <Link key={round.id} href={`/golf/dashboard/rounds/${round.id}`}>
                        <div 
                          className="group bg-white rounded-xl border border-slate-200/60 hover:border-slate-300 hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-200"
                          style={{
                            animation: 'fadeInUp 0.4s ease-out forwards',
                            animationDelay: `${(groupIndex * 100) + (index * 30)}ms`,
                            opacity: 0,
                          }}
                        >
                          <div className="flex items-center gap-4 p-4">
                            {/* Score Badge */}
                            <div className={cn(
                              'w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
                              scoreToPar < 0 ? 'bg-emerald-50' : scoreToPar === 0 ? 'bg-slate-100' : 'bg-amber-50'
                            )}>
                              <span className={cn(
                                'text-xl font-bold',
                                scoreToPar < 0 ? 'text-emerald-600' : scoreToPar === 0 ? 'text-slate-700' : 'text-amber-600'
                              )}>
                                {round.total_score || '--'}
                              </span>
                              <span className={cn(
                                'text-[10px] font-medium',
                                scoreToPar < 0 ? 'text-emerald-500' : scoreToPar === 0 ? 'text-slate-500' : 'text-amber-500'
                              )}>
                                {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                              </span>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                                  {round.course_name}
                                </h3>
                                {round.is_verified && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-emerald-100 text-emerald-700">
                                    <IconCheck size={10} />
                                    Verified
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-slate-500">
                                {userRole === 'coach' && (
                                  <span className="flex items-center gap-1.5">
                                    <IconGolf size={14} className="text-slate-400" />
                                    {playerName}
                                  </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                  <IconCalendar size={14} className="text-slate-400" />
                                  {new Date(round.round_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                                {round.course_city && round.course_state && (
                                  <span className="flex items-center gap-1.5 hidden sm:flex">
                                    <IconMapPin size={14} className="text-slate-400" />
                                    {round.course_city}, {round.course_state}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right Side */}
                            <div className="hidden md:flex items-center gap-6">
                              {round.total_putts && (
                                <div className="text-center px-3">
                                  <p className="text-xs text-slate-400 mb-0.5">Putts</p>
                                  <p className="font-semibold text-slate-700 tabular-nums">{round.total_putts}</p>
                                </div>
                              )}
                              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 capitalize">
                                {round.round_type}
                              </span>
                            </div>

                            <IconChevronRight size={18} className="text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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

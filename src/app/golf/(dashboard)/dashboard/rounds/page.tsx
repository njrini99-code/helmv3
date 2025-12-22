import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconPlus, IconGolf, IconCalendar, IconMapPin, IconCheck } from '@/components/icons';
import type { GolfRound, GolfPlayer, GolfCoach } from '@/lib/types/golf';

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
    // Coach sees all team rounds
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
    // Player sees only their rounds
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Rounds
          </h1>
          <p className="text-slate-500 mt-1">
            {userRole === 'coach' ? 'Team round history' : 'Your round history'}
          </p>
        </div>
        {userRole === 'player' && (
          <Link href="/golf/dashboard/rounds/new">
            <Button>
              <IconPlus size={16} className="mr-2" />
              New Round
            </Button>
          </Link>
        )}
      </div>

      {/* Rounds List */}
      {rounds.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconGolf size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">
                No rounds yet
              </h3>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                {userRole === 'coach' 
                  ? 'Your players haven\'t submitted any rounds yet.'
                  : 'Start tracking your golf rounds to see stats and improvement over time.'}
              </p>
              {userRole === 'player' && (
                <Link href="/golf/dashboard/rounds/new">
                  <Button>
                    <IconPlus size={16} className="mr-2" />
                    Submit Your First Round
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {rounds.map((round) => {
            const playerName = round.player 
              ? `${round.player.first_name} ${round.player.last_name}`
              : 'Unknown Player';
            
            const scoreToPar = round.total_to_par || 0;
            const scoreColor = scoreToPar === 0 
              ? 'text-slate-600' 
              : scoreToPar < 0 
                ? 'text-green-600' 
                : 'text-red-600';

            return (
              <Link key={round.id} href={`/golf/dashboard/rounds/${round.id}`}>
                <Card className="hover:border-green-200 hover:shadow-md transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {round.course_name}
                          </h3>
                          {round.is_verified && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                              <IconCheck size={12} />
                              Verified
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-6 text-sm text-slate-500">
                          {userRole === 'coach' && (
                            <div className="flex items-center gap-2">
                              <IconGolf size={16} />
                              <span>{playerName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <IconCalendar size={16} />
                            <span>{new Date(round.round_date).toLocaleDateString()}</span>
                          </div>
                          {round.course_city && round.course_state && (
                            <div className="flex items-center gap-2">
                              <IconMapPin size={16} />
                              <span>{round.course_city}, {round.course_state}</span>
                            </div>
                          )}
                          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600 capitalize">
                            {round.round_type}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-3xl font-bold text-slate-900 mb-1">
                          {round.total_score || '--'}
                        </div>
                        <div className={`text-sm font-medium ${scoreColor}`}>
                          {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {round.total_putts ? `${round.total_putts} putts` : ''}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

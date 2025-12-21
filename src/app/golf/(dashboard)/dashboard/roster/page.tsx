'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { IconUsers, IconPlus, IconMail } from '@/components/icons';
import type { GolfPlayer } from '@/lib/types/golf';

export default function GolfRosterPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<GolfPlayer[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoster() {
      const { data: { user } } = await (supabase as any).auth.getUser();
      if (!user) return;

      // Get coach's team
      const { data: coach } = await (supabase as any)
        .from('golf_coaches')
        .select('team_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.team_id) return;
      setTeamId(coach.team_id);

      // Fetch players
      const { data: playersData } = await (supabase as any)
        .from('golf_players')
        .select('*')
        .eq('team_id', coach.team_id)
        .order('last_name', { ascending: true });

      setPlayers((playersData || []) as GolfPlayer[]);
      setLoading(false);
    }

    loadRoster();
  }, [supabase]);

  if (loading) return <PageLoading />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Roster</h1>
          <p className="text-slate-500 mt-1">{players.length} players on roster</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Invite Player
        </Button>
      </div>

      {players.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IconUsers size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No players yet
            </h3>
            <p className="text-slate-500 mb-4">
              Invite players to join your team
            </p>
            <Button className="gap-2">
              <IconMail size={18} />
              Send Invite Link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Team Roster</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-200">
              {players.map((player) => (
                <div key={player.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <span className="text-green-600 font-medium">
                        {player.first_name[0]}{player.last_name[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {player.year || 'Player'} • {player.hometown}, {player.state}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {player.handicap !== null ? `${player.handicap} HCP` : '--'}
                    </p>
                    <p className={`text-sm ${
                      player.status === 'active' ? 'text-green-600' :
                      player.status === 'injured' ? 'text-red-600' :
                      'text-slate-400'
                    }`}>
                      {player.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

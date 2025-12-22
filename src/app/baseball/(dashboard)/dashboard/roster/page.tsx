'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { IconUsers, IconSearch, IconFilter, IconLink } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';
import { InviteModal } from '@/components/coach/InviteModal';

interface TeamMember {
  id: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    grad_year: number | null;
    city: string | null;
    state: string | null;
    avatar_url: string | null;
    recruiting_activated: boolean | null;
  };
  jersey_number: number | null;
  joined_at: string | null;
}

export default function RosterPage() {
  const { user, coach, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('Your Team');

  useEffect(() => {
    if (coach?.id) {
      fetchCoachTeam();
    }
  }, [coach?.id]);

  useEffect(() => {
    if (teamId) {
      fetchRoster();
    }
  }, [teamId]);

  async function fetchCoachTeam() {
    if (!coach?.id) return;

    const supabase = createClient();

    // Find the team this coach belongs to
    const { data: staffData, error: staffError } = await supabase
      .from('team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id)
      .single();

    if (staffError) {
      // In dev mode, just show empty state instead of error
      setLoading(false);
      return;
    }

    if (staffData?.team_id) {
      setTeamId(staffData.team_id);

      // Fetch team name
      const { data: teamData } = await supabase
        .from('teams')
        .select('name')
        .eq('id', staffData.team_id)
        .single();

      if (teamData?.name) {
        setTeamName(teamData.name);
      }
    } else {
      setLoading(false);
    }
  }

  async function fetchRoster() {
    if (!teamId) return;

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('team_members')
      .select(`
        id,
        jersey_number,
        joined_at,
        player:players (
          id,
          first_name,
          last_name,
          email,
          primary_position,
          secondary_position,
          grad_year,
          city,
          state,
          avatar_url,
          recruiting_activated
        )
      `)
      .eq('team_id', teamId)
      .order('joined_at', { ascending: false });

    if (error) {
    } else {
      setRoster(data || []);
    }
    setLoading(false);
  }

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card glass>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Only coaches can access roster management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredRoster = roster.filter((member) => {
    if (!searchQuery) return true;
    const player = member.player;
    const fullName = getFullName(player.first_name, player.last_name).toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      player.primary_position?.toLowerCase().includes(query) ||
      player.grad_year?.toString().includes(query)
    );
  });

  return (
    <>
      <Header
        title="Roster"
        subtitle={`Manage your team - ${coach?.school_name || 'Your Team'}`}
      >
        <Button onClick={() => setShowInviteModal(true)}>
          <IconLink size={16} className="mr-2" />
          Invite Players
        </Button>
      </Header>
      <div className="p-8">
        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search players by name, position, or grad year..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="secondary">
                <IconFilter size={16} className="mr-2" />
                Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Roster Table */}
        <Card glass>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Team Roster</h2>
                <p className="text-sm leading-relaxed text-slate-500 mt-1">
                  {filteredRoster.length} {filteredRoster.length === 1 ? 'player' : 'players'}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : roster.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <IconUsers size={32} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Build your roster</h3>
                <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-md mx-auto">
                  Invite players to join your team by generating a team invite link. Players can use this link to join and complete their profiles.
                </p>
                <Button onClick={() => setShowInviteModal(true)}>
                  <IconLink size={16} className="mr-2" />
                  Generate Invite Link
                </Button>
              </div>
            ) : (
              /* Roster Table */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Player</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Position</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Grad Year</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Location</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Jersey</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Status</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRoster.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={getFullName(member.player.first_name, member.player.last_name)}
                              src={member.player.avatar_url || undefined}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium text-slate-900">
                                {getFullName(member.player.first_name, member.player.last_name)}
                              </p>
                              <p className="text-xs text-slate-500">{member.player.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-600">
                          {member.player.primary_position || '-'}
                          {member.player.secondary_position && `, ${member.player.secondary_position}`}
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-600">
                          {member.player.grad_year || '-'}
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-600">
                          {member.player.city && member.player.state
                            ? `${member.player.city}, ${member.player.state}`
                            : '-'}
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-600">
                          {member.jersey_number || '-'}
                        </td>
                        <td className="py-4 px-4">
                          {member.player.recruiting_activated ? (
                            <Badge variant="success">Recruiting Active</Badge>
                          ) : (
                            <Badge variant="secondary">Team Only</Badge>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <Button variant="secondary" size="sm">
                            View Profile
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Invite Instructions - Only show when there's no roster */}
        {roster.length === 0 && (
          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-semibold text-slate-900">How to add players</h2>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    1
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Generate an invite link</span>
                    <p className="text-slate-500 mt-1">Create a unique link that players can use to join your team.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    2
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Share with your players</span>
                    <p className="text-slate-500 mt-1">Send the link via email, text, or team messaging platform.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    3
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Players join automatically</span>
                    <p className="text-slate-500 mt-1">When players sign up using your link, they'll be added to your roster.</p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && teamId && coach?.id && (
        <InviteModal
          teamId={teamId}
          teamName={teamName}
          coachId={coach.id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </>
  );
}

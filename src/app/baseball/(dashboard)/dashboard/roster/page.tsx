'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonTable } from '@/components/ui/skeleton-loader';
import { IconUsers, IconSearch, IconFilter, IconLink, IconClipboardList } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';
import { InviteModal } from '@/components/coach/InviteModal';
import { LineupBuilder } from '@/components/coach/lineup/LineupBuilder';
import { saveLineup } from '@/app/baseball/actions/lineups';
import { useToast } from '@/components/ui/toast';

type MemberStatus = 'active' | 'inactive' | 'injured' | 'alumni';

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
  status: MemberStatus;
}

export default function RosterPage() {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();
  const { selectedTeamId, getSelectedTeam } = useTeamStore();
  const selectedTeam = getSelectedTeam();
  const [searchQuery, setSearchQuery] = useState('');
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeView, setActiveView] = useState<'roster' | 'lineup'>('roster');
  const [, setSavingLineup] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (selectedTeamId) {
      fetchRoster();
    } else {
      setLoading(false);
    }
  }, [selectedTeamId]);

  async function fetchRoster() {
    if (!selectedTeamId) return;

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('baseball_team_members')
      .select(`
        id,
        jersey_number,
        joined_at,
        status,
        player:baseball_players (
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
      .eq('team_id', selectedTeamId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('[Roster] Failed to fetch roster:', error);
      setRoster([]);
      setLoading(false);
      return;
    }

    setRoster(data || []);
    setLoading(false);
  }

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card variant="glass">
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
        subtitle={`Manage your team - ${(coach?.organization as { name?: string })?.name || 'Your Team'}`}
      >
        <Button onClick={() => setShowInviteModal(true)}>
          <IconLink size={16} className="mr-2" />
          Invite Players
        </Button>
      </Header>
      <div className="p-6 lg:p-8">
        {/* View Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveView('roster')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'roster'
                ? 'bg-green-50 text-green-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconUsers size={18} />
              <span>Roster</span>
            </div>
          </button>
          <button
            onClick={() => setActiveView('lineup')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'lineup'
                ? 'bg-green-50 text-green-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconClipboardList size={18} />
              <span>Lineup Builder</span>
            </div>
          </button>
        </div>

        {/* Roster View */}
        {activeView === 'roster' && (
          <>
            {/* Filters and Search */}
            <Card variant="glass" className="mb-6">
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
        <Card variant="glass">
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
              <SkeletonTable rows={5} columns={7} />
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
                          {member.status === 'active' && (
                            <Badge variant="success">Active</Badge>
                          )}
                          {member.status === 'inactive' && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {member.status === 'injured' && (
                            <Badge variant="warning">Injured</Badge>
                          )}
                          {member.status === 'alumni' && (
                            <Badge variant="secondary">Alumni</Badge>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => router.push(`/baseball/player/${member.player.id}`)}
                          >
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
              <Card variant="glass" className="mt-6">
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
          </>
        )}

        {/* Lineup Builder View */}
        {activeView === 'lineup' && (
          <LineupBuilder
            roster={roster.map((m) => ({
              id: m.player.id,
              first_name: m.player.first_name,
              last_name: m.player.last_name,
              primary_position: m.player.primary_position,
              jersey_number: m.jersey_number,
              avatar_url: m.player.avatar_url,
            }))}
            onSave={async (lineup, name) => {
              if (!selectedTeamId) {
                showToast('No team selected', 'error');
                return;
              }

              // Filter out empty slots and map to the format expected by saveLineup
              const positions = lineup
                .filter(slot => slot.player !== null)
                .map(slot => ({
                  order: slot.order,
                  playerId: slot.player!.id,
                }));

              if (positions.length === 0) {
                showToast('Please add at least one player to the lineup', 'error');
                return;
              }

              setSavingLineup(true);
              try {
                await saveLineup({
                  teamId: selectedTeamId,
                  name: name || 'Untitled Lineup',
                  positions,
                });
                showToast('Lineup saved successfully', 'success');
              } catch (error) {
                showToast(
                  error instanceof Error ? error.message : 'Failed to save lineup',
                  'error'
                );
              } finally {
                setSavingLineup(false);
              }
            }}
          />
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && selectedTeamId && coach?.id && (
        <InviteModal
          teamId={selectedTeamId}
          teamName={selectedTeam?.name || 'Your Team'}
          coachId={coach.id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useRouteProtection } from '@/hooks/use-route-protection';
import Image from 'next/image';
import {
  IconPlus,
  IconUsers,
  IconCalendar,
  IconVideo,
  IconCopy,
  IconCheck,
} from '@/components/icons';

interface Team {
  id: string;
  name: string;
  team_type: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  description: string | null;
  join_code: string;
  organization_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  member_count?: number;
}

interface TeamInvite {
  id: string;
  team_id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number | null;
  is_active: boolean | null;
  created_by_coach_id: string;
  created_at: string | null;
  updated_at: string | null;
}

export default function TeamsPage() {
  const router = useRouter();
  const { coach, loading: authLoading } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRouteProtection({
    allowedCoachTypes: ['showcase'],
    redirectTo: '/baseball/dashboard',
  });

  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Map<string, TeamInvite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create team form state
  const [newTeam, setNewTeam] = useState({
    name: '',
    description: '',
    primary_color: '#16A34A',
    secondary_color: '#FFFFFF',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchTeams() {
      if (authLoading || !coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();

      // baseball_teams does not have head_coach_id — use baseball_team_coach_staff for lookups
      const { data: staffData, error: staffError } = await supabase
        .from('baseball_team_coach_staff')
        .select('team_id')
        .eq('coach_id', coach.id);

      if (staffError) {
        setLoading(false);
        return;
      }

      const coachTeamIds = (staffData || []).map((s) => s.team_id);

      let teamsData: Team[] = [];
      if (coachTeamIds.length > 0) {
        const { data: fetchedTeams, error: teamsError } = await supabase
          .from('baseball_teams')
          .select('*')
          .in('id', coachTeamIds)
          .order('created_at', { ascending: false });

        if (teamsError) {
          setLoading(false);
          return;
        }
        teamsData = (fetchedTeams || []) as Team[];
      }

      // Get member counts
      const teamIds = teamsData?.map((t) => t.id) || [];
      if (teamIds.length > 0) {
        const { data: members } = await supabase
          .from('baseball_team_members')
          .select('team_id')
          .in('team_id', teamIds)
          .eq('status', 'active');

        const counts = new Map<string, number>();
        (members || []).forEach((m) => {
          counts.set(m.team_id, (counts.get(m.team_id) || 0) + 1);
        });

        const teamsWithCounts = (teamsData || []).map((t) => ({
          ...t,
          member_count: counts.get(t.id) || 0,
        }));
        setTeams(teamsWithCounts);

        // Get active invites for each team
        const { data: invitesData } = await supabase
          .from('baseball_team_invitations')
          .select('*')
          .in('team_id', teamIds)
          .eq('is_active', true);

        const inviteMap = new Map<string, TeamInvite>();
        (invitesData || []).forEach((inv) => {
          inviteMap.set(inv.team_id, inv as TeamInvite);
        });
        setInvites(inviteMap);
      } else {
        setTeams([]);
      }

      setLoading(false);
    }

    fetchTeams();
  }, [authLoading, coach?.id]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach?.id || !newTeam.name.trim()) return;

    setCreating(true);
    const supabase = createClient();

    // Generate a random join code for the team
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('baseball_teams')
      .insert({
        name: newTeam.name.trim(),
        team_type: 'showcase',
        description: newTeam.description || null,
        primary_color: newTeam.primary_color,
        secondary_color: newTeam.secondary_color || null,
        join_code: joinCode,
        organization_id: coach.organization_id || null,
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      setCreating(false);
      return;
    }

    // Also add coach to team_coach_staff
    await supabase.from('baseball_team_coach_staff').insert({
      team_id: data.id,
      coach_id: coach.id,
      role: 'Head Coach',
      is_primary: true,
    });

    setTeams([{ ...data, member_count: 0 }, ...teams]);
    setShowCreateModal(false);
    setNewTeam({
      name: '',
      description: '',
      primary_color: '#16A34A',
      secondary_color: '#FFFFFF',
    });
    setCreating(false);
  };

  const handleGenerateInvite = async (teamId: string) => {
    if (!coach?.id) return;

    const supabase = createClient();

    // Generate a random invite code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('baseball_team_invitations')
      .insert({
        team_id: teamId,
        code: code,
        created_by_coach_id: coach.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return;
    }

    setInvites(new Map(invites).set(teamId, data as TeamInvite));
  };

  const handleCopyInvite = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (authLoading || routeLoading || loading) {
    return <PageLoading />;
  }

  if (!isAllowed) {
    return <PageLoading />;
  }

  if (!coach) {
    return (
      <>
        <Header title="Teams" subtitle="Showcase coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Please log in as a showcase coach to manage teams.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Teams"
        subtitle={`Manage your ${teams.length} team${teams.length !== 1 ? 's' : ''}`}
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <IconPlus size={16} />
          New Team
        </Button>
      </Header>

      <div className="p-6">
        {teams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <IconUsers size={24} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No teams yet</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              Create your first team to start managing rosters, videos, and development plans.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <IconPlus size={16} />
              Create Your First Team
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => {
              const invite = invites.get(team.id);
              return (
                <div
                  key={team.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-md transition-all"
                >
                  {/* Team Header */}
                  <div
                    className="h-20 relative"
                    style={{ backgroundColor: team.primary_color || '#16A34A' }}
                  >
                    <div className="absolute -bottom-8 left-4">
                      {team.logo_url ? (
                        <Image
                          src={team.logo_url}
                          alt={team.name}
                          width={64}
                          height={64}
                          className="w-16 h-16 rounded-xl border-4 border-white object-cover"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-xl border-4 border-white flex items-center justify-center text-white text-xl font-bold"
                          style={{ backgroundColor: team.primary_color || '#16A34A' }}
                        >
                          {team.name.charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Team Info */}
                  <div className="pt-10 px-4 pb-4">
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">{team.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                      <Badge variant="secondary">{team.team_type}</Badge>
                      {team.description && (
                        <span className="truncate max-w-[200px]">
                          {team.description}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-4 py-3 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <IconUsers size={16} className="text-slate-400" />
                        <span>{team.member_count || 0} players</span>
                      </div>
                      {team.join_code && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <IconCalendar size={16} className="text-slate-400" />
                          <span>Code: {team.join_code}</span>
                        </div>
                      )}
                    </div>

                    {/* Invite Link */}
                    <div className="mt-3 p-3 rounded-xl bg-slate-50">
                      <p className="text-xs font-medium text-slate-500 mb-2">Invite Link</p>
                      {invite ? (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono text-slate-700 truncate">
                            {invite.code}
                          </code>
                          <button
                            onClick={() => handleCopyInvite(invite.code)}
                            className="min-w-[44px] min-h-[44px] p-2.5 rounded-lg hover:bg-slate-200 active:bg-slate-300 transition-colors flex items-center justify-center"
                            title="Copy invite link"
                          >
                            {copiedCode === invite.code ? (
                              <IconCheck size={16} className="text-primary-600" />
                            ) : (
                              <IconCopy size={16} className="text-slate-500" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => handleGenerateInvite(team.id)}
                        >
                          Generate Invite Link
                        </Button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => router.push(`/dashboard/roster?team=${team.id}`)}
                      >
                        <IconUsers size={14} />
                        Roster
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => router.push(`/dashboard/videos?team=${team.id}`)}
                      >
                        <IconVideo size={14} />
                        Videos
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Create New Team</h2>
            </div>
            <form onSubmit={handleCreateTeam} className="p-6 space-y-4">
              <Input
                label="Team Name"
                placeholder="e.g., Texas Elite 18U"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                required
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Brief description of your team..."
                  value={newTeam.description}
                  onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newTeam.primary_color}
                      onChange={(e) => setNewTeam({ ...newTeam, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <Input
                      value={newTeam.primary_color}
                      onChange={(e) => setNewTeam({ ...newTeam, primary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Secondary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newTeam.secondary_color}
                      onChange={(e) => setNewTeam({ ...newTeam, secondary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <Input
                      value={newTeam.secondary_color}
                      onChange={(e) => setNewTeam({ ...newTeam, secondary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" isLoading={creating}>
                  Create Team
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

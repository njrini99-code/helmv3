'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PeekPanelRoot } from './PeekPanelRoot';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconExternalLink,
  IconUsers,
  IconMapPin,
  IconSparkles,
  IconChevronRight,
  IconMail,
  IconBuilding,
} from '@/components/icons';
import type { Organization, Player } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface TeamWithDetails extends Organization {
  players?: TeamPlayer[];
  player_count?: number;
  recruiting_active_count?: number;
}

type TeamPlayer = Pick<
  Player,
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'primary_position'
  | 'grad_year'
  | 'avatar_url'
  | 'recruiting_activated'
  | 'pitch_velo'
  | 'exit_velo'
>;

interface TeamPeekPanelProps {
  teamId: string | null;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  high_school: 'High School',
  showcase: 'Showcase',
  travel_ball: 'Travel Ball',
  college: 'College',
  juco: 'JUCO',
};

const TYPE_BADGE_VARIANTS: Record<string, 'primary' | 'success' | 'secondary' | 'warning'> = {
  high_school: 'primary',
  showcase: 'secondary',
  travel_ball: 'warning',
  college: 'success',
  juco: 'success',
};

export function TeamPeekPanel({ teamId, onClose }: TeamPeekPanelProps) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamWithDetails | null>(null);
  const [topPlayers, setTopPlayers] = useState<TeamPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (teamId) {
      fetchTeam(teamId);
    } else {
      setTeam(null);
      setTopPlayers([]);
    }
  }, [teamId]);

  const fetchTeam = async (id: string) => {
    setLoading(true);
    const supabase = createClient();

    // Fetch organization details
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (orgError) {
      console.error('Error fetching team:', orgError);
      toast.error('Failed to load team details');
      setLoading(false);
      return;
    }

    // Use a Map to deduplicate players from multiple sources
    const playerMap = new Map<string, TeamPlayer>();

    // Method 1: For high school teams, query via high_school_org_id
    if (orgData.type === 'high_school') {
      const { data: playersData, error: playersError } = await supabase
        .from('baseball_players')
        .select('id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo')
        .eq('high_school_org_id', id);

      if (playersError) {
        console.error('Error fetching players via high_school_org_id:', playersError);
      }

      // Add players from direct high_school_org_id link
      (playersData || []).forEach((p) => {
        if (!playerMap.has(p.id)) {
          playerMap.set(p.id, p as TeamPlayer);
        }
      });
    }

    // Method 2: Query via team_members → teams → organizations (for ALL org types)
    // First get teams for this organization
    const { data: teamsData } = await supabase
      .from('baseball_teams')
      .select('id')
      .eq('organization_id', id);

    if (teamsData && teamsData.length > 0) {
      const teamIds = teamsData.map((t) => t.id);

      // Get team members with player data
      const { data: teamMembers, error: tmError } = await supabase
        .from('baseball_team_members')
        .select(`
          player:baseball_players!baseball_team_members_player_id_fkey(
            id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo
          )
        `)
        .in('team_id', teamIds);

      if (tmError) {
        console.error('Error fetching team members:', tmError);
      }

      if (teamMembers) {
        // Add players from team_members (deduplicates automatically via Map)
        teamMembers.forEach((tm) => {
          const player = tm.player as TeamPlayer | null;
          if (player && player.id && !playerMap.has(player.id)) {
            playerMap.set(player.id, player);
          }
        });
      }
    }

    // Convert to array, sort by pitch_velo, and limit
    let allPlayers = Array.from(playerMap.values());
    allPlayers.sort((a, b) => (b.pitch_velo || 0) - (a.pitch_velo || 0));
    allPlayers = allPlayers.slice(0, 20);

    const recruitingActive = allPlayers.filter(p => p.recruiting_activated);

    setTeam({
      ...orgData,
      player_count: allPlayers.length,
      recruiting_active_count: recruitingActive.length,
    });

    // Get top players (recruiting active with best stats)
    const topProspects = recruitingActive.slice(0, 5);
    setTopPlayers(topProspects);

    setLoading(false);
  };

  const handleViewProfile = () => {
    if (team) {
      router.push(`/baseball/program/${team.id}`);
      onClose();
    }
  };

  const handleViewRoster = () => {
    if (team) {
      router.push(`/baseball/program/${team.id}/roster`);
      onClose();
    }
  };

  const handleContactCoach = () => {
    if (team) {
      router.push(`/baseball/dashboard/messages/new?team=${team.id}`);
      onClose();
    }
  };

  const handleViewPlayer = (playerId: string) => {
    router.push(`/baseball/player/${playerId}`);
    onClose();
  };

  if (!teamId) return null;

  return (
    <PeekPanelRoot isOpen={!!teamId} onClose={onClose} width="lg">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : team ? (
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            {/* Team Logo */}
            <div
              className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center"
              style={{
                backgroundColor: team.primary_color ? `${team.primary_color}15` : undefined,
                borderColor: team.primary_color ? `${team.primary_color}30` : undefined,
              }}
            >
              {team.logo_url ? (
                <Image
                  src={team.logo_url}
                  alt={team.name || 'Team'}
                  width={64}
                  height={64}
                  className="object-contain"
                />
              ) : (
                <IconBuilding
                  size={28}
                  className="text-slate-400"
                  style={{ color: team.primary_color || undefined }}
                />
              )}
            </div>

            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-900">
                {team.name || 'Unknown Team'}
              </h2>
              <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500">
                <IconMapPin size={14} />
                <span>
                  {team.location_city}, {team.location_state}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={TYPE_BADGE_VARIANTS[team.type || 'high_school'] || 'secondary'}>
                  {TYPE_LABELS[team.type || 'high_school']}
                </Badge>
                {team.division && (
                  <Badge variant="secondary">{team.division}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<IconUsers size={18} className="text-slate-500" />}
              label="Total Players"
              value={team.player_count?.toString() || '0'}
            />
            <StatCard
              icon={<IconSparkles size={18} className="text-green-500" />}
              label="Recruiting Active"
              value={team.recruiting_active_count?.toString() || '0'}
              highlight
            />
          </div>

          {/* About */}
          {team.description && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">About</h3>
              <p className="text-sm leading-relaxed text-slate-600 line-clamp-4">
                {team.description}
              </p>
            </div>
          )}

          {/* Top Prospects */}
          {topPlayers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Top Prospects
                </h3>
                <button
                  onClick={handleViewRoster}
                  className="text-xs font-medium text-green-600 hover:text-green-700 transition-colors"
                >
                  View all →
                </button>
              </div>
              <div className="space-y-2">
                {topPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handleViewPlayer(player.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                  >
                    <Avatar
                      name={`${player.first_name} ${player.last_name}`}
                      src={player.avatar_url}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {(player.first_name || 'Unknown')} {player.last_name || ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {player.primary_position || '—'} • Class of {player.grad_year || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {player.pitch_velo && (
                        <span className="text-slate-600">
                          {player.pitch_velo} mph
                        </span>
                      )}
                      <IconChevronRight size={14} className="text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty state for no prospects */}
          {topPlayers.length === 0 && (
            <div className="text-center py-6 bg-slate-50 rounded-xl">
              <IconUsers size={24} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm text-slate-500">
                No recruiting-active players yet
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="primary"
              onClick={handleViewRoster}
              className="w-full"
            >
              <IconUsers size={16} className="mr-2" />
              View Full Roster
              <IconChevronRight size={14} className="ml-auto" />
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={handleViewProfile}
              >
                <IconExternalLink size={16} className="mr-2" />
                Program Profile
              </Button>
              <Button
                variant="secondary"
                onClick={handleContactCoach}
              >
                <IconMail size={16} className="mr-2" />
                Contact Coach
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Team not found</p>
        </div>
      )}
    </PeekPanelRoot>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${highlight ? 'bg-green-50' : 'bg-slate-50'}`}>
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-lg font-semibold ${highlight ? 'text-green-600' : 'text-slate-900'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

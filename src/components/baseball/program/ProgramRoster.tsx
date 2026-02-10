'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  IconUsers,
  IconChevronRight,
  IconSparkles,
} from '@/components/icons';
import type { Player } from '@/lib/types';

type RosterPlayer = Pick<
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
  | 'city'
  | 'state'
>;

interface ProgramRosterProps {
  organizationId: string;
  organizationType: string;
  coachType?: string; // For roster visibility control
}

export function ProgramRoster({ organizationId, organizationType, coachType }: ProgramRosterProps) {
  const router = useRouter();
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  // ============================================================
  // ROSTER VISIBILITY: Coaches can only view rosters based on org type
  // - College coaches: can view HS and Showcase org rosters
  // - JUCO coaches: can only view HS org rosters
  // ============================================================
  const canViewRoster = (() => {
    if (!coachType) return true; // Fallback to show if no coach type
    if (coachType === 'college') {
      return ['high_school', 'showcase'].includes(organizationType);
    }
    if (coachType === 'juco') {
      return organizationType === 'high_school';
    }
    return false;
  })();

  useEffect(() => {
    if (canViewRoster) {
      fetchRoster();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchRoster only depends on organizationId and organizationType which are already in deps
  }, [organizationId, organizationType, canViewRoster]);

  // If coach can't view this roster, show restricted message
  if (!canViewRoster) {
    return (
      <Card className="p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <IconUsers size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          Roster not available
        </h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          {coachType === 'juco'
            ? 'JUCO coaches can only view high school program rosters.'
            : 'You do not have access to view this program\'s roster.'}
        </p>
      </Card>
    );
  }

  const fetchRoster = async () => {
    setLoading(true);
    const supabase = createClient();

    const playerMap = new Map<string, RosterPlayer>();

    // Method 1: For high school teams, query via high_school_org_id
    if (organizationType === 'high_school') {
      const { data: playersData, error } = await supabase
        .from('baseball_players')
        .select('id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo, city, state')
        .eq('high_school_org_id', organizationId)
        .eq('recruiting_activated', true);

      if (error) {
        console.error('Error fetching players via high_school_org_id:', error);
      }

      // Add players from direct high_school_org_id link
      (playersData || []).forEach((p) => {
        if (!playerMap.has(p.id)) {
          playerMap.set(p.id, p as RosterPlayer);
        }
      });
    }

    // Method 2: Query via team_members → teams → organizations (works for ALL org types)
    const { data: teamsData } = await supabase
      .from('baseball_teams')
      .select('id')
      .eq('organization_id', organizationId);

    if (teamsData && teamsData.length > 0) {
      const teamIds = teamsData.map((t) => t.id);

      const { data: teamMembers, error } = await supabase
        .from('baseball_team_members')
        .select(`
          player:baseball_players!baseball_team_members_player_id_fkey(
            id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo, city, state
          )
        `)
        .in('team_id', teamIds);

      if (error) {
        console.error('Error fetching team members:', error);
      }

      if (teamMembers) {
        // Extract unique players with recruiting activated
        teamMembers.forEach((tm) => {
          const player = tm.player as RosterPlayer | null;
          if (player && player.id && player.recruiting_activated && !playerMap.has(player.id)) {
            playerMap.set(player.id, player);
          }
        });
      }
    }

    // Convert map to array and sort by grad year
    const allPlayers = Array.from(playerMap.values());
    allPlayers.sort((a, b) => (a.grad_year || 9999) - (b.grad_year || 9999));

    setPlayers(allPlayers);
    setLoading(false);
  };

  const handleViewPlayer = (playerId: string) => {
    router.push(`/baseball/player/${playerId}`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
              <div className="h-3 bg-slate-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <IconUsers size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          No recruiting-active players
        </h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Players on this team haven&apos;t activated their recruiting profiles yet.
        </p>
      </Card>
    );
  }

  // Group players by grad year
  const playersByYear = players.reduce((acc, player) => {
    const year = player.grad_year || 'Unknown';
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(player);
    return acc;
  }, {} as Record<string | number, RosterPlayer[]>);

  const years = Object.keys(playersByYear).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <IconSparkles size={16} className="text-green-500" />
        <span>
          <span className="font-semibold text-green-600">{players.length}</span> recruiting-active players
        </span>
      </div>

      {/* Players by Year */}
      {years.map((year) => (
        <div key={year}>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Class of {year}
          </h3>
          <div className="space-y-2">
            {(playersByYear[year] || []).map((player) => (
              <button
                key={player.id}
                onClick={() => handleViewPlayer(player.id)}
                className="w-full bg-white rounded-xl border border-slate-200 p-4 hover:border-green-200 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    name={`${player.first_name} ${player.last_name}`}
                    src={player.avatar_url}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <Badge variant="success" className="text-[10px]">
                        Active
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {player.primary_position || 'Position TBD'} • {player.city}, {player.state}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {player.pitch_velo && (
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{player.pitch_velo}</p>
                        <p className="text-xs text-slate-400">mph</p>
                      </div>
                    )}
                    {player.exit_velo && (
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{player.exit_velo}</p>
                        <p className="text-xs text-slate-400">exit</p>
                      </div>
                    )}
                    <IconChevronRight
                      size={18}
                      className="text-slate-300 group-hover:text-green-500 transition-colors"
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

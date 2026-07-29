'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  IconUsers,
  IconChevronRight,
  IconSparkles,
} from '@/components/icons';
import type { Player } from '@/lib/types';
import { Button } from '@/components/ui/button';

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
  | 'player_type'
>;

/**
 * Roster visibility rules:
 * - JUCO players: always visible (recruiting is free — no subscription gate)
 * - HS / Showcase players: only visible when recruiting_activated = true (subscription)
 * - College players: never shown (not recruitable)
 */
function isRosterVisible(player: Pick<RosterPlayer, 'player_type' | 'recruiting_activated'>): boolean {
  if (player.player_type === 'juco') return true;
  if (player.player_type === 'college') return false;
  return player.recruiting_activated === true;
}

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
    if (!coachType) return true; // Fallback when coach type unknown
    if (coachType === 'college') {
      // College coaches recruit from HS, showcase, and JUCO programs
      return ['high_school', 'showcase', 'juco'].includes(organizationType);
    }
    if (coachType === 'juco') {
      // JUCO coaches recruit only HS players
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
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warm-100 flex items-center justify-center">
          <IconUsers size={28} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">
          Roster not available
        </h3>
        <p className="text-sm text-warm-500 max-w-sm mx-auto">
          {coachType === 'juco'
            ? 'JUCO coaches can view high school program rosters only.'
            : 'You do not have access to view this program\'s roster.'}
        </p>
      </Card>
    );
  }

  const fetchRoster = async () => {
    setLoading(true);
    const supabase = createClient();

    const playerMap = new Map<string, RosterPlayer>();

    // Method 1: For high school orgs, also query via high_school_org_id
    if (organizationType === 'high_school') {
      const { data: playersData, error } = await fromUntyped(supabase, 'baseball_players')
        .select('id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo, city, state, player_type')
        .eq('high_school_org_id', organizationId)
        .neq('player_type', 'college'); // never show college players

      if (error) {
        console.error('Error fetching players via high_school_org_id:', error);
      }

      (playersData || []).forEach((p: RosterPlayer) => {
        if (!playerMap.has(p.id) && isRosterVisible(p)) {
          playerMap.set(p.id, p);
        }
      });
    }

    // Method 2: Query via team_members → teams → organizations (works for ALL org types)
    //
    // Reads the anon-safe public-profile VIEW, not baseball_teams. This
    // component renders on the PUBLIC program page for a viewer who staffs
    // nothing — so once baseball_teams_select is tenant-scoped (migration
    // 20260729000200) the base table returns zero rows and this whole branch
    // is skipped, silently. The view returns the same `id` and never exposes
    // join_code.
    const { data: teamsData } = await supabase
      .from('baseball_teams_public_profile')
      .select('id')
      .eq('organization_id', organizationId);

    if (teamsData && teamsData.length > 0) {
      // Nullable in the generated types because the source is a VIEW — narrow
      // instead of casting, so a null id cannot widen the `.in()` filter.
      const teamIds = teamsData
        .map((t) => t.id)
        .filter((teamId): teamId is string => typeof teamId === 'string');

      const { data: teamMembers, error } = await supabase
        .from('baseball_team_members')
        .select(`
          player:baseball_players!baseball_team_members_player_id_fkey(
            id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo, city, state, player_type
          )
        `)
        .in('team_id', teamIds);

      if (error) {
        console.error('Error fetching team members:', error);
      }

      if (teamMembers) {
        teamMembers.forEach((tm) => {
          const player = tm.player as RosterPlayer | null;
          if (player && player.id && !playerMap.has(player.id) && isRosterVisible(player)) {
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
          <div key={i} className="bg-cream-50 rounded-xl border border-warm-200 p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warm-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-warm-200 rounded w-1/3" />
                <div className="h-3 bg-warm-100 rounded w-1/2" />
              </div>
              <div className="h-3 bg-warm-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    const isJuco = organizationType === 'juco';
    return (
      <Card className="p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warm-100 flex items-center justify-center">
          <IconUsers size={28} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">
          {isJuco ? 'No players on roster' : 'No recruiting-active players'}
        </h3>
        <p className="text-sm text-warm-500 max-w-sm mx-auto">
          {isJuco
            ? 'This JUCO program has no players on their roster yet.'
            : 'Players on this team haven\'t activated their recruiting profiles yet.'}
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
      <div className="flex items-center gap-2 text-sm text-warm-600">
        <IconSparkles size={16} className="text-primary-500" />
        <span>
          <span className="font-semibold text-primary-600">{players.length}</span>{' '}
          {organizationType === 'juco' ? 'players on roster' : 'recruiting-active players'}
        </span>
      </div>

      {/* Players by Year */}
      {years.map((year) => (
        <div key={year}>
          <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wide mb-3">
            Class of {year}
          </h3>
          <div className="space-y-2">
            {(playersByYear[year] || []).map((player) => (
              <Button variant="ghost"
                key={player.id}
                onClick={() => handleViewPlayer(player.id)}
                className="w-full bg-cream-50 rounded-xl border border-warm-200 p-4 hover:border-primary-200 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    name={`${player.first_name} ${player.last_name}`}
                    src={player.avatar_url}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-warm-900 truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      {player.player_type === 'juco' ? (
                        <Badge variant="secondary" className="text-micro">JUCO</Badge>
                      ) : (
                        <Badge variant="success" className="text-micro">Recruiting</Badge>
                      )}
                    </div>
                    <p className="text-sm text-warm-500">
                      {player.primary_position || 'Position TBD'} • {player.city}, {player.state}
                    </p>
                  </div>
                  {/* shrink-0: without it this block has no min-width of its
                      own (browsers won't shrink a flex item below its
                      content's intrinsic min-width unless it's the one with
                      min-w-0, which is the name column, not this one) — so at
                      320px both this block AND the name column above were
                      fighting for the same scarce space, and the name lost,
                      squeezed to a sliver. The velo stats are supplementary,
                      not the primary reason to tap this row, so below `sm:`
                      they're hidden outright (honest omission) rather than
                      left to wrap/overflow — only the chevron (always a
                      fixed, tiny width) stays visible at every size. */}
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    {player.pitch_velo && (
                      <div className="hidden text-right sm:block">
                        <p className="font-semibold text-warm-900">{player.pitch_velo}</p>
                        <p className="text-xs text-warm-400">mph</p>
                      </div>
                    )}
                    {player.exit_velo && (
                      <div className="hidden text-right sm:block">
                        <p className="font-semibold text-warm-900">{player.exit_velo}</p>
                        <p className="text-xs text-warm-400">exit</p>
                      </div>
                    )}
                    <IconChevronRight
                      size={18}
                      className="text-warm-300 group-hover:text-primary-500 transition-colors"
                    />
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

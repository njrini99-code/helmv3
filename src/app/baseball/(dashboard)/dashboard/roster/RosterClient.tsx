'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { EditorsLetter } from '@/components/baseball/living-annual';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';
import { saveLineup } from '@/app/baseball/actions/lineups';
import { useToast } from '@/components/ui/sonner';
import type { RosterBoardMember } from '@/components/baseball/roster';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { RosterReadModel } from '@/lib/baseball/read-models/roster';
import { fairwayScope } from '@/lib/redesign/flag';
import { RosterFairway } from './RosterFairway';

type MemberStatus = 'pending' | 'active' | 'inactive' | 'removed' | 'injured' | 'alumni';
export type RosterSurface = 'cards' | 'position' | 'status' | 'development';
export type SortField = 'name' | 'position' | 'avg' | 'obp' | 'slg' | 'ops' | 'sessions';
export type SortDirection = 'asc' | 'desc';

export interface RosterClientProps {
  teamId: string | null;
  initialModel?: Pick<
    RosterReadModel,
    'authorized' | 'members' | 'aggregates' | 'rosterError' | 'aggregatesError'
  >;
}

export interface PlayerData {
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
}

export interface TeamMember {
  id: string;
  player: PlayerData;
  jersey_number: number | null;
  joined_at: string | null;
  status: MemberStatus | null;
}

/** Export the current roster + career stats as a downloadable CSV. */
function exportRosterCSV(
  players: Array<{
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    jersey_number: number | null;
    career_avg: number | null;
    career_obp: number | null;
    career_slg: number | null;
    career_ops: number | null;
    total_sessions: number | null;
    status: string | null;
  }>,
) {
  const headers = [
    'First Name',
    'Last Name',
    'Position',
    'Grad Year',
    'Jersey #',
    'AVG',
    'OBP',
    'SLG',
    'OPS',
    'Sessions',
    'Status',
  ];
  const rows = players.map((p) => [
    p.first_name || '',
    p.last_name || '',
    p.primary_position || '',
    p.grad_year?.toString() || '',
    p.jersey_number?.toString() || '',
    p.career_avg !== null ? p.career_avg.toFixed(3) : '',
    p.career_obp !== null ? p.career_obp.toFixed(3) : '',
    p.career_slg !== null ? p.career_slg.toFixed(3) : '',
    p.career_ops !== null ? p.career_ops.toFixed(3) : '',
    p.total_sessions?.toString() || '0',
    p.status || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roster_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RosterClient({ teamId: serverTeamId, initialModel }: RosterClientProps) {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();
  const { selectedTeamId, getSelectedTeam } = useTeamStore();
  const selectedTeam = getSelectedTeam();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [roster, setRoster] = useState<TeamMember[]>(
    (initialModel?.members as TeamMember[] | undefined) ?? [],
  );
  const [aggregates, setAggregates] = useState<Record<string, BaseballPlayerAggregates>>(
    initialModel?.aggregates ?? {},
  );
  const [loading, setLoading] = useState(!initialModel);
  const [loadError, setLoadError] = useState<'roster' | 'unauthorized' | null>(
    !initialModel?.authorized && initialModel
      ? 'unauthorized'
      : initialModel?.rosterError
        ? 'roster'
        : null,
  );
  const [aggregatesWarning, setAggregatesWarning] = useState(
    initialModel?.aggregatesError ?? false,
  );
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeView, setActiveView] = useState<'roster' | 'lineup'>('roster');
  const [, setSavingLineup] = useState(false);
  const { showToast } = useToast();

  // Filters
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [gradYearFilter, setGradYearFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Sort and View
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [rosterSurface, setRosterSurface] = useState<RosterSurface>('cards');

  // Resolved team ID: prefer store, fall back to first team in org
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(
    serverTeamId ?? selectedTeamId,
  );

  useEffect(() => {
    if (serverTeamId) {
      setResolvedTeamId(serverTeamId);
      return;
    }
    if (selectedTeamId) {
      setResolvedTeamId(selectedTeamId);
      return;
    }
    // Store not populated yet — wait for auth, then do direct lookup via org
    if (authLoading) return;
    if (!coach?.organization_id) { setLoading(false); return; }

    const supabase = createClient();
    supabase
      .from('baseball_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) setResolvedTeamId(data.id);
        else setLoading(false);
      });
  }, [serverTeamId, selectedTeamId, authLoading, coach?.organization_id]);

  useEffect(() => {
    if (initialModel) return;
    if (resolvedTeamId) {
      fetchRosterWithAggregates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTeamId, initialModel]);

  async function fetchRosterWithAggregates() {
    if (!resolvedTeamId) return;

    setLoading(true);
    setLoadError(null);
    const supabase = createClient();

    // Fetch roster
    const { data: rosterData, error: rosterError } = await supabase
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
      .eq('team_id', resolvedTeamId)
      .order('joined_at', { ascending: false });

    if (rosterError) {
      console.error('[Roster] Failed to fetch roster:', rosterError);
      setRoster([]);
      setLoadError('roster');
      setLoading(false);
      return;
    }

    setRoster(rosterData || []);

    // Fetch aggregates for all players on this team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: aggregatesData, error: aggError } = await (supabase as any)
      .from('baseball_player_aggregates')
      .select('*')
      .eq('team_id', resolvedTeamId) as { data: BaseballPlayerAggregates[] | null; error: unknown };

    if (!aggError && aggregatesData) {
      const aggMap: Record<string, BaseballPlayerAggregates> = {};
      aggregatesData.forEach((agg) => {
        aggMap[agg.player_id] = agg;
      });
      setAggregates(aggMap);
    } else if (aggError) {
      setAggregatesWarning(true);
    }

    setLoading(false);
  }

  // Filter and sort logic
  const filteredRoster = useMemo(() => {
    // First filter
    const filtered = roster.filter((member) => {
      const player = member.player;
      const fullName = getFullName(player.first_name, player.last_name).toLowerCase();
      const query = searchQuery.toLowerCase();

      // Search filter
      if (searchQuery) {
        const matchesSearch =
          fullName.includes(query) ||
          player.primary_position?.toLowerCase().includes(query) ||
          player.secondary_position?.toLowerCase().includes(query) ||
          player.grad_year?.toString().includes(query) ||
          member.jersey_number?.toString().includes(query);
        if (!matchesSearch) return false;
      }

      // Position filter
      if (positionFilter) {
        const matchesPosition =
          player.primary_position === positionFilter ||
          player.secondary_position === positionFilter;
        if (!matchesPosition) return false;
      }

      // Grad year filter
      if (gradYearFilter) {
        if (player.grad_year?.toString() !== gradYearFilter) return false;
      }

      // Status filter
      if (statusFilter) {
        if (member.status !== statusFilter) return false;
      }

      return true;
    });

    // Then sort
    const sorted = [...filtered].sort((a, b) => {
      const playerA = a.player;
      const playerB = b.player;
      const aggA = aggregates[playerA.id];
      const aggB = aggregates[playerB.id];

      let comparison = 0;

      switch (sortField) {
        case 'name': {
          const nameA = getFullName(playerA.first_name, playerA.last_name).toLowerCase();
          const nameB = getFullName(playerB.first_name, playerB.last_name).toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'position': {
          const posA = playerA.primary_position || 'ZZZ';
          const posB = playerB.primary_position || 'ZZZ';
          comparison = posA.localeCompare(posB);
          break;
        }
        case 'avg': {
          const avgA = aggA?.career_avg ?? -1;
          const avgB = aggB?.career_avg ?? -1;
          comparison = avgB - avgA; // Higher is better
          break;
        }
        case 'obp': {
          const obpA = aggA?.career_obp ?? -1;
          const obpB = aggB?.career_obp ?? -1;
          comparison = obpB - obpA; // Higher is better
          break;
        }
        case 'slg': {
          const slgA = aggA?.career_slg ?? -1;
          const slgB = aggB?.career_slg ?? -1;
          comparison = slgB - slgA; // Higher is better
          break;
        }
        case 'ops': {
          const opsA = aggA?.career_ops ?? -1;
          const opsB = aggB?.career_ops ?? -1;
          comparison = opsB - opsA; // Higher is better
          break;
        }
        case 'sessions': {
          const sessA = aggA?.total_sessions ?? 0;
          const sessB = aggB?.total_sessions ?? 0;
          comparison = sessB - sessA; // More is better
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [roster, searchQuery, positionFilter, gradYearFilter, statusFilter, sortField, sortDirection, aggregates]);

  // Active filter count
  const activeFilterCount = [positionFilter, gradYearFilter, statusFilter].filter(Boolean).length;

  const boardMembers = useMemo<RosterBoardMember[]>(
    () =>
      filteredRoster.map((member) => ({
        memberId: member.id,
        playerId: member.player.id,
        firstName: member.player.first_name,
        lastName: member.player.last_name,
        avatarUrl: member.player.avatar_url,
        primaryPosition: member.player.primary_position,
        secondaryPosition: member.player.secondary_position,
        jerseyNumber: member.jersey_number,
        status: member.status,
        aggregates: aggregates[member.player.id],
      })),
    [filteredRoster, aggregates],
  );

  // Clear all filters
  const clearFilters = () => {
    setPositionFilter('');
    setGradYearFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  // Handle sort change
  const handleSortChange = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleSelectPlayer = (playerId: string) => {
    router.push(`/baseball/dashboard/players/${playerId}`);
  };

  // Handle export
  const handleExport = () => {
    const exportData = filteredRoster.map((member) => ({
      first_name: member.player.first_name,
      last_name: member.player.last_name,
      primary_position: member.player.primary_position,
      grad_year: member.player.grad_year,
      jersey_number: member.jersey_number,
      career_avg: aggregates[member.player.id]?.career_avg ?? null,
      career_obp: aggregates[member.player.id]?.career_obp ?? null,
      career_slg: aggregates[member.player.id]?.career_slg ?? null,
      career_ops: aggregates[member.player.id]?.career_ops ?? null,
      total_sessions: aggregates[member.player.id]?.total_sessions ?? null,
      status: member.status,
    }));
    exportRosterCSV(exportData);
  };

  // Stats summary
  const rosterStats = useMemo(() => {
    const total = roster.length;
    const active = roster.filter((m) => m.status === 'active').length;
    const positions = new Set(
      roster.map((m) => m.player.primary_position).filter(Boolean)
    ).size;
    const withStats = Object.keys(aggregates).length;

    return { total, active, positions, withStats };
  }, [roster, aggregates]);

  if (authLoading) return <PageLoading />;

  // Role-aware "back home" target for the coach-only walls below, so a player
  // who lands here by direct URL is guided back to their own home rather than a
  // coach surface (the nav no longer advertises Roster to players).
  const homeHref =
    user?.role === 'player'
      ? '/baseball/player/today'
      : '/baseball/dashboard/command-center';

  if (loadError === 'unauthorized' || (loadError === null && user?.role !== 'coach')) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <EditorsLetter
            ink="team"
            title="Roster is coach-only."
            body="The team roster workspace — lineups, player management, and exports — is available to coaches and staff. Your schedule, stats, and assignments live on your own dashboard."
            action={
              <Link href={homeHref}>
                <Button variant="primary" size="md">
                  {user?.role === 'player' ? 'Back to My Today' : 'Back to Command Center'}
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (loadError === 'roster') {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <EditorsLetter
            ink="team"
            title="We couldn't load the roster."
            body="Something went wrong fetching your team roster. Refresh the page to try again."
            action={
              <Button variant="primary" size="md" onClick={() => router.refresh()}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <RosterFairway
        teamName={selectedTeam?.name || 'Your Team'}
        activeView={activeView}
        onActiveViewChange={setActiveView}
        rosterSurface={rosterSurface}
        onRosterSurfaceChange={setRosterSurface}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        positionFilter={positionFilter}
        onPositionFilterChange={setPositionFilter}
        gradYearFilter={gradYearFilter}
        onGradYearFilterChange={setGradYearFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        members={filteredRoster}
        boardMembers={boardMembers}
        aggregates={aggregates}
        stats={rosterStats}
        loading={loading}
        aggregatesWarning={aggregatesWarning}
        onSelectPlayer={handleSelectPlayer}
        onExport={handleExport}
        lineupRoster={roster.map((m) => ({
          id: m.player.id,
          first_name: m.player.first_name,
          last_name: m.player.last_name,
          primary_position: m.player.primary_position,
          jersey_number: m.jersey_number,
          avatar_url: m.player.avatar_url,
        }))}
        onSaveLineup={async (lineup, name) => {
          if (!resolvedTeamId) {
            showToast('No team selected', 'error');
            return;
          }
          const positions = lineup
            .filter((slot) => slot.player !== null)
            .map((slot) => ({ order: slot.order, playerId: slot.player!.id }));
          if (positions.length === 0) {
            showToast('Please add at least one player to the lineup', 'error');
            return;
          }
          setSavingLineup(true);
          try {
            // saveLineup returns { success: false, error } for validation
            // failures (duplicate orders, > 9 players, missing coach) without
            // throwing, so check the result before claiming success.
            const result = await saveLineup({
              teamId: resolvedTeamId,
              name: name || 'Untitled Lineup',
              positions,
            });
            if (result.success) {
              showToast('Lineup saved successfully', 'success');
            } else {
              showToast(result.error || 'Failed to save lineup', 'error');
            }
          } catch (error) {
            showToast(
              error instanceof Error ? error.message : 'Failed to save lineup',
              'error',
            );
          } finally {
            setSavingLineup(false);
          }
        }}
        onInvite={() => setShowInviteModal(true)}
        showInviteModal={showInviteModal}
        onCloseInvite={() => setShowInviteModal(false)}
        inviteTeamId={resolvedTeamId}
        inviteTeamName={selectedTeam?.name || 'Your Team'}
        inviteCoachId={coach?.id ?? null}
      />
    </div>
  );
}

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
import { saveLineup, updateLineup } from '@/app/baseball/actions/lineups';
import {
  removePlayerFromTeam,
  assignPlayerToTeam,
  approvePendingMember,
  rejectPendingMember,
  searchAssignablePlayers,
} from '@/app/baseball/actions/roster';
import { useToast } from '@/components/ui/sonner';
import { logError } from '@/lib/error-logging';
import type { RosterBoardMember } from '@/components/baseball/roster';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { RosterReadModel } from '@/lib/baseball/read-models/roster';
import { mergeSeasonStatsIntoAggregates } from '@/lib/baseball/read-models/roster-aggregates-merge';
import { fetchRosterLegacyAggregates } from '@/lib/baseball/read-models/roster-legacy-aggregates-source';
import { fairwayScope } from '@/lib/redesign/flag';
import { RosterFairway } from './RosterFairway';
import type { LineupSlot } from '@/components/coach/lineup/LineupBuilder';

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
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [activeView, setActiveView] = useState<'roster' | 'lineup'>('roster');
  const [, setSavingLineup] = useState(false);
  const [editingLineup, setEditingLineup] = useState<{
    id: string;
    name: string;
    positions: LineupSlot[];
  } | null>(null);
  const [lineupsRefreshKey, setLineupsRefreshKey] = useState(0);
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

    // Fetch legacy-fallback aggregates for all players on this team. The
    // deprecated table read itself lives in roster-legacy-aggregates-source.ts
    // (the one shared spot the manifest allowlist tracks for both this client
    // refetch and getRoster's server read model) — this file only consumes
    // the already-fetched map and hands it to the shared adapter below (#379).
    const { aggregates: fetchedAggregates, error: aggError } =
      await fetchRosterLegacyAggregates(supabase, resolvedTeamId);

    let aggMap: Record<string, BaseballPlayerAggregates> = fetchedAggregates;
    if (aggError) {
      setAggregatesWarning(true);
    }

    // Merge box-score-canonical season stats over the legacy aggregates row —
    // mirrors getRoster's server read model so a client-side refetch (after a
    // roster mutation below) never regresses a player back to em-dash/0 stats
    // that ARE available from the box-score pipeline (#roster-stat-staleness).
    const currentSeasonYear = new Date().getFullYear();
    const { data: seasonStatsData, error: seasonStatsError } = await supabase
      .from('baseball_player_season_stats')
      .select('player_id, avg, obp, slg, ops, g, last_updated')
      .eq('team_id', resolvedTeamId)
      .eq('season_year', currentSeasonYear);

    if (!seasonStatsError && seasonStatsData) {
      aggMap = mergeSeasonStatsIntoAggregates(aggMap, seasonStatsData, resolvedTeamId);
    } else if (seasonStatsError) {
      setAggregatesWarning(true);
    }

    setAggregates(aggMap);
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

  // ── Roster mutation handlers ────────────────────────────────────────────
  // removePlayerFromTeam / assignPlayerToTeam / approvePendingMember /
  // rejectPendingMember were all fully built, capability-gated server actions
  // with NO reachable UI (#roster-actions-unwired, #pending-joiners-stuck).
  // Every handler here toasts the outcome, then calls fetchRosterWithAggregates()
  // (not router.refresh()) so the change appears immediately — router.refresh()
  // would refetch server props but NOT re-derive the `roster`/`aggregates`
  // state above, which is only ever seeded once from `initialModel` on mount.
  async function handleRemoveMember(playerId: string, playerName: string) {
    try {
      const result = await removePlayerFromTeam({ playerId });
      if (result.success) {
        showToast(`${playerName} removed from team`, 'success');
        await fetchRosterWithAggregates();
      } else {
        showToast(result.error || 'Failed to remove player', 'error');
        logError(
          new Error(result.error || 'Failed to remove player'),
          { component: 'RosterClient', action: 'handleRemoveMember', sport: 'baseball' },
          'high'
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove player';
      showToast(message, 'error');
      logError(
        error instanceof Error ? error : new Error(message),
        { component: 'RosterClient', action: 'handleRemoveMember', sport: 'baseball' },
        'high'
      );
      return { success: false, error: message };
    }
  }

  async function handleApproveMember(memberId: string) {
    try {
      const result = await approvePendingMember({ memberId });
      if (result.success) {
        showToast('Join request approved', 'success');
        await fetchRosterWithAggregates();
      } else {
        showToast(result.error || 'Failed to approve join request', 'error');
        logError(
          new Error(result.error || 'Failed to approve join request'),
          { component: 'RosterClient', action: 'handleApproveMember', sport: 'baseball' },
          'high'
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve join request';
      showToast(message, 'error');
      logError(
        error instanceof Error ? error : new Error(message),
        { component: 'RosterClient', action: 'handleApproveMember', sport: 'baseball' },
        'high'
      );
      return { success: false, error: message };
    }
  }

  async function handleRejectMember(memberId: string) {
    try {
      const result = await rejectPendingMember({ memberId });
      if (result.success) {
        showToast('Join request declined', 'success');
        await fetchRosterWithAggregates();
      } else {
        showToast(result.error || 'Failed to decline join request', 'error');
        logError(
          new Error(result.error || 'Failed to decline join request'),
          { component: 'RosterClient', action: 'handleRejectMember', sport: 'baseball' },
          'high'
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline join request';
      showToast(message, 'error');
      logError(
        error instanceof Error ? error : new Error(message),
        { component: 'RosterClient', action: 'handleRejectMember', sport: 'baseball' },
        'high'
      );
      return { success: false, error: message };
    }
  }

  async function handleAssignPlayer(input: {
    playerId: string;
    jerseyNumber: number | null;
    position: string | null;
  }) {
    try {
      const result = await assignPlayerToTeam(input);
      if (result.success) {
        showToast('Roster updated', 'success');
        await fetchRosterWithAggregates();
      } else {
        showToast(result.error || 'Failed to update player', 'error');
        logError(
          new Error(result.error || 'Failed to update player'),
          { component: 'RosterClient', action: 'handleAssignPlayer', sport: 'baseball' },
          'high'
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update player';
      showToast(message, 'error');
      logError(
        error instanceof Error ? error : new Error(message),
        { component: 'RosterClient', action: 'handleAssignPlayer', sport: 'baseball' },
        'high'
      );
      return { success: false, error: message };
    }
  }

  async function handleSearchPlayers(query: string) {
    try {
      return await searchAssignablePlayers({ query });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed. Please try again.';
      logError(
        error instanceof Error ? error : new Error(message),
        { component: 'RosterClient', action: 'handleSearchPlayers', sport: 'baseball' },
        'medium'
      );
      return {
        success: false,
        error: message,
      };
    }
  }

  // ── Saved-lineup edit session ────────────────────────────────────────────
  // getTeamLineups only returns bare {order, playerId} positions; hydrate them
  // against the roster we already have loaded so LineupBuilder can render
  // names/positions/jerseys immediately without another round trip.
  function handleEditLineup(lineup: { id: string; name: string; positions: Array<{ order: number; playerId: string }> }) {
    const byPlayerId = new Map(roster.map((m) => [m.player.id, m]));
    const positions: LineupSlot[] = lineup.positions.map((p) => {
      const member = byPlayerId.get(p.playerId);
      return {
        order: p.order,
        player: member
          ? {
              id: member.player.id,
              first_name: member.player.first_name,
              last_name: member.player.last_name,
              primary_position: member.player.primary_position,
              jersey_number: member.jersey_number,
              avatar_url: member.player.avatar_url,
            }
          : null,
      };
    });
    setEditingLineup({ id: lineup.id, name: lineup.name, positions });
  }

  function handleNewLineup() {
    setEditingLineup(null);
  }

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
            // saveLineup/updateLineup return { success: false, error } for
            // validation failures (duplicate orders, > 9 players, missing
            // coach) without throwing, so check the result before claiming
            // success. Editing a saved lineup (editingLineup set) updates it
            // in place instead of always inserting a new row.
            const result = editingLineup
              ? await updateLineup(editingLineup.id, { name: name || 'Untitled Lineup', positions })
              : await saveLineup({
                  teamId: resolvedTeamId,
                  name: name || 'Untitled Lineup',
                  positions,
                });
            if (result.success) {
              showToast(
                editingLineup ? 'Lineup updated successfully' : 'Lineup saved successfully',
                'success',
              );
              setEditingLineup(null);
              setLineupsRefreshKey((k) => k + 1);
            } else {
              showToast(result.error || 'Failed to save lineup', 'error');
              logError(
                new Error(result.error || 'Failed to save lineup'),
                { component: 'RosterClient', action: 'onSaveLineup', sport: 'baseball' },
                'high'
              );
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save lineup';
            showToast(message, 'error');
            logError(
              error instanceof Error ? error : new Error(message),
              { component: 'RosterClient', action: 'onSaveLineup', sport: 'baseball' },
              'high'
            );
          } finally {
            setSavingLineup(false);
          }
        }}
        onRemoveMember={handleRemoveMember}
        onApproveMember={handleApproveMember}
        onRejectMember={handleRejectMember}
        onAssignPlayer={handleAssignPlayer}
        onSearchPlayers={handleSearchPlayers}
        showAssignModal={showAssignModal}
        onOpenAssignModal={() => setShowAssignModal(true)}
        onCloseAssignModal={() => setShowAssignModal(false)}
        teamId={resolvedTeamId}
        editingLineup={editingLineup}
        onEditLineup={handleEditLineup}
        onNewLineup={handleNewLineup}
        lineupsRefreshKey={lineupsRefreshKey}
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

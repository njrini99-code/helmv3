'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonTable } from '@/components/ui/skeleton';
import {
  IconUsers,
  IconSearch,
  IconFilter,
  IconLink,
  IconClipboardList,
  IconX,
  IconChevronDown,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';
import { InviteModal } from '@/components/coach/InviteModal';
import { LineupBuilder } from '@/components/coach/lineup/LineupBuilder';
import { saveLineup } from '@/app/baseball/actions/lineups';
import { useToast } from '@/components/ui/sonner';
import {
  PlayerRow,
  PlayerCard,
  PositionBoard,
  StatusBoard,
  DevelopmentBoard,
  RosterToolbar,
  exportRosterCSV,
  type RosterBoardMember,
  type SortField,
  type SortDirection,
  type ViewMode,
} from '@/components/baseball/roster';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { RosterReadModel } from '@/lib/baseball/read-models/roster';

type MemberStatus = 'pending' | 'active' | 'inactive' | 'removed' | 'injured' | 'alumni';
type RosterSurface = 'cards' | 'position' | 'status' | 'development';

export interface RosterClientProps {
  teamId: string | null;
  initialModel?: Pick<
    RosterReadModel,
    'authorized' | 'members' | 'aggregates' | 'rosterError' | 'aggregatesError'
  >;
}

interface PlayerData {
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

interface TeamMember {
  id: string;
  player: PlayerData;
  jersey_number: number | null;
  joined_at: string | null;
  status: MemberStatus | null;
}

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'LHP', 'RHP', 'UTL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

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
  const [showFilters, setShowFilters] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [gradYearFilter, setGradYearFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Sort and View
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('expanded');
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
  }, [selectedTeamId, authLoading, coach?.organization_id]);

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
        case 'exit_velo': {
          const veloA = aggA?.avg_exit_velocity ?? -1;
          const veloB = aggB?.avg_exit_velocity ?? -1;
          comparison = veloB - veloA; // Higher is better
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

  // Handle view mode change
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
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
      avg_exit_velocity: aggregates[member.player.id]?.avg_exit_velocity ?? null,
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

  if (loadError === 'unauthorized') {
    return (
      <div className="p-8">
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <p className="text-warm-500">You do not have permission to view this team roster.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError === 'roster') {
    return (
      <div className="p-8">
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <p className="text-warm-500">We could not load the roster. Try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <p className="text-warm-500">Only coaches can access roster management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        {aggregatesWarning ? (
          <Card variant="glass" className="mb-4 border-amber-200/60">
            <CardContent className="p-4 text-sm text-warm-600">
              Player trend stats are temporarily unavailable. Roster data is still shown.
            </CardContent>
          </Card>
        ) : null}
        {/* View Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <Button variant="primary"
            onClick={() => setActiveView('roster')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'roster'
                ? 'bg-primary-50 text-primary-700'
                : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconUsers size={18} />
              <span>Roster</span>
            </div>
          </Button>
          <Button variant="primary"
            onClick={() => setActiveView('lineup')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'lineup'
                ? 'bg-primary-50 text-primary-700'
                : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconClipboardList size={18} />
              <span>Lineup Builder</span>
            </div>
          </Button>
        </div>

        {/* Roster View */}
        {activeView === 'roster' && (
          <>
            {/* Roster Stats Summary */}
            {!loading && roster.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="glass-standard rounded-xl p-4">
                  <p className="text-xs text-warm-500 font-medium uppercase tracking-wide">
                    Total Players
                  </p>
                  <p className="text-2xl font-semibold text-warm-900 mt-1 tabular-nums">
                    {rosterStats.total}
                  </p>
                </div>
                <div className="glass-standard rounded-xl p-4">
                  <p className="text-xs text-warm-500 font-medium uppercase tracking-wide">
                    Active
                  </p>
                  <p className="text-2xl font-semibold text-primary-600 mt-1 tabular-nums">
                    {rosterStats.active}
                  </p>
                </div>
                <div className="glass-standard rounded-xl p-4">
                  <p className="text-xs text-warm-500 font-medium uppercase tracking-wide">
                    Positions
                  </p>
                  <p className="text-2xl font-semibold text-warm-900 mt-1 tabular-nums">
                    {rosterStats.positions}
                  </p>
                </div>
                <div className="glass-standard rounded-xl p-4">
                  <p className="text-xs text-warm-500 font-medium uppercase tracking-wide">
                    With Stats
                  </p>
                  <p className="text-2xl font-semibold text-warm-900 mt-1 tabular-nums">
                    {rosterStats.withStats}
                  </p>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <Card variant="glass" className="mb-6">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4">
                  {/* Search Row */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <IconSearch
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400"
                      />
                      <Input
                        type="text"
                        placeholder="Search by name, position, grad year, or jersey #..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button
                      variant={showFilters || activeFilterCount > 0 ? 'primary' : 'secondary'}
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <IconFilter size={16} className="mr-2" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                          {activeFilterCount}
                        </span>
                      )}
                      <IconChevronDown
                        size={14}
                        className={`ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                      />
                    </Button>
                  </div>

                  {/* Filter Row */}
                  {showFilters && (
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-warm-200">
                      {/* Position Filter */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor="roster-position-filter" className="text-xs font-medium text-warm-500">Position</label>
                        <select
                          id="roster-position-filter"
                          value={positionFilter}
                          onChange={(e) => setPositionFilter(e.target.value)}
                          className="px-3 py-2 bg-white border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">All Positions</option>
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Grad Year Filter */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor="roster-gradyear-filter" className="text-xs font-medium text-warm-500">Grad Year</label>
                        <select
                          id="roster-gradyear-filter"
                          value={gradYearFilter}
                          onChange={(e) => setGradYearFilter(e.target.value)}
                          className="px-3 py-2 bg-white border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">All Years</option>
                          {GRAD_YEARS.map((year) => (
                            <option key={year} value={year.toString()}>
                              Class of {year}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor="roster-status-filter" className="text-xs font-medium text-warm-500">Status</label>
                        <select
                          id="roster-status-filter"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="px-3 py-2 bg-white border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">All Status</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="injured">Injured</option>
                          <option value="alumni">Alumni</option>
                          <option value="pending">Pending</option>
                        </select>
                      </div>

                      {/* Clear Filters */}
                      {activeFilterCount > 0 && (
                        <Button variant="ghost"
                          onClick={clearFilters}
                          className="flex items-center gap-1 px-3 py-2 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded-lg transition-colors mt-auto"
                        >
                          <IconX size={14} />
                          Clear filters
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Roster Toolbar - Sort & View Controls */}
            {!loading && roster.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="flex w-full gap-2 overflow-x-auto rounded-2xl border border-warm-200 bg-cream-100/80 p-1 shadow-sm">
                  {[
                    { id: 'cards' as const, label: 'Cards' },
                    { id: 'position' as const, label: 'Position Board' },
                    { id: 'status' as const, label: 'Status Board' },
                    { id: 'development' as const, label: 'Development Board' },
                  ].map((surface) => (
                    <Button
                      key={surface.id}
                      variant={rosterSurface === surface.id ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setRosterSurface(surface.id)}
                      className="min-h-[40px] flex-shrink-0 rounded-xl px-3"
                    >
                      {surface.label}
                    </Button>
                  ))}
                </div>
                <RosterToolbar
                  playerCount={filteredRoster.length}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  viewMode={viewMode}
                  onSortChange={handleSortChange}
                  onViewModeChange={handleViewModeChange}
                  onExport={handleExport}
                />
              </div>
            )}

            {/* Roster Table */}
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-warm-900">Team Roster</h2>
                    <p className="text-sm leading-relaxed text-warm-500 mt-1">
                      {filteredRoster.length} {filteredRoster.length === 1 ? 'player' : 'players'}
                      {(searchQuery || activeFilterCount > 0) && roster.length !== filteredRoster.length && (
                        <span className="text-warm-400"> of {roster.length}</span>
                      )}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <>
                    {/* Mobile loading skeleton */}
                    <div className="lg:hidden grid grid-cols-1 gap-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-xl border border-warm-200 p-4 animate-pulse"
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-warm-200" />
                            <div className="flex-1">
                              <div className="h-4 bg-warm-200 rounded w-2/3 mb-2" />
                              <div className="h-3 bg-warm-200 rounded w-1/3" />
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {Array.from({ length: 4 }).map((_, j) => (
                              <div key={j} className="h-16 bg-warm-100 rounded-lg" />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <div className="h-11 bg-warm-200 rounded-lg flex-1" />
                            <div className="h-11 bg-warm-200 rounded-lg flex-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop loading skeleton */}
                    <div className="hidden lg:block">
                      <SkeletonTable rows={5} columns={9} />
                    </div>
                  </>
                ) : roster.length === 0 ? (
                  /* Empty State */
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                      <IconUsers size={32} className="text-warm-400" />
                    </div>
                    <h3 className="text-lg font-medium text-warm-900 mb-2">Build your roster</h3>
                    <p className="text-sm leading-relaxed text-warm-500 mb-6 max-w-md mx-auto">
                      Invite players to join your team by generating a team invite link. Players
                      can use this link to join and complete their profiles.
                    </p>
                    <Button onClick={() => setShowInviteModal(true)}>
                      <IconLink size={16} className="mr-2" />
                      Generate Invite Link
                    </Button>
                  </div>
                ) : filteredRoster.length === 0 ? (
                  /* No Results */
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                      <IconSearch size={32} className="text-warm-400" />
                    </div>
                    <h3 className="text-lg font-medium text-warm-900 mb-2">No players found</h3>
                    <p className="text-sm leading-relaxed text-warm-500 mb-6 max-w-md mx-auto">
                      Try adjusting your search or filters to find what you&apos;re looking for.
                    </p>
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  </div>
                ) : (
                  <>
                    {rosterSurface === 'position' && (
                      <PositionBoard members={boardMembers} onSelect={handleSelectPlayer} />
                    )}

                    {rosterSurface === 'status' && (
                      <StatusBoard members={boardMembers} onSelect={handleSelectPlayer} />
                    )}

                    {rosterSurface === 'development' && (
                      <DevelopmentBoard members={boardMembers} onSelect={handleSelectPlayer} />
                    )}

                    {rosterSurface === 'cards' && (
                      <>
                        {/* Mobile card view */}
                        <div className="lg:hidden grid grid-cols-1 gap-4">
                          {filteredRoster.map((member) => (
                            <PlayerCard
                              key={member.id}
                              player={member.player}
                              jerseyNumber={member.jersey_number}
                              status={member.status}
                              aggregates={aggregates[member.player.id]}
                            />
                          ))}
                        </div>

                        {/* Desktop table view */}
                        <div className="hidden lg:block overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-warm-200">
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  Player
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  Position
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  Class
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  AVG
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  OBP
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  SLG
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  OPS
                                </th>
                                {viewMode === 'expanded' && (
                                  <>
                                    <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                      Last 5
                                    </th>
                                    <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                      Exit Velo
                                    </th>
                                    <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                      Sessions
                                    </th>
                                  </>
                                )}
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  Status
                                </th>
                                <th className="text-left py-3 px-4 text-label font-medium uppercase tracking-wider text-warm-400">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-warm-200">
                              {filteredRoster.map((member) => (
                                <PlayerRow
                                  key={member.id}
                                  memberId={member.id}
                                  player={member.player}
                                  jerseyNumber={member.jersey_number}
                                  status={member.status}
                                  aggregates={aggregates[member.player.id]}
                                  compact={viewMode === 'compact'}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Team Invite Instructions - Only show when there's no roster */}
            {roster.length === 0 && (
              <Card variant="glass" className="mt-6">
                <CardHeader>
                  <h2 className="font-semibold text-warm-900">How to add players</h2>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm text-warm-600">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                        1
                      </span>
                      <div>
                        <span className="font-medium text-warm-900">Generate an invite link</span>
                        <p className="text-warm-500 mt-1">
                          Create a unique link that players can use to join your team.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                        2
                      </span>
                      <div>
                        <span className="font-medium text-warm-900">Share with your players</span>
                        <p className="text-warm-500 mt-1">
                          Send the link via email, text, or team messaging platform.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                        3
                      </span>
                      <div>
                        <span className="font-medium text-warm-900">
                          Players join automatically
                        </span>
                        <p className="text-warm-500 mt-1">
                          When players sign up using your link, they&apos;ll be added to your roster.
                        </p>
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
              if (!resolvedTeamId) {
                showToast('No team selected', 'error');
                return;
              }

              // Filter out empty slots and map to the format expected by saveLineup
              const positions = lineup
                .filter((slot) => slot.player !== null)
                .map((slot) => ({
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
                  teamId: resolvedTeamId,
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
      {showInviteModal && resolvedTeamId && coach?.id && (
        <InviteModal
          teamId={resolvedTeamId}
          teamName={selectedTeam?.name || 'Your Team'}
          coachId={coach.id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </>
  );
}

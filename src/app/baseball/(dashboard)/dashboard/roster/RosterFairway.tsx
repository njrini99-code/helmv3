'use client';

/**
 * ============================================================================
 * RosterFairway — Fairway (warm-premium) presentation of the coach Roster.
 * Phase B leaf migration, Wave 1 · roster frame (PR of 2). Flag-gated behind
 * `isRedesignEnabled()` — see `./RosterClient` for the fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME already-computed state, filtered/sorted
 * data, and handlers that `RosterClient` owns (search/filter/sort state, the
 * `filteredRoster`/`boardMembers`/`rosterStats` memos, and every callback). No
 * data path, action, read-model, or query is touched here.
 *
 * This PR migrates the CHROME (header, KPI scoreboard, search, filters, surface
 * tabs, sort/export toolbar, view toggle) to Fairway primitives and renders the
 * existing content components inside the new frame (cards → `PlayerCard`;
 * position/status/development → the three boards; lineup → `LineupBuilder`) per
 * the migration playbook §3.5 (unmigrated content renders correctly inside the
 * new frame). A follow-up PR migrates the cards table + boards to native
 * Fairway surfaces and re-introduces the compact/expanded density toggle.
 * ========================================================================== */

import * as React from 'react';
import { ArrowDown, ArrowUp, Download, UserPlus } from 'lucide-react';
import {
  ViewHeader,
  MetricCard,
  Surface,
  Segmented,
  Select,
  SearchField,
  Button,
  EmptyState,
  InlineNotice,
  SkeletonCard,
} from '@/components/fairway';
import {
  PlayerCard,
  PositionBoard,
  StatusBoard,
  DevelopmentBoard,
  type RosterBoardMember,
  type SortField,
  type SortDirection,
} from '@/components/baseball/roster';
import { LineupBuilder } from '@/components/coach/lineup/LineupBuilder';
import { InviteModal } from '@/components/coach/InviteModal';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { TeamMember, RosterSurface } from './RosterClient';

// LineupBuilder / InviteModal own their prop types; borrow them so we never
// depend on non-exported internals and stay in lockstep with those components.
type LineupProps = React.ComponentProps<typeof LineupBuilder>;

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'LHP', 'RHP', 'UTL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'injured', label: 'Injured' },
  { value: 'pending', label: 'Awaiting join' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'alumni', label: 'Alumni' },
];

const SURFACE_OPTIONS: { value: RosterSurface; label: string }[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'position', label: 'By position' },
  { value: 'status', label: 'By status' },
  { value: 'development', label: 'Development' },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'position', label: 'Position' },
  { value: 'avg', label: 'AVG' },
  { value: 'obp', label: 'OBP' },
  { value: 'slg', label: 'SLG' },
  { value: 'ops', label: 'OPS' },
  { value: 'exit_velo', label: 'Exit velo' },
  { value: 'sessions', label: 'Sessions' },
];

const VIEW_OPTIONS: { value: 'roster' | 'lineup'; label: string }[] = [
  { value: 'roster', label: 'Roster' },
  { value: 'lineup', label: 'Lineup' },
];

const ALL = 'all';

export interface RosterFairwayProps {
  teamName: string;
  // top-level view
  activeView: 'roster' | 'lineup';
  onActiveViewChange: (v: 'roster' | 'lineup') => void;
  rosterSurface: RosterSurface;
  onRosterSurfaceChange: (s: RosterSurface) => void;
  // search + filters
  searchQuery: string;
  onSearchChange: (q: string) => void;
  positionFilter: string;
  onPositionFilterChange: (v: string) => void;
  gradYearFilter: string;
  onGradYearFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  // sort
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  // data (already filtered + sorted upstream)
  members: TeamMember[];
  boardMembers: RosterBoardMember[];
  aggregates: Record<string, BaseballPlayerAggregates>;
  stats: { total: number; active: number; positions: number; withStats: number };
  loading: boolean;
  aggregatesWarning: boolean;
  // handlers
  onSelectPlayer: (playerId: string) => void;
  onExport: () => void;
  // lineup (types borrowed from LineupBuilder)
  lineupRoster: LineupProps['roster'];
  onSaveLineup: LineupProps['onSave'];
  // invite modal
  onInvite: () => void;
  showInviteModal: boolean;
  onCloseInvite: () => void;
  inviteTeamId: string | null;
  inviteTeamName: string;
  inviteCoachId: string | null;
}

/** Read a Select's value, mapping the `all` sentinel back to the empty filter. */
function fromSentinel(v: string | null): string {
  const s = v ?? ALL;
  return s === ALL ? '' : s;
}

export function RosterFairway(props: RosterFairwayProps) {
  const {
    teamName,
    activeView,
    onActiveViewChange,
    rosterSurface,
    onRosterSurfaceChange,
    searchQuery,
    onSearchChange,
    positionFilter,
    onPositionFilterChange,
    gradYearFilter,
    onGradYearFilterChange,
    statusFilter,
    onStatusFilterChange,
    activeFilterCount,
    onClearFilters,
    sortField,
    sortDirection,
    onSortChange,
    members,
    boardMembers,
    aggregates,
    stats,
    loading,
    aggregatesWarning,
    onSelectPlayer,
    onExport,
    lineupRoster,
    onSaveLineup,
    onInvite,
    showInviteModal,
    onCloseInvite,
    inviteTeamId,
    inviteTeamName,
    inviteCoachId,
  } = props;

  const isEmpty = !loading && members.length === 0;
  const isFiltered = activeFilterCount > 0 || searchQuery.trim().length > 0;
  const showClear = isFiltered;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <ViewHeader
        eyebrow={teamName}
        title="Roster"
        description={`${stats.total} ${stats.total === 1 ? 'player' : 'players'}${
          stats.active !== stats.total ? ` · ${stats.active} active` : ''
        }`}
        primaryAction={
          <Button variant="primary" size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>
            Invite players
          </Button>
        }
      />

      <div className="mt-6">
        <Segmented<'roster' | 'lineup'>
          size="sm"
          aria-label="Roster or lineup"
          value={activeView}
          onValueChange={onActiveViewChange}
          options={VIEW_OPTIONS}
        />
      </div>

      {aggregatesWarning && (
        <InlineNotice
          tone="warning"
          title="Stats temporarily unavailable"
          className="mt-4"
        >
          Player bios loaded, but career stats could not be fetched. Filters and
          sorting on stat fields may be incomplete.
        </InlineNotice>
      )}

      {activeView === 'lineup' ? (
        <div className="mt-6">
          <LineupBuilder roster={lineupRoster} onSave={onSaveLineup} />
        </div>
      ) : (
        <>
          {/* KPI scoreboard */}
          <section
            className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4"
            aria-label="Roster summary"
          >
            <MetricCard label="Players" value={stats.total} footnote="on roster" />
            <MetricCard label="Active" value={stats.active} footnote="available" />
            <MetricCard label="Positions" value={stats.positions} footnote="represented" />
            <MetricCard
              label="With stats"
              value={stats.withStats}
              footnote={`of ${stats.total}`}
            />
          </section>

          {/* Search + filters */}
          <Surface elevation="border" padding="md" className="mt-6">
            <div className="flex flex-col gap-3">
              <div className="max-w-md">
                <SearchField
                  size="sm"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onClear={() => onSearchChange('')}
                  placeholder="Search by name, position, jersey #"
                  aria-label="Search roster"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-40">
                  <Select
                    size="sm"
                    aria-label="Filter by position"
                    value={positionFilter || ALL}
                    onValueChange={(v) => onPositionFilterChange(fromSentinel(v))}
                    options={[
                      { value: ALL, label: 'All positions' },
                      ...POSITIONS.map((p) => ({ value: p, label: p })),
                    ]}
                  />
                </div>
                <div className="w-36">
                  <Select
                    size="sm"
                    aria-label="Filter by grad year"
                    value={gradYearFilter || ALL}
                    onValueChange={(v) => onGradYearFilterChange(fromSentinel(v))}
                    options={[
                      { value: ALL, label: 'All grad years' },
                      ...GRAD_YEARS.map((y) => ({ value: String(y), label: String(y) })),
                    ]}
                  />
                </div>
                <div className="w-40">
                  <Select
                    size="sm"
                    aria-label="Filter by status"
                    value={statusFilter || ALL}
                    onValueChange={(v) => onStatusFilterChange(fromSentinel(v))}
                    options={[{ value: ALL, label: 'All statuses' }, ...STATUS_OPTIONS]}
                  />
                </div>
                {showClear && (
                  <Button variant="ghost" size="sm" onClick={onClearFilters}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </Surface>

          {/* Surface tabs + sort / export toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Segmented<RosterSurface>
                size="sm"
                aria-label="Roster view"
                value={rosterSurface}
                onValueChange={onRosterSurfaceChange}
                options={SURFACE_OPTIONS}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <Select
                  size="sm"
                  aria-label="Sort players by"
                  value={sortField}
                  onValueChange={(v) => onSortChange((v as SortField) ?? 'name', sortDirection)}
                  options={SORT_OPTIONS}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
                onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
                leftIcon={
                  sortDirection === 'asc' ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )
                }
              >
                {sortDirection === 'asc' ? 'Asc' : 'Desc'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={onExport}
              >
                Export
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="mt-4">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : isEmpty ? (
              <EmptyState
                title={isFiltered ? 'No players match your filters' : 'No players yet'}
                description={
                  isFiltered
                    ? `No players on ${teamName} match the current search and filters.`
                    : `Build your roster on ${teamName} by inviting players to join.`
                }
                action={
                  isFiltered ? (
                    <Button variant="secondary" size="sm" onClick={onClearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<UserPlus className="h-4 w-4" />}
                      onClick={onInvite}
                    >
                      Invite players
                    </Button>
                  )
                }
              />
            ) : rosterSurface === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <PlayerCard
                    key={member.id}
                    player={member.player}
                    jerseyNumber={member.jersey_number}
                    status={member.status}
                    aggregates={aggregates[member.player.id]}
                  />
                ))}
              </div>
            ) : rosterSurface === 'position' ? (
              <PositionBoard members={boardMembers} onSelect={onSelectPlayer} />
            ) : rosterSurface === 'status' ? (
              <StatusBoard members={boardMembers} onSelect={onSelectPlayer} />
            ) : (
              <DevelopmentBoard members={boardMembers} onSelect={onSelectPlayer} />
            )}
          </div>
        </>
      )}

      {showInviteModal && inviteTeamId && inviteCoachId && (
        <InviteModal
          teamId={inviteTeamId}
          teamName={inviteTeamName}
          coachId={inviteCoachId}
          onClose={onCloseInvite}
        />
      )}
    </div>
  );
}

export default RosterFairway;

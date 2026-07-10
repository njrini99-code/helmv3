'use client';

/**
 * ============================================================================
 * RosterFairway — the coach Roster, composed from "The Living Annual" kit
 * (spec: docs/baseball/design-system-living-annual.md; plan:
 * docs/baseball/ui-migration-execution-plan.md §3.1 "roster").
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME already-computed state, filtered/sorted
 * data, and handlers `RosterClient` owns (search/filter/sort state, the
 * `filteredRoster`/`boardMembers`/`rosterStats` memos, and every callback). No
 * data path, action, read-model, or query is touched here.
 *
 * Chrome is a `SectionMasthead` + `KPIContentsStrip` "table of contents" +
 * search/filter row. Search/filter/sort/tab CONTROLS stay Fairway primitives
 * (`Segmented`/`Select`/`SearchField`) — the Living Annual kit ships editorial
 * surfaces, not form controls. Every player row — the flat roster wall (the
 * `cards` surface) and the three triage boards (position/status/development)
 * — is a `<PlayerRowPlate>`, so the surface never re-implements a row or
 * invents a bespoke card; columns group into `<PaperCard>`s, the kit's only
 * card. Degraded stats and every empty state render an `<EditorsLetter>` /
 * `<EmptyIssue>` — never a yellow/amber box, never a fabricated zero.
 * ========================================================================== */

import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, UserPlus } from 'lucide-react';
import { Button as PlainButton } from '@/components/ui/button';
import { Segmented, Select, SearchField, Button, SkeletonCard } from '@/components/fairway';
import {
  SectionMasthead,
  KPIContentsStrip,
  PlayerRowPlate,
  PlayerRowPlateHeader,
  EditorsLetter,
  EmptyIssue,
  PaperCard,
  HairlineRule,
  Eyebrow,
  InkBadge,
  Reveal,
  formatRate,
  type PlayerRowStat,
} from '@/components/baseball/living-annual';
import { getFreshness, positionGroupOf } from '@/components/baseball/roster/roster-triage';
import { LineupBuilder } from '@/components/coach/lineup/LineupBuilder';
import { InviteModal } from '@/components/coach/InviteModal';
import type { BaseballPlayerAggregates } from '@/lib/types';
import type { RosterBoardMember } from '@/components/baseball/roster';
import type { AssignablePlayerResult } from '@/app/baseball/actions/roster';
import {
  RosterRowMenu,
  PendingMemberActions,
  AssignPlayerModal,
  type RosterActionOutcome,
} from './RosterMemberActions';
import { SavedLineupsPanel, type SavedLineupSlot } from './SavedLineupsPanel';
import type { TeamMember, RosterSurface, SortField, SortDirection } from './RosterClient';

// LineupBuilder / InviteModal own their prop types; borrow them so we never
// depend on non-exported internals and stay in lockstep with those components.
type LineupProps = ComponentProps<typeof LineupBuilder>;

const EM_DASH = '—';

export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'LHP', 'RHP', 'UTL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'injured', label: 'Injured' },
  { value: 'pending', label: 'Awaiting join' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'alumni', label: 'Alumni' },
];

const SURFACE_OPTIONS: { value: RosterSurface; label: string }[] = [
  { value: 'cards', label: 'Roster' },
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
  { value: 'sessions', label: 'Sessions' },
];

const VIEW_OPTIONS: { value: 'roster' | 'lineup'; label: string }[] = [
  { value: 'roster', label: 'Roster' },
  { value: 'lineup', label: 'Lineup' },
];

const ALL = 'all';

// ── Record-book roster wall (the `cards` surface) ───────────────────────────

// EXIT V intentionally omitted — the aggregates table carries no exit-velocity
// column in the live schema and nothing writes one (Ruling 4). Honest UI over
// a dead column: don't render a stat that can never populate.
const WALL_COLUMNS = ['AVG', 'OBP', 'SLG', 'OPS', 'SESS'];

function buildWallStats(agg: BaseballPlayerAggregates | undefined, leader: boolean): PlayerRowStat[] {
  if (!agg) {
    return [
      { value: EM_DASH },
      { value: EM_DASH },
      { value: EM_DASH },
      { value: EM_DASH },
      { value: 0 },
    ];
  }
  return [
    { value: agg.career_avg == null ? EM_DASH : formatRate(agg.career_avg, 3) },
    { value: agg.career_obp == null ? EM_DASH : formatRate(agg.career_obp, 3) },
    { value: agg.career_slg == null ? EM_DASH : formatRate(agg.career_slg, 3) },
    { value: agg.career_ops == null ? EM_DASH : formatRate(agg.career_ops, 3), leader },
    { value: agg.total_sessions },
  ];
}

function RosterWall({
  members,
  aggregates,
  onSelect,
  onAssignPlayer,
  onRemoveMember,
}: {
  members: TeamMember[];
  aggregates: Record<string, BaseballPlayerAggregates>;
  onSelect: (playerId: string) => void;
  onAssignPlayer: (input: {
    playerId: string;
    jerseyNumber: number | null;
    position: string | null;
  }) => Promise<RosterActionOutcome>;
  onRemoveMember: (playerId: string, playerName: string) => Promise<RosterActionOutcome>;
}) {
  // The team's OPS leader (min two qualifiers so a lone data point is never
  // crowned) — renders in lane green, the same "leads the column" treatment
  // the Stats Center record book uses.
  const opsLeaderId = useMemo(() => {
    const qualifiers = members
      .map((m) => ({ id: m.player.id, ops: aggregates[m.player.id]?.career_ops }))
      .filter((r): r is { id: string; ops: number } => r.ops != null);
    if (qualifiers.length < 2) return null;
    return qualifiers.reduce((best, r) => (r.ops > best.ops ? r : best)).id;
  }, [members, aggregates]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <PlayerRowPlateHeader columns={WALL_COLUMNS} />
        <div className="flex flex-col">
          {members.map((member, i) => {
            const playerName = `${member.player.first_name ?? ''} ${member.player.last_name ?? ''}`.trim() || 'this player';
            return (
              <Reveal key={member.id} staggerIndex={Math.min(i, 10)}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <PlayerRowPlate
                      firstName={member.player.first_name ?? ''}
                      lastName={member.player.last_name ?? ''}
                      jerseyNumber={member.jersey_number ?? undefined}
                      position={member.player.primary_position ?? undefined}
                      stats={buildWallStats(aggregates[member.player.id], member.player.id === opsLeaderId)}
                      onClick={() => onSelect(member.player.id)}
                    />
                  </div>
                  <RosterRowMenu
                    playerId={member.player.id}
                    playerName={playerName}
                    jerseyNumber={member.jersey_number}
                    position={member.player.primary_position}
                    onAssign={onAssignPlayer}
                    onRemove={onRemoveMember}
                  />
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Triage boards (position / status / development) ─────────────────────────

const POSITION_BOARD_COLUMNS: { key: string; label: string }[] = [
  { key: 'pitchers', label: 'Pitchers' },
  { key: 'catchers', label: 'Catchers' },
  { key: 'infield', label: 'Infield' },
  { key: 'outfield', label: 'Outfield' },
  { key: 'unassigned', label: 'Unassigned' },
];

const STATUS_BOARD_COLUMNS: { key: string; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'injured', label: 'Injured / Limited' },
  { key: 'pending', label: 'Awaiting Join' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'alumni', label: 'Alumni' },
];

const DEV_BOARD_COLUMNS: { key: string; label: string }[] = [
  { key: 'improving', label: 'Improving' },
  { key: 'stable', label: 'Holding Steady' },
  { key: 'declining', label: 'Needs Focus' },
  { key: 'no-data', label: 'Needs Data' },
];

function groupByPosition(members: RosterBoardMember[]): Record<string, RosterBoardMember[]> {
  const groups: Record<string, RosterBoardMember[]> = {};
  for (const c of POSITION_BOARD_COLUMNS) groups[c.key] = [];
  for (const m of members) {
    const grp = positionGroupOf(m.primaryPosition);
    groups[grp ?? 'unassigned']!.push(m);
  }
  return groups;
}

function groupByStatus(members: RosterBoardMember[]): Record<string, RosterBoardMember[]> {
  const known = new Set(STATUS_BOARD_COLUMNS.map((c) => c.key));
  const groups: Record<string, RosterBoardMember[]> = {};
  for (const c of STATUS_BOARD_COLUMNS) groups[c.key] = [];
  for (const m of members) {
    const key = m.status && known.has(m.status) ? m.status : 'inactive';
    groups[key]!.push(m);
  }
  return groups;
}

function groupByDevelopment(members: RosterBoardMember[]): Record<string, RosterBoardMember[]> {
  const groups: Record<string, RosterBoardMember[]> = {};
  for (const c of DEV_BOARD_COLUMNS) groups[c.key] = [];
  for (const m of members) {
    const hasData = (m.aggregates?.total_sessions ?? 0) > 0;
    // A player with no captured sessions genuinely has "Needs Data" — but a
    // player WITH real (box-score-canonical) sessions and no computed trend
    // signal is not "needs data", they're just untrended. Bucketing them into
    // "no-data" was dumping every box-score-tracked player there regardless
    // of how much real performance data existed (#roster-stat-staleness).
    // "Holding Steady" is the honest default absent a trend signal.
    if (!hasData) {
      groups['no-data']!.push(m);
      continue;
    }
    const trend = m.aggregates?.recent_trend ?? null;
    const key = trend && groups[trend] ? trend : 'stable';
    groups[key]!.push(m);
  }
  return groups;
}

/** A triage row's two-figure read: production (OPS) + last-touch freshness. */
function boardRowStats(member: RosterBoardMember): PlayerRowStat[] {
  const agg = member.aggregates;
  const fresh = getFreshness(agg);
  return [
    { value: agg?.career_ops == null ? EM_DASH : formatRate(agg.career_ops, 3) },
    { value: fresh.label, leader: fresh.level === 'fresh' },
  ];
}

function TriageColumn({
  label,
  members,
  onSelect,
  renderTrailing,
}: {
  label: string;
  members: RosterBoardMember[];
  onSelect: (playerId: string) => void;
  /** Optional per-row trailing content (e.g. the pending column's Approve/Decline). */
  renderTrailing?: (member: RosterBoardMember) => ReactNode;
}) {
  return (
    <PaperCard className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Eyebrow ink="team">{label}</Eyebrow>
        <InkBadge label={String(members.length)} tone="neutral" />
      </div>
      <HairlineRule ink="hairline" className="mb-2" />
      {members.length === 0 ? (
        <p className="py-6 text-center font-annual text-body-sm text-text-tertiary">No players</p>
      ) : (
        <div className="flex flex-col">
          {members.map((m, i) => (
            <Reveal key={m.memberId} staggerIndex={Math.min(i, 10)}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PlayerRowPlate
                    firstName={m.firstName ?? ''}
                    lastName={m.lastName ?? ''}
                    jerseyNumber={m.jerseyNumber ?? undefined}
                    position={m.primaryPosition ?? undefined}
                    stats={boardRowStats(m)}
                    onClick={() => onSelect(m.playerId)}
                  />
                </div>
                {renderTrailing ? renderTrailing(m) : null}
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </PaperCard>
  );
}

function TriageBoard({
  columns,
  groups,
  onSelect,
  renderTrailing,
}: {
  columns: { key: string; label: string }[];
  groups: Record<string, RosterBoardMember[]>;
  onSelect: (playerId: string) => void;
  renderTrailing?: (columnKey: string, member: RosterBoardMember) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {columns.map((c) => (
        <TriageColumn
          key={c.key}
          label={c.label}
          members={groups[c.key] ?? []}
          onSelect={onSelect}
          renderTrailing={renderTrailing ? (m) => renderTrailing(c.key, m) : undefined}
        />
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

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
  // roster mutations (removePlayerFromTeam / assignPlayerToTeam / pending approve-reject)
  onRemoveMember: (playerId: string, playerName: string) => Promise<RosterActionOutcome>;
  onApproveMember: (memberId: string) => Promise<RosterActionOutcome>;
  onRejectMember: (memberId: string) => Promise<RosterActionOutcome>;
  onAssignPlayer: (input: {
    playerId: string;
    jerseyNumber: number | null;
    position: string | null;
  }) => Promise<RosterActionOutcome>;
  onSearchPlayers: (query: string) => Promise<{ success: boolean; data?: AssignablePlayerResult[]; error?: string }>;
  showAssignModal: boolean;
  onOpenAssignModal: () => void;
  onCloseAssignModal: () => void;
  // lineup (types borrowed from LineupBuilder)
  teamId: string | null;
  lineupRoster: LineupProps['roster'];
  onSaveLineup: LineupProps['onSave'];
  editingLineup: { id: string; name: string; positions: LineupProps['initialLineup'] } | null;
  // Matches SavedLineupsPanel's onEdit — bare {order, playerId} rows (what
  // getTeamLineups returns); RosterClient hydrates these into full LineupSlot
  // objects (with player details) before storing them as `editingLineup`.
  onEditLineup: (lineup: { id: string; name: string; positions: SavedLineupSlot[] }) => void;
  onNewLineup: () => void;
  lineupsRefreshKey: number;
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
    onRemoveMember,
    onApproveMember,
    onRejectMember,
    onAssignPlayer,
    onSearchPlayers,
    showAssignModal,
    onOpenAssignModal,
    onCloseAssignModal,
    teamId,
    lineupRoster,
    onSaveLineup,
    editingLineup,
    onEditLineup,
    onNewLineup,
    lineupsRefreshKey,
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

  const positionGroups = useMemo(() => groupByPosition(boardMembers), [boardMembers]);
  const statusGroups = useMemo(() => groupByStatus(boardMembers), [boardMembers]);
  const developmentGroups = useMemo(() => groupByDevelopment(boardMembers), [boardMembers]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow={teamName}
        title="Roster"
        ink="team"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenAssignModal}>
              Add existing player
            </Button>
            <Button variant="primary" size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>
              Invite players
            </Button>
          </div>
        }
      >
        <div className="mt-1">
          <Segmented<'roster' | 'lineup'>
            size="sm"
            aria-label="Roster or lineup"
            value={activeView}
            onValueChange={onActiveViewChange}
            options={VIEW_OPTIONS}
          />
        </div>
      </SectionMasthead>

      {aggregatesWarning && (
        <EditorsLetter
          ink="team"
          title="Signals are catching up."
          body="Player bios loaded, but career stats couldn't be fetched — names, positions, and status still search and sort correctly."
          className="mt-4"
        />
      )}

      {activeView === 'lineup' ? (
        <div className="mt-6 space-y-6">
          <SavedLineupsPanel
            teamId={teamId}
            refreshKey={lineupsRefreshKey}
            editingLineupId={editingLineup?.id ?? null}
            onEdit={onEditLineup}
          />
          {editingLineup && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3">
              <p className="text-sm text-warm-700">
                Editing <span className="font-medium text-warm-900">{editingLineup.name}</span>
              </p>
              <PlainButton variant="ghost" size="sm" onClick={onNewLineup}>
                Start a new lineup
              </PlainButton>
            </div>
          )}
          <LineupBuilder
            key={editingLineup?.id ?? 'new'}
            roster={lineupRoster}
            onSave={onSaveLineup}
            initialLineup={editingLineup?.positions ?? undefined}
            initialName={editingLineup?.name}
          />
        </div>
      ) : (
        <>
          {/* KPI scoreboard */}
          <section className="mt-6" aria-label="Roster summary">
            <KPIContentsStrip
              columns={4}
              items={[
                { label: 'Players', value: stats.total },
                { label: 'Active', value: stats.active },
                { label: 'Positions', value: stats.positions },
                { label: 'With stats', value: stats.withStats },
              ]}
            />
          </section>

          {/* Search + filters */}
          <PaperCard className="mt-6 p-5">
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
          </PaperCard>

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
          <div className="mt-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : isEmpty ? (
              isFiltered ? (
                <EditorsLetter
                  ink="team"
                  title="No players match your filters."
                  body={`No players on ${teamName} match the current search and filters.`}
                  action={
                    <PlainButton variant="secondary" size="md" onClick={onClearFilters}>
                      Clear filters
                    </PlainButton>
                  }
                />
              ) : (
                <EmptyIssue
                  variant="roster"
                  action={
                    <PlainButton
                      variant="primary"
                      size="md"
                      leftIcon={<UserPlus className="h-4 w-4" />}
                      onClick={onInvite}
                    >
                      Invite players
                    </PlainButton>
                  }
                />
              )
            ) : rosterSurface === 'cards' ? (
              <RosterWall
                members={members}
                aggregates={aggregates}
                onSelect={onSelectPlayer}
                onAssignPlayer={onAssignPlayer}
                onRemoveMember={onRemoveMember}
              />
            ) : rosterSurface === 'position' ? (
              <TriageBoard columns={POSITION_BOARD_COLUMNS} groups={positionGroups} onSelect={onSelectPlayer} />
            ) : rosterSurface === 'status' ? (
              <TriageBoard
                columns={STATUS_BOARD_COLUMNS}
                groups={statusGroups}
                onSelect={onSelectPlayer}
                renderTrailing={(columnKey, member) => {
                  const playerName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'this player';
                  if (columnKey === 'pending') {
                    return (
                      <PendingMemberActions
                        memberId={member.memberId}
                        playerName={playerName}
                        onApprove={onApproveMember}
                        onReject={onRejectMember}
                      />
                    );
                  }
                  return (
                    <RosterRowMenu
                      playerId={member.playerId}
                      playerName={playerName}
                      jerseyNumber={member.jerseyNumber}
                      position={member.primaryPosition}
                      onAssign={onAssignPlayer}
                      onRemove={onRemoveMember}
                    />
                  );
                }}
              />
            ) : (
              <TriageBoard columns={DEV_BOARD_COLUMNS} groups={developmentGroups} onSelect={onSelectPlayer} />
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

      {showAssignModal && (
        <AssignPlayerModal
          open={showAssignModal}
          onClose={onCloseAssignModal}
          onSearch={onSearchPlayers}
          onAssign={onAssignPlayer}
        />
      )}
    </div>
  );
}

export default RosterFairway;

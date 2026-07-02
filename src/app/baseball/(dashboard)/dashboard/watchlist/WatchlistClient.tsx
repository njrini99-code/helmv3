'use client';

/**
 * ============================================================================
 * WatchlistClient — THE WAR ROOM watchlist, composed from the "Living Annual"
 * kit (spec: docs/baseball/design-system-living-annual.md; plan:
 * docs/baseball/ui-migration-execution-plan.md §3.2 watchlist row).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY (P4.20). Same read/write paths as before — `useWatchlist`
 * (read-only), the watchlist server actions, the direct client add-search
 * query, and CSV export are untouched. Only the chrome is re-skinned onto the
 * kit (`RecruitCard`-style rows, `SectionMasthead`, `EmptyIssue`, `CommitSeal`,
 * `ModalShell`, …).
 * ========================================================================== */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  SectionMasthead,
  Eyebrow,
  PaperCard,
  HairlineRule,
  InkBadge,
  StatReadout,
  EditorsLetter,
  EmptyIssue,
  CommitSeal,
  Reveal,
  pressableClass,
  EASE_SOFT,
  PACE,
} from '@/components/baseball/living-annual';
import {
  Button,
  IconButton,
  Select,
  Checkbox,
  Avatar,
  Input,
  TextArea,
  Skeleton,
  ModalShell,
} from '@/components/fairway';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { useToast } from '@/components/ui/sonner';
import {
  IconSearch,
  IconDownload,
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconUsers,
  IconEye,
  IconNote,
  IconX,
} from '@/components/icons';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import {
  removeFromWatchlist,
  updateWatchlistStatus,
  addWatchlistNote,
  addToWatchlist,
} from '@/app/baseball/actions/watchlist';
import { getFullName, getPipelineStageLabel, cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';
import type { PipelineStage, Player, WatchlistWithPlayer } from '@/lib/types';

// Sortable columns
type SortKey = 'name' | 'position' | 'state' | 'gradYear' | 'stage' | 'dateAdded';
type SortDirection = 'asc' | 'desc';

const statusOptions = PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label }));

/** Keyboard-activate a non-`<Button>` pressable element on Enter/Space (the
 * kit's own row/card molecules — `RecruitCard`, `PlayerRowPlate` — follow the
 * same `role="button"` + manual keydown pattern rather than a raw `<button>`). */
function activateOnKey(e: ReactKeyboardEvent<HTMLElement>, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

/** Fairway `<Select>` needs a real option value — map the "no filter" empty
 * string to this sentinel at the select boundary only; every other piece of
 * filtering logic keeps comparing against `''` exactly as before. */
const ALL = '__all__';

const gradYearOptions = [
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

/** Committed reads sodium (a live/PR moment, spec §3.2 watchlist row); every
 * other stage reads the WAR ROOM's clay ink. */
function stageTone(stage: PipelineStage): 'pursuit' | 'sodium' {
  return stage === 'committed' ? 'sodium' : 'pursuit';
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface SortableHeaderProps {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

function SortableHeader({ label, sortKeyValue, sortKey, sortDirection, onSort }: SortableHeaderProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onSort(sortKeyValue)}
      onKeyDown={(e) => activateOnKey(e, () => onSort(sortKeyValue))}
      className="inline-flex cursor-pointer items-center gap-1 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-pursuit"
    >
      {label}
      {sortKey === sortKeyValue ? (
        sortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />
      ) : null}
    </span>
  );
}

// ─── Loading skeleton — shape-matched, never a blank screen or a spinner ────

function WatchlistSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading watchlist" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <PaperCard className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--hairline)] px-6 py-4">
          <div className="flex items-center gap-6">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-[color:var(--hairline)] px-6 py-4 last:border-b-0">
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-4" />
              <div className="flex items-center gap-3">
                <Skeleton circle className="h-10 w-10" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </PaperCard>
    </div>
  );
}

// ─── Mobile card row ─────────────────────────────────────────────────────--

interface WatchlistMobileCardProps {
  item: WatchlistWithPlayer;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenPeek: () => void;
  onStageChange: (stage: PipelineStage) => void;
  onEditNote: () => void;
  onRemove: () => void;
}

function WatchlistMobileCard({
  item,
  selected,
  onToggleSelect,
  onOpenPeek,
  onStageChange,
  onEditNote,
  onRemove,
}: WatchlistMobileCardProps) {
  const name = getFullName(item.player?.first_name, item.player?.last_name);
  const stage = (item.pipeline_stage ?? 'watchlist') as PipelineStage;

  return (
    <PaperCard className="p-4">
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${name}`} className="mt-1" />
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenPeek}
          onKeyDown={(e) => activateOnKey(e, onOpenPeek)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-fw-sm px-1 py-1 text-left outline-none',
            pressableClass({ ink: 'pursuit' }),
          )}
        >
          <Avatar src={item.player?.avatar_url} name={name} size="md" />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-annual text-body-lg text-text-primary">{name}</span>
            <Eyebrow
              items={[item.player?.primary_position, item.player?.grad_year ? String(item.player.grad_year) : undefined]}
              ink="pursuit"
              className="mt-0.5"
            />
          </div>
        </div>
        <InkBadge label={getPipelineStageLabel(stage)} tone={stageTone(stage)} variant="solid" className="shrink-0" />
      </div>

      <HairlineRule ink="hairline" className="my-3" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">Location</span>
          <span className="font-annual text-body-sm text-text-secondary">{item.player?.state || '—'}</span>
        </div>
        <div>
          <span className="block text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">Added</span>
          <span className="font-annual text-body-sm text-text-secondary">{formatDate(item.added_at || item.created_at)}</span>
        </div>
      </div>

      {item.notes ? (
        <p className="mt-3 line-clamp-2 rounded-fw-sm bg-surface-sunken px-3 py-2 font-annual text-body-sm text-text-secondary">
          {item.notes}
        </p>
      ) : null}

      <div className="mt-3">
        <Select
          size="sm"
          aria-label={`Change stage for ${name}`}
          value={stage}
          onValueChange={(v) => v && onStageChange(v as PipelineStage)}
          options={statusOptions}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onOpenPeek} className="flex-1" leftIcon={<IconEye size={14} />}>
          View
        </Button>
        <Button variant="secondary" size="sm" onClick={onEditNote} leftIcon={<IconNote size={14} />}>
          Note
        </Button>
        <IconButton variant="danger" size="sm" aria-label={`Remove ${name} from watchlist`} onClick={onRemove}>
          <IconTrash size={16} />
        </IconButton>
      </div>
    </PaperCard>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────--

export function WatchlistClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const { coach } = useAuth();
  const { watchlist, loading, refetch } = useWatchlist();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const reducedMotion = useReducedMotion() ?? false;

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [gradYearFilter, setGradYearFilter] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | ''>('');

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [noteModal, setNoteModal] = useState<{ id: string; note: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [bulkStageModal, setBulkStageModal] = useState(false);
  const [bulkNoteModal, setBulkNoteModal] = useState(false);
  const [bulkNoteValue, setBulkNoteValue] = useState('');

  // Player search for add modal
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  // Peek panel
  const [peekPlayerId, setPeekPlayerId] = useState<string | null>(null);

  // Loading states
  const [removing, setRemoving] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingBulkNote, setSavingBulkNote] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Commit ceremony — fires once, on a successful stage change into `committed`.
  const [celebrateCommit, setCelebrateCommit] = useState(false);
  useEffect(() => {
    if (!celebrateCommit) return;
    const timer = setTimeout(() => setCelebrateCommit(false), 1800);
    return () => clearTimeout(timer);
  }, [celebrateCommit]);

  // Get unique positions and states for filters
  const uniquePositions = useMemo(() => {
    const positions = new Set<string>();
    watchlist.forEach(item => {
      if (item.player?.primary_position) {
        positions.add(item.player.primary_position);
      }
    });
    return Array.from(positions).sort();
  }, [watchlist]);

  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    watchlist.forEach(item => {
      if (item.player?.state) {
        states.add(item.player.state);
      }
    });
    return Array.from(states).sort();
  }, [watchlist]);

  // Filter and sort watchlist
  const filteredWatchlist = useMemo(() => {
    let result = [...watchlist];

    // Apply filters
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => {
        const name = getFullName(item.player?.first_name, item.player?.last_name).toLowerCase();
        const school = item.player?.high_school_name?.toLowerCase() || '';
        return name.includes(query) || school.includes(query);
      });
    }

    if (positionFilter) {
      result = result.filter(item => item.player?.primary_position === positionFilter);
    }

    if (stateFilter) {
      result = result.filter(item => item.player?.state === stateFilter);
    }

    if (gradYearFilter) {
      result = result.filter(item => item.player?.grad_year?.toString() === gradYearFilter);
    }

    if (stageFilter) {
      result = result.filter(item => item.pipeline_stage === stageFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case 'name':
          comparison = getFullName(a.player?.first_name, a.player?.last_name)
            .localeCompare(getFullName(b.player?.first_name, b.player?.last_name));
          break;
        case 'position':
          comparison = (a.player?.primary_position || '').localeCompare(b.player?.primary_position || '');
          break;
        case 'state':
          comparison = (a.player?.state || '').localeCompare(b.player?.state || '');
          break;
        case 'gradYear':
          comparison = (a.player?.grad_year || 0) - (b.player?.grad_year || 0);
          break;
        case 'stage':
          comparison = (a.pipeline_stage || '').localeCompare(b.pipeline_stage || '');
          break;
        case 'dateAdded':
          comparison = new Date(a.added_at || a.created_at || 0).getTime() -
                       new Date(b.added_at || b.created_at || 0).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [watchlist, searchQuery, positionFilter, stateFilter, gradYearFilter, stageFilter, sortKey, sortDirection]);

  // Handlers
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWatchlist.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWatchlist.map(item => item.id)));
    }
  };

  const handleRemovePlayer = async () => {
    if (!removeConfirm) return;
    const item = watchlist.find(w => w.id === removeConfirm);
    if (!item) return;

    setRemoving(true);
    try {
      const result = await removeFromWatchlist(item.coach_id, item.player_id);
      if (!result.success) {
        showToast(result.message || 'Failed to remove player', 'error');
        return;
      }
      refetch();
      showToast('Player removed from watchlist', 'success');
    } catch {
      showToast('Failed to remove player', 'error');
    } finally {
      setRemoving(false);
      setRemoveConfirm(null);
    }
  };

  const handleBulkRemove = async () => {
    setRemoving(true);
    try {
      const itemsToRemove = watchlist.filter(item => selectedIds.has(item.id));
      const results = await Promise.all(
        itemsToRemove.map(item => removeFromWatchlist(item.coach_id, item.player_id))
      );
      refetch();
      setSelectedIds(new Set());
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        showToast(`${failedCount} player(s) could not be removed`, 'error');
      }
      const succeededCount = results.length - failedCount;
      if (succeededCount > 0) {
        showToast(`${succeededCount} player(s) removed`, 'success');
      }
    } catch {
      showToast('Failed to remove some players', 'error');
    } finally {
      setRemoving(false);
      setBulkRemoveConfirm(false);
    }
  };

  const handleBulkStageChange = async (stage: PipelineStage) => {
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(id => updateWatchlistStatus(id, stage))
      );
      refetch();
      setSelectedIds(new Set());
      setBulkStageModal(false);
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        showToast(`${failedCount} player(s) could not be updated`, 'error');
      }
      const succeededCount = results.length - failedCount;
      if (succeededCount > 0) {
        showToast(`${succeededCount} player(s) moved to ${getPipelineStageLabel(stage)}`, 'success');
        if (stage === 'committed') setCelebrateCommit(true);
      }
    } catch {
      showToast('Failed to update some players', 'error');
    }
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setSavingNote(true);
    try {
      const result = await addWatchlistNote(noteModal.id, noteModal.note);
      if (!result.success) {
        showToast(result.error || 'Failed to save note', 'error');
        return;
      }
      refetch();
      setNoteModal(null);
      showToast('Note saved', 'success');
    } catch {
      showToast('Failed to save note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveBulkNote = async () => {
    if (!bulkNoteValue.trim()) return;
    setSavingBulkNote(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(id => addWatchlistNote(id, bulkNoteValue))
      );
      refetch();
      setSelectedIds(new Set());
      setBulkNoteModal(false);
      setBulkNoteValue('');
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        showToast(`${failedCount} note(s) could not be saved`, 'error');
      }
      const succeededCount = results.length - failedCount;
      if (succeededCount > 0) {
        showToast('Notes added', 'success');
      }
    } catch {
      showToast('Failed to save notes', 'error');
    } finally {
      setSavingBulkNote(false);
    }
  };

  const handleStageChange = async (watchlistId: string, stage: PipelineStage) => {
    try {
      const result = await updateWatchlistStatus(watchlistId, stage);
      if (!result.success) {
        showToast(result.error || 'Failed to update stage', 'error');
        return;
      }
      refetch();
      if (stage === 'committed') setCelebrateCommit(true);
    } catch {
      showToast('Failed to update stage', 'error');
    }
  };

  const searchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPlayerSearchResults([]);
      return;
    }

    setSearchingPlayers(true);
    try {
      const existingIds = watchlist.map(w => w.player_id);

      let queryBuilder = supabase
        .from('baseball_players')
        .select('*')
        .eq('recruiting_activated', true)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,high_school_name.ilike.%${query}%`)
        .limit(10);

      if (existingIds.length > 0) {
        queryBuilder = queryBuilder.not('id', 'in', `(${existingIds.join(',')})`);
      }

      const { data } = await queryBuilder;
      setPlayerSearchResults(data || []);
    } catch {
      setPlayerSearchResults([]);
    } finally {
      setSearchingPlayers(false);
    }
  }, [watchlist, supabase]);

  const handleAddPlayer = async (player: Player) => {
    if (!coach) return;
    setAddingPlayer(true);
    try {
      const result = await addToWatchlist(coach.id, player.id);
      if (!result.success) {
        showToast(result.message || 'Failed to add player', 'error');
        return;
      }
      refetch();
      setShowAddModal(false);
      setPlayerSearchQuery('');
      setPlayerSearchResults([]);
      showToast(`${getFullName(player.first_name, player.last_name)} added to watchlist`, 'success');
    } catch {
      showToast('Failed to add player', 'error');
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Position', 'Grad Year', 'State', 'City', 'School', 'Stage', 'Date Added', 'Notes'];
    const rows = filteredWatchlist.map(item => [
      getFullName(item.player?.first_name, item.player?.last_name),
      item.player?.primary_position || '',
      item.player?.grad_year?.toString() || '',
      item.player?.state || '',
      item.player?.city || '',
      item.player?.high_school_name || '',
      getPipelineStageLabel(item.pipeline_stage || 'watchlist'),
      new Date(item.added_at || item.created_at || '').toLocaleDateString(),
      (item.notes || '').replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `watchlist_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    showToast('Watchlist exported to CSV', 'success');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setPositionFilter('');
    setStateFilter('');
    setGradYearFilter('');
    setStageFilter('');
  };

  const hasActiveFilters = Boolean(searchQuery || positionFilter || stateFilter || gradYearFilter || stageFilter);

  const masthead = (
    <SectionMasthead
      eyebrow="THE WAR ROOM · WATCHLIST"
      title="Watchlist"
      ink="pursuit"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)} leftIcon={<IconPlus size={16} />}>
            Add Player
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} leftIcon={<IconDownload size={16} />}>
            Export CSV
          </Button>
        </div>
      }
    >
      {watchlist.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] max-w-md flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or school…"
              leading={<IconSearch size={16} />}
            />
          </div>

          <div className="w-36">
            <Select
              size="sm"
              aria-label="Filter by position"
              value={positionFilter || ALL}
              onValueChange={(v) => setPositionFilter(!v || v === ALL ? '' : v)}
              options={[{ value: ALL, label: 'All Positions' }, ...uniquePositions.map(p => ({ value: p, label: p }))]}
            />
          </div>

          <div className="w-36">
            <Select
              size="sm"
              aria-label="Filter by state"
              value={stateFilter || ALL}
              onValueChange={(v) => setStateFilter(!v || v === ALL ? '' : v)}
              options={[{ value: ALL, label: 'All States' }, ...uniqueStates.map(s => ({ value: s, label: s }))]}
            />
          </div>

          <div className="w-32">
            <Select
              size="sm"
              aria-label="Filter by grad year"
              value={gradYearFilter || ALL}
              onValueChange={(v) => setGradYearFilter(!v || v === ALL ? '' : v)}
              options={[{ value: ALL, label: 'All Years' }, ...gradYearOptions]}
            />
          </div>

          <div className="w-40">
            <Select
              size="sm"
              aria-label="Filter by stage"
              value={stageFilter || ALL}
              onValueChange={(v) => setStageFilter(!v || v === ALL ? '' : (v as PipelineStage))}
              options={[{ value: ALL, label: 'All Stages' }, ...statusOptions]}
            />
          </div>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={<IconX size={14} />}>
              Clear
            </Button>
          ) : null}

          <span className="ml-auto inline-flex items-baseline gap-1.5 text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
            <StatReadout value={watchlist.length} ariaLabel="Players in watchlist" className="font-annual text-body-lg text-pursuit" />
            {watchlist.length === 1 ? 'player' : 'players'}
          </span>
        </div>
      ) : null}
    </SectionMasthead>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {masthead}
        <div className="mt-8">
          <WatchlistSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {masthead}

      <div className="mt-8 space-y-6">
        {/* Empty State */}
        {watchlist.length === 0 ? (
          <EmptyIssue
            variant="pipeline"
            ink="pursuit"
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="sm">
                  <Link href="/baseball/dashboard/discover" className="inline-flex items-center gap-2">
                    <IconUsers size={16} />
                    Discover players
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)} leftIcon={<IconPlus size={16} />}>
                  Quick add
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
              <PaperCard className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-annual text-body-sm text-pursuit">
                    {selectedIds.size} player{selectedIds.size !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => setBulkStageModal(true)}>
                      Move Stage
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setBulkNoteModal(true)}>
                      Add Note
                    </Button>
                    <IconButton
                      variant="danger"
                      size="sm"
                      aria-label="Remove selected players"
                      onClick={() => setBulkRemoveConfirm(true)}
                    >
                      <IconTrash size={16} />
                    </IconButton>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      Clear
                    </Button>
                  </div>
                </div>
              </PaperCard>
            )}

            {/* Results */}
            {filteredWatchlist.length === 0 ? (
              <EditorsLetter
                ink="pursuit"
                title="No players match your filters."
                body="Widen a filter — the rest of your watchlist is one clear away."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="space-y-4 lg:hidden">
                  {filteredWatchlist.map((item, index) => (
                    <Reveal key={item.id} staggerIndex={index}>
                      <WatchlistMobileCard
                        item={item}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelection(item.id)}
                        onOpenPeek={() => setPeekPlayerId(item.player?.id || null)}
                        onStageChange={(stage) => handleStageChange(item.id, stage)}
                        onEditNote={() => setNoteModal({ id: item.id, note: item.notes || '' })}
                        onRemove={() => setRemoveConfirm(item.id)}
                      />
                    </Reveal>
                  ))}
                </div>

                {/* Desktop Table View */}
                <PaperCard className="hidden overflow-hidden p-0 lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[color:var(--hairline)]">
                          <th className="w-12 px-4 py-3">
                            <Checkbox
                              checked={selectedIds.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all players"
                            />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Player" sortKeyValue="name" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Position" sortKeyValue="position" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="State" sortKeyValue="state" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Grad Year" sortKeyValue="gradYear" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Stage" sortKeyValue="stage" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Date Added" sortKeyValue="dateAdded" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                          </th>
                          <th className="px-6 py-3 text-left text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                            Notes
                          </th>
                          <th className="px-6 py-3 text-left text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--hairline)]">
                        {filteredWatchlist.map(item => {
                          const name = getFullName(item.player?.first_name, item.player?.last_name);
                          const stage = (item.pipeline_stage ?? 'watchlist') as PipelineStage;
                          return (
                            <tr key={item.id} className="align-middle transition-colors hover:bg-pursuit/[0.03]">
                              <td className="px-4 py-4">
                                <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelection(item.id)} aria-label={`Select ${name}`} />
                              </td>
                              <td className="px-6 py-4">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setPeekPlayerId(item.player?.id || null)}
                                  onKeyDown={(e) => activateOnKey(e, () => setPeekPlayerId(item.player?.id || null))}
                                  className={cn('flex w-full items-center gap-3 rounded-fw-sm px-1 py-1 text-left outline-none', pressableClass({ ink: 'pursuit' }))}
                                >
                                  <Avatar src={item.player?.avatar_url} name={name} size="md" />
                                  <div className="min-w-0">
                                    <p className="truncate font-annual text-body-sm text-text-primary">{name}</p>
                                    <p className="truncate text-eyebrow text-text-tertiary">{item.player?.high_school_name || 'No school'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 font-annual text-body-sm text-text-secondary">{item.player?.primary_position || '—'}</td>
                              <td className="px-6 py-4 font-annual text-body-sm text-text-secondary">{item.player?.state || '—'}</td>
                              <td className="px-6 py-4 font-annual text-body-sm text-text-secondary">{item.player?.grad_year || '—'}</td>
                              <td className="px-6 py-4">
                                <div className="w-44">
                                  <Select
                                    size="sm"
                                    aria-label={`Change stage for ${name}`}
                                    value={stage}
                                    onValueChange={(v) => v && handleStageChange(item.id, v as PipelineStage)}
                                    options={statusOptions}
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                                {formatDate(item.added_at || item.created_at)}
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setNoteModal({ id: item.id, note: item.notes || '' })}
                                  onKeyDown={(e) => activateOnKey(e, () => setNoteModal({ id: item.id, note: item.notes || '' }))}
                                  title={item.notes || 'Add note'}
                                  className="block max-w-[140px] cursor-pointer truncate rounded-fw-sm px-1 py-1 text-left font-annual text-body-sm text-text-secondary underline decoration-[color:var(--hairline)] underline-offset-2 outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-pursuit"
                                >
                                  {item.notes
                                    ? (item.notes.length > 20 ? `${item.notes.slice(0, 20)}…` : item.notes)
                                    : 'Add note'
                                  }
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => setPeekPlayerId(item.player?.id || null)}>
                                    View
                                  </Button>
                                  <IconButton
                                    variant="danger"
                                    size="sm"
                                    aria-label={`Remove ${name} from watchlist`}
                                    onClick={() => setRemoveConfirm(item.id)}
                                  >
                                    <IconTrash size={16} />
                                  </IconButton>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </PaperCard>

                {/* Results count */}
                <p className="text-center text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                  Showing {filteredWatchlist.length} of {watchlist.length} players
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Commit ceremony — fires once, on a successful stage change into `committed`. */}
      <AnimatePresence>
        {celebrateCommit ? (
          <m.div
            key="commit-seal"
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : PACE.base, ease: EASE_SOFT }}
          >
            <CommitSeal label="COMMITTED" size="md" />
            <span className="sr-only">Player marked committed</span>
          </m.div>
        ) : null}
      </AnimatePresence>

      {/* Add Player Modal */}
      <ModalShell
        open={showAddModal}
        onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) {
            setPlayerSearchQuery('');
            setPlayerSearchResults([]);
          }
        }}
        title="Add Player to Watchlist"
        size="md"
      >
        <ModalShell.Body>
          <div className="space-y-4">
            <Input
              value={playerSearchQuery}
              onChange={(e) => {
                setPlayerSearchQuery(e.target.value);
                searchPlayers(e.target.value);
              }}
              placeholder="Search by name or school…"
              leading={<IconSearch size={16} />}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary search input in add-to-watchlist dialog
              autoFocus
            />

            {searchingPlayers ? (
              <p className="font-annual text-body-sm text-text-tertiary">Searching…</p>
            ) : null}

            {playerSearchResults.length > 0 ? (
              <div className="max-h-64 divide-y divide-[color:var(--hairline)] overflow-y-auto rounded-fw-sm border border-[color:var(--hairline)]">
                {playerSearchResults.map(player => (
                  <div
                    key={player.id}
                    role="button"
                    tabIndex={addingPlayer ? -1 : 0}
                    aria-disabled={addingPlayer}
                    onClick={() => !addingPlayer && handleAddPlayer(player)}
                    onKeyDown={(e) => !addingPlayer && activateOnKey(e, () => handleAddPlayer(player))}
                    className={cn(
                      'flex w-full items-center gap-3 p-3 text-left outline-none',
                      addingPlayer ? 'cursor-not-allowed opacity-50' : pressableClass({ ink: 'pursuit' }),
                    )}
                  >
                    <Avatar name={getFullName(player.first_name, player.last_name)} src={player.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-annual text-body-sm text-text-primary">
                        {getFullName(player.first_name, player.last_name)}
                      </p>
                      <p className="truncate text-eyebrow text-text-tertiary">
                        {player.primary_position} • {player.grad_year} • {player.high_school_name}
                      </p>
                    </div>
                    <IconPlus size={16} className="text-pursuit" />
                  </div>
                ))}
              </div>
            ) : null}

            {playerSearchQuery.length >= 2 && playerSearchResults.length === 0 && !searchingPlayers ? (
              <p className="py-4 text-center font-annual text-body-sm text-text-tertiary">
                No players found matching &quot;{playerSearchQuery}&quot;
              </p>
            ) : null}

            <div className="border-t border-[color:var(--hairline)] pt-4">
              <p className="text-center text-eyebrow text-text-tertiary">
                Or{' '}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => { setShowAddModal(false); router.push('/baseball/dashboard/discover'); }}
                  onKeyDown={(e) => activateOnKey(e, () => { setShowAddModal(false); router.push('/baseball/dashboard/discover'); })}
                  className="cursor-pointer text-pursuit underline decoration-[color:var(--hairline)] underline-offset-2 outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-pursuit"
                >
                  browse all players
                </span>
              </p>
            </div>
          </div>
        </ModalShell.Body>
      </ModalShell>

      {/* Note Modal */}
      <ModalShell
        open={!!noteModal}
        onOpenChange={(open) => { if (!open) setNoteModal(null); }}
        title="Edit Note"
        size="md"
      >
        {noteModal ? (
          <>
            <ModalShell.Body>
              <TextArea
                value={noteModal.note}
                onChange={(e) => setNoteModal({ ...noteModal, note: e.target.value })}
                placeholder="Add notes about this player…"
                rows={4}
              />
            </ModalShell.Body>
            <ModalShell.Footer>
              <Button variant="ghost" onClick={() => setNoteModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? 'Saving…' : 'Save Note'}
              </Button>
            </ModalShell.Footer>
          </>
        ) : null}
      </ModalShell>

      {/* Bulk Note Modal (kit replacement for the previous window.prompt()) */}
      <ModalShell
        open={bulkNoteModal}
        onOpenChange={(open) => { setBulkNoteModal(open); if (!open) setBulkNoteValue(''); }}
        title="Add Note to Selected Players"
        size="sm"
      >
        <ModalShell.Body>
          <p className="mb-3 font-annual text-body-sm text-text-secondary">
            Add a note to {selectedIds.size} selected player{selectedIds.size !== 1 ? 's' : ''}:
          </p>
          <TextArea
            value={bulkNoteValue}
            onChange={(e) => setBulkNoteValue(e.target.value)}
            placeholder="Enter note…"
            rows={4}
          />
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setBulkNoteModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveBulkNote} disabled={savingBulkNote || !bulkNoteValue.trim()}>
            {savingBulkNote ? 'Saving…' : 'Save Note'}
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* Bulk Stage Change Modal */}
      <ModalShell
        open={bulkStageModal}
        onOpenChange={setBulkStageModal}
        title="Move to Stage"
        size="sm"
      >
        <ModalShell.Body>
          <p className="mb-4 font-annual text-body-sm text-text-secondary">
            Move {selectedIds.size} player{selectedIds.size !== 1 ? 's' : ''} to:
          </p>
          <div className="space-y-2">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage.id}
                role="button"
                tabIndex={0}
                onClick={() => handleBulkStageChange(stage.id)}
                onKeyDown={(e) => activateOnKey(e, () => handleBulkStageChange(stage.id))}
                className={cn(
                  'w-full rounded-fw-sm border border-[color:var(--hairline)] px-4 py-3 text-left font-annual text-body-sm text-text-primary outline-none',
                  pressableClass({ ink: 'pursuit' }),
                )}
              >
                {stage.label}
              </div>
            ))}
          </div>
        </ModalShell.Body>
      </ModalShell>

      {/* Remove Confirmation */}
      <ConfirmDialog
        open={!!removeConfirm}
        title="Remove from Watchlist"
        message="Are you sure you want to remove this player from your watchlist?"
        confirmLabel="Remove"
        variant="danger"
        isLoading={removing}
        onConfirm={handleRemovePlayer}
        onCancel={() => setRemoveConfirm(null)}
      />

      {/* Bulk Remove Confirmation */}
      <ConfirmDialog
        open={bulkRemoveConfirm}
        title="Remove Selected Players"
        message={`Are you sure you want to remove ${selectedIds.size} player(s) from your watchlist?`}
        confirmLabel="Remove All"
        variant="danger"
        isLoading={removing}
        onConfirm={handleBulkRemove}
        onCancel={() => setBulkRemoveConfirm(false)}
      />

      {/* Player Peek Panel */}
      <PlayerPeekPanel
        playerId={peekPlayerId}
        onClose={() => setPeekPlayerId(null)}
      />
    </div>
  );
}

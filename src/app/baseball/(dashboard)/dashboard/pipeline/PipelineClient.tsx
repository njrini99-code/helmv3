'use client';

/**
 * ============================================================================
 * PipelineClient — THE WAR ROOM recruiting pipeline, composed from the
 * "Living Annual" kit (spec: docs/baseball/design-system-living-annual.md;
 * plan: docs/baseball/ui-migration-execution-plan.md §3.2 pipeline row).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY (P4.21.a). Same read/write paths as before — `useWatchlist`,
 * the watchlist server actions, dnd-kit drag orchestration, and the keyboard
 * navigation state machine are untouched. Only the chrome is re-skinned onto
 * the kit (`RecruitCard`, `SectionMasthead`, `EmptyIssue`, `CommitSeal`, …).
 *
 * pipeline/page.tsx and the Fairway shell wiring are a separate task (W16) —
 * this file keeps its existing default export shape (`export default function
 * PipelinePage()`) so page.tsx keeps working unmodified.
 * ========================================================================== */

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  RecruitCard,
  Reveal,
  HoverReveal,
  pressableClass,
  EASE_SOFT,
  PACE,
} from '@/components/baseball/living-annual';
import { Button, IconButton, Select, Checkbox, Avatar, InlineNotice, Skeleton, TextArea } from '@/components/fairway';
import { PlayerDetailModal } from '@/components/coach/PlayerDetailModal';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { PositionPlanner } from '@/components/baseball/position-planner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconUsers, IconLayoutGrid, IconList, IconTarget, IconTrash, IconTrendingUp } from '@/components/icons';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { getFullName, getPipelineStageLabel, cn } from '@/lib/utils';
import {
  removeFromWatchlist,
  updateWatchlistStatus,
  addWatchlistNote,
} from '@/app/baseball/actions/watchlist';
import type { PipelineStage, Player, WatchlistWithPlayer } from '@/lib/types';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';

const gradYearOptions = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

/** Fairway `<Select>` needs a real option value — map the "no filter" empty
 * string to this sentinel at the select boundary only; every other piece of
 * filtering logic keeps comparing against `''` exactly as before. */
const ALL_GRAD_YEARS = '__all__';

const statusOptions = PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label }));

// Droppable columns use the stage id; draggable cards use the watchlist-row
// UUID. This set lets the drag handler tell a real drop-target column apart
// from a card that `closestCorners` happened to land on.
const PIPELINE_STAGE_IDS = new Set<PipelineStage>(PIPELINE_STAGES.map((s) => s.id));

const filterTabs = [
  { value: 'all', label: 'All' },
  ...PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label })),
];

type ViewMode = 'pipeline' | 'list' | 'position';

const VIEW_MODES: Array<{ value: ViewMode; label: string; icon: React.ReactNode }> = [
  { value: 'pipeline', label: 'Board', icon: <IconLayoutGrid size={14} /> },
  { value: 'position', label: 'Positions', icon: <IconTarget size={14} /> },
  { value: 'list', label: 'List', icon: <IconList size={14} /> },
];

/** The one headline measurable a recruiting card can honestly show — real
 * fastball/exit velo only, never a fabricated or rounded-to-uselessness figure
 * (60-yard/pop times are decimal-sensitive and RecruitCard's topStat has no
 * decimals slot, so they're intentionally left out rather than misreported). */
function headlineStat(player?: Player | null): { label: string; value: number; unit: string } | undefined {
  if (!player) return undefined;
  if (typeof player.pitch_velo === 'number') return { label: 'FB Velo', value: player.pitch_velo, unit: 'MPH' };
  if (typeof player.exit_velo === 'number') return { label: 'Exit Velo', value: player.exit_velo, unit: 'MPH' };
  return undefined;
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Pipeline stats strip — clay KPI contents, StatReadout(flashOnChange) on ──
// green rules would break the two-ink law, so this composes the atoms
// KPIContentsStrip is built from directly (RuledStatLine hard-codes team ink
// and has no flashOnChange passthrough) rather than the team-only molecule.

function PipelineStatsStrip({ watchlist }: { watchlist: WatchlistWithPlayer[] }) {
  const stats = useMemo(() => {
    const counts = { total: watchlist.length, watching: 0, highPriority: 0, offers: 0, committed: 0, uninterested: 0 };
    watchlist.forEach((item) => {
      switch (item.pipeline_stage) {
        case 'watchlist':
          counts.watching++;
          break;
        case 'high_priority':
          counts.highPriority++;
          break;
        case 'offer_extended':
          counts.offers++;
          break;
        case 'committed':
          counts.committed++;
          break;
        case 'uninterested':
          counts.uninterested++;
          break;
      }
    });
    return counts;
  }, [watchlist]);

  if (watchlist.length === 0) return null;

  const items: Array<{ label: string; value: number; highlight?: boolean }> = [
    { label: 'Total', value: stats.total },
    { label: 'Watching', value: stats.watching },
    { label: 'High Priority', value: stats.highPriority },
    { label: 'Offers', value: stats.offers },
    { label: 'Committed', value: stats.committed, highlight: stats.committed > 0 },
    { label: 'Not Interested', value: stats.uninterested },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1">
          <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">{it.label}</span>
          <div className="relative">
            <StatReadout
              value={it.value}
              flashOnChange
              ariaLabel={it.label}
              className={cn('pb-1 font-annual text-ink leading-none', it.highlight ? 'text-pursuit' : 'text-text-primary')}
            />
            <HairlineRule ink="pursuit" weight={1.5} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Kanban board ──────────────────────────────────────────────────────────

function PipelineBoardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading pipeline"
      className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0"
    >
      {PIPELINE_STAGES.map((s) => (
        <div key={s.id} className="w-[280px] flex-shrink-0 lg:w-auto">
          <PaperCard className="flex h-full min-h-[420px] flex-col p-4">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton circle className="h-5 w-5" />
            </div>
            <HairlineRule ink="hairline" className="mb-4" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-card" />
              ))}
            </div>
          </PaperCard>
        </div>
      ))}
    </div>
  );
}

interface PipelineBoardCardProps {
  item: WatchlistWithPlayer;
  onOpenPeek: (playerId: string) => void;
  onQuickMove: (item: WatchlistWithPlayer, stage: PipelineStage) => void;
  onQuickRemove: (item: WatchlistWithPlayer) => void;
}

function PipelineBoardCard({ item, onOpenPeek, onQuickMove, onQuickRemove }: PipelineBoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform) };
  const currentStage = (item.pipeline_stage ?? 'watchlist') as PipelineStage;
  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);
  const prevStage = stageIndex > 0 ? PIPELINE_STAGES[stageIndex - 1] : undefined;
  const nextStage = stageIndex >= 0 && stageIndex < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[stageIndex + 1] : undefined;
  const name = getFullName(item.player?.first_name, item.player?.last_name);

  function openPeek() {
    if (isDragging) return;
    if (item.player?.id) onOpenPeek(item.player.id);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPeek();
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={openPeek}
      onKeyDown={handleKeyDown}
      data-testid="pipeline-card"
      data-id={item.id}
      data-player-id={item.player_id}
      data-stage={currentStage}
      className={cn('rounded-card', pressableClass({ ink: 'pursuit', lift: true }), isDragging && 'opacity-40')}
    >
      <HoverReveal
        position="overlay"
        reveal={
          <div className="flex h-full flex-col justify-end">
            <div className="flex items-end justify-between gap-1 rounded-b-card bg-gradient-to-t from-[var(--paper)] via-[var(--paper)]/95 to-transparent p-2 pt-8">
              {prevStage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e: ReactMouseEvent) => {
                    e.stopPropagation();
                    onQuickMove(item, prevStage.id);
                  }}
                >
                  ← {getPipelineStageLabel(prevStage.id)}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1">
                {nextStage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e: ReactMouseEvent) => {
                      e.stopPropagation();
                      onQuickMove(item, nextStage.id);
                    }}
                  >
                    {getPipelineStageLabel(nextStage.id)} →
                  </Button>
                ) : null}
                <IconButton
                  variant="danger"
                  size="sm"
                  aria-label={`Remove ${name} from pipeline`}
                  onClick={(e: ReactMouseEvent) => {
                    e.stopPropagation();
                    onQuickRemove(item);
                  }}
                >
                  <IconTrash size={14} />
                </IconButton>
              </div>
            </div>
          </div>
        }
      >
        <RecruitCard
          firstName={item.player?.first_name || 'Unknown'}
          lastName={item.player?.last_name || 'Player'}
          position={item.player?.primary_position ?? undefined}
          classYear={item.player?.grad_year ? String(item.player.grad_year) : undefined}
          state={item.player?.state ?? undefined}
          topStat={headlineStat(item.player)}
          stage={getPipelineStageLabel(currentStage)}
        />
      </HoverReveal>
    </div>
  );
}

interface PipelineBoardColumnProps {
  stage: PipelineStage;
  items: WatchlistWithPlayer[];
  onOpenPeek: (playerId: string) => void;
  onQuickMove: (item: WatchlistWithPlayer, stage: PipelineStage) => void;
  onQuickRemove: (item: WatchlistWithPlayer) => void;
}

function PipelineBoardColumn({ stage, items, onOpenPeek, onQuickMove, onQuickRemove }: PipelineBoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const label = getPipelineStageLabel(stage);

  return (
    <div
      ref={setNodeRef}
      data-testid={`pipeline-column-${stage}`}
      className="w-[280px] flex-shrink-0 snap-start lg:w-auto lg:snap-align-none"
    >
      <PaperCard
        className={cn(
          'flex h-full min-h-[520px] flex-col p-4 transition-colors',
          isOver && 'bg-pursuit/[0.05] ring-2 ring-pursuit',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <Eyebrow ink="pursuit">{label}</Eyebrow>
          <InkBadge label={String(items.length)} tone="pursuit" variant={items.length > 0 ? 'solid' : 'soft'} />
        </div>
        <HairlineRule ink="pursuit" className="mb-4" />
        <div className="flex-1 space-y-3">
          {items.map((item, index) => (
            <Reveal key={item.id} staggerIndex={index}>
              <PipelineBoardCard item={item} onOpenPeek={onOpenPeek} onQuickMove={onQuickMove} onQuickRemove={onQuickRemove} />
            </Reveal>
          ))}
          {items.length === 0 ? (
            <p
              className={cn(
                'py-8 text-center font-annual text-body-sm',
                isOver ? 'font-semibold text-pursuit' : 'text-text-tertiary',
              )}
            >
              {isOver ? 'Drop here' : 'No players'}
            </p>
          ) : null}
        </div>
      </PaperCard>
    </div>
  );
}

// ─── List (table) view ──────────────────────────────────────────────────────

interface PipelineListRowProps {
  item: WatchlistWithPlayer;
  focused: boolean;
  selected: boolean;
  editing: boolean;
  noteValue: string;
  onFocus: () => void;
  onOpenPeek: () => void;
  onToggleSelect: () => void;
  onStatusChange: (stage: PipelineStage) => void;
  onStartEditNote: () => void;
  onNoteValueChange: (value: string) => void;
  onSaveNote: () => void;
  onCancelNote: () => void;
  onViewProfile: () => void;
  onRemove: () => void;
}

function PipelineListRow({
  item,
  focused,
  selected,
  editing,
  noteValue,
  onFocus,
  onOpenPeek,
  onToggleSelect,
  onStatusChange,
  onStartEditNote,
  onNoteValueChange,
  onSaveNote,
  onCancelNote,
  onViewProfile,
  onRemove,
}: PipelineListRowProps) {
  const name = getFullName(item.player?.first_name, item.player?.last_name);
  const location = item.player?.city && item.player?.state ? `${item.player.city}, ${item.player.state}` : 'N/A';

  return (
    <tr
      onClick={onFocus}
      className={cn(
        'align-top transition-colors',
        pressableClass({ ink: 'pursuit', tint: !focused }),
        focused && 'bg-pursuit/[0.06] ring-2 ring-inset ring-pursuit',
      )}
    >
      <td className="px-3 py-4">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${name}`} />
      </td>
      <td className="px-3 py-4">
        <Button
          variant="ghost"
          onClick={onOpenPeek}
          className="h-auto min-h-0 justify-start gap-3 rounded-fw-sm px-2 py-1 text-left font-normal"
        >
          <Avatar src={item.player?.avatar_url} name={name} size="md" />
          <div className="min-w-0">
            <span className="block truncate font-annual text-body-lg text-text-primary">{name}</span>
            <span className="text-eyebrow text-text-tertiary">{item.player?.high_school_name || 'No school'}</span>
          </div>
        </Button>
      </td>
      <td className="px-3 py-4 font-annual text-body-sm text-text-secondary">{item.player?.primary_position || '—'}</td>
      <td className="px-3 py-4 font-annual text-body-sm text-text-secondary">{item.player?.grad_year ?? '—'}</td>
      <td className="px-3 py-4 font-annual text-body-sm text-text-secondary">{location}</td>
      <td className="px-3 py-4">
        <div className="w-44">
          <Select
            size="sm"
            aria-label={`Change stage for ${name}`}
            value={item.pipeline_stage ?? 'watchlist'}
            onValueChange={(v) => v && onStatusChange(v as PipelineStage)}
            options={statusOptions}
          />
        </div>
      </td>
      <td className="px-3 py-4 font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        {formatDate(item.updated_at)}
      </td>
      <td className="px-3 py-4">
        {editing ? (
          <div className="w-56 space-y-2">
            <TextArea
              size="sm"
              value={noteValue}
              onChange={(e) => onNoteValueChange(e.target.value)}
              placeholder="Add notes about this player…"
              rows={3}
              className="w-full resize-none focus-visible:ring-pursuit"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveNote}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelNote}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            title={item.notes || 'Add note'}
            onClick={onStartEditNote}
            className="h-auto min-h-0 max-w-[160px] justify-start truncate px-2 py-1 text-left font-normal underline decoration-[color:var(--hairline)] underline-offset-2"
          >
            {item.notes ? (item.notes.length > 24 ? `${item.notes.slice(0, 24)}…` : item.notes) : 'Add note'}
          </Button>
        )}
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onViewProfile}>
            View
          </Button>
          <IconButton variant="danger" size="sm" aria-label={`Remove ${name} from pipeline`} onClick={onRemove}>
            <IconTrash size={16} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { coach } = useAuth();
  const { watchlist, loading, updateStage, removeFromWatchlist: quickRemoveFromWatchlist, refetch } = useWatchlist();
  const reducedMotion = useReducedMotion() ?? false;

  // View state from URL
  const viewParam = searchParams.get('view');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (viewParam === 'list') return 'list';
    if (viewParam === 'position') return 'position';
    return 'pipeline';
  });

  // Pipeline (Kanban) state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gradYearFilter, setGradYearFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [celebrateCommit, setCelebrateCommit] = useState(false);

  // Watchlist (Table) state
  const [filterTab, setFilterTab] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [peekPlayerId, setPeekPlayerId] = useState<string | null>(null);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Update URL when view changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (viewMode === 'list') {
      params.set('view', 'list');
    } else if (viewMode === 'position') {
      params.set('view', 'position');
    } else {
      params.delete('view');
    }
    router.replace(`/baseball/dashboard/pipeline?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs when viewMode changes; adding router/searchParams would cause loop
  }, [viewMode]);

  // Auto-clear the commit ceremony after it's had its moment.
  useEffect(() => {
    if (!celebrateCommit) return;
    const timer = setTimeout(() => setCelebrateCommit(false), 1800);
    return () => clearTimeout(timer);
  }, [celebrateCommit]);

  // Filter watchlist by grad year (for pipeline view)
  const filteredByGradYear = useMemo(() => {
    if (!gradYearFilter) return watchlist;
    return watchlist.filter(item => item.player?.grad_year?.toString() === gradYearFilter);
  }, [watchlist, gradYearFilter]);

  // Filter watchlist for table view
  const filteredWatchlist = useMemo(() => {
    return watchlist.filter(item => {
      if (filterTab !== 'all' && item.pipeline_stage !== filterTab) return false;
      if (positionFilter !== 'all' && item.player?.primary_position !== positionFilter) return false;
      if (gradYearFilter && item.player?.grad_year?.toString() !== gradYearFilter) return false;
      return true;
    });
  }, [watchlist, filterTab, positionFilter, gradYearFilter]);

  const activeItem = filteredByGradYear.find((item) => item.id === activeId);

  // Get unique positions for filters
  const uniquePositions = Array.from(new Set(watchlist.map(item => item.player?.primary_position).filter((pos): pos is string => Boolean(pos))));

  const isFiltered = Boolean(gradYearFilter) || filterTab !== 'all' || positionFilter !== 'all';

  // Pipeline handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const draggedItem = filteredByGradYear.find((item) => item.id === active.id);

    // With closestCorners, `over` is often another card (a watchlist UUID),
    // not a column. Resolve the target stage from the column id, falling back
    // to the stage of the card being hovered; anything else is an invalid drop
    // and must be a no-op (no DB write).
    const overId = over.id as string;
    const newStage: PipelineStage | null = PIPELINE_STAGE_IDS.has(overId as PipelineStage)
      ? (overId as PipelineStage)
      : (filteredByGradYear.find((item) => item.id === overId)?.pipeline_stage ?? null);

    if (draggedItem && newStage && draggedItem.pipeline_stage !== newStage) {
      // updateStage shows its own success/error toast and only refetches on
      // success (so the card reverts to its column on failure). Just reflect
      // the boolean return — never a second, unconditional success toast.
      const ok = await updateStage(draggedItem.player_id, newStage);
      setError(ok ? null : 'Failed to update player stage. Please try again.');
      if (ok && newStage === 'committed') {
        setCelebrateCommit(true);
      }
    }

    setActiveId(null);
  };

  const handleQuickMove = useCallback(
    async (item: WatchlistWithPlayer, stage: PipelineStage) => {
      const ok = await updateStage(item.player_id, stage);
      if (ok && stage === 'committed') {
        setCelebrateCommit(true);
      }
    },
    [updateStage]
  );

  const handleQuickRemove = useCallback(
    (item: WatchlistWithPlayer) => {
      void quickRemoveFromWatchlist(item.player_id);
    },
    [quickRemoveFromWatchlist]
  );

  // Watchlist handlers
  async function handleStatusChange(watchlistId: string, newStatus: PipelineStage) {
    try {
      const result = await updateWatchlistStatus(watchlistId, newStatus);
      if (!result.success) {
        showToast(result.error || 'Failed to update status', 'error');
        return;
      }
      refetch();
    } catch {
      showToast('Failed to update status', 'error');
    }
  }

  async function handleRemoveConfirm() {
    if (!removeConfirm) return;
    const item = watchlist.find(w => w.id === removeConfirm);
    if (!item) return;

    setRemoving(true);
    try {
      const result = await removeFromWatchlist(item.coach_id, item.player_id);
      if (!result.success) {
        showToast(result.message || 'Failed to remove from watchlist', 'error');
        return;
      }
      refetch();
      showToast('Player removed from watchlist', 'success');
    } catch {
      showToast('Failed to remove from watchlist', 'error');
    } finally {
      setRemoving(false);
      setRemoveConfirm(null);
    }
  }

  async function handleSaveNote(watchlistId: string) {
    try {
      const result = await addWatchlistNote(watchlistId, noteValue);
      if (!result.success) {
        showToast(result.error || 'Failed to save note', 'error');
        return;
      }
      refetch();
      setEditingNote(null);
      setNoteValue('');
    } catch {
      showToast('Failed to save note', 'error');
    }
  }

  function startEditingNote(watchlistId: string, currentNote: string | null) {
    setEditingNote(watchlistId);
    setNoteValue(currentNote || '');
  }

  function togglePlayerSelection(watchlistId: string) {
    setSelectedPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(watchlistId)) {
        newSet.delete(watchlistId);
      } else {
        newSet.add(watchlistId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedPlayers.size === filteredWatchlist.length) {
      setSelectedPlayers(new Set());
    } else {
      setSelectedPlayers(new Set(filteredWatchlist.map(item => item.id)));
    }
  }

  async function handleBulkStatusChange(newStatus: PipelineStage) {
    if (selectedPlayers.size === 0) return;

    try {
      const results = await Promise.all(
        Array.from(selectedPlayers).map(watchlistId =>
          updateWatchlistStatus(watchlistId, newStatus)
        )
      );
      const failed = results.filter(r => !r.success).length;
      if (failed > 0) {
        showToast(`Failed to update ${failed} player${failed !== 1 ? 's' : ''}`, 'error');
      }
      refetch();
      setSelectedPlayers(new Set());
    } catch {
      showToast('Failed to update some players', 'error');
    }
  }

  async function handleBulkRemoveConfirm() {
    if (selectedPlayers.size === 0) return;

    setRemoving(true);
    try {
      const itemsToRemove = watchlist.filter(item => selectedPlayers.has(item.id));

      const results = await Promise.all(
        itemsToRemove.map(item =>
          removeFromWatchlist(item.coach_id, item.player_id)
        )
      );

      const failed = results.filter(r => !r.success).length;
      if (failed > 0) {
        showToast(`Failed to remove ${failed} player${failed !== 1 ? 's' : ''}`, 'error');
      } else {
        showToast(`${selectedPlayers.size} player(s) removed from watchlist`, 'success');
      }
      refetch();
      setSelectedPlayers(new Set());
    } catch {
      showToast('Failed to remove some players', 'error');
    } finally {
      setRemoving(false);
      setBulkRemoveConfirm(false);
    }
  }

  // Keyboard navigation handler
  const handleKeyboardNavigation = useCallback((e: KeyboardEvent) => {
    // Only handle in list view when not editing
    if (viewMode !== 'list' || editingNote || filteredWatchlist.length === 0) return;

    // Don't intercept if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredWatchlist.length - 1));
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredWatchlist.length) {
          const item = filteredWatchlist[focusedIndex];
          if (item?.player?.id) {
            setPeekPlayerId(item.player.id);
          }
        }
        break;
      case 'x':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredWatchlist.length) {
          const item = filteredWatchlist[focusedIndex];
          if (item) {
            togglePlayerSelection(item.id);
          }
        }
        break;
      case 'Escape':
        setFocusedIndex(-1);
        break;
    }
  }, [viewMode, editingNote, filteredWatchlist, focusedIndex]);

  // Attach keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation);
    return () => document.removeEventListener('keydown', handleKeyboardNavigation);
  }, [handleKeyboardNavigation]);

  // Reset focus when list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [filterTab, positionFilter, gradYearFilter]);

  const masthead = (
    <SectionMasthead eyebrow="THE WAR ROOM · RECRUITING PIPELINE" title="Pipeline" ink="pursuit">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-fw-sm border border-border-subtle bg-surface-sunken p-1">
          {VIEW_MODES.map((mode) => (
            <Button
              key={mode.value}
              variant={viewMode === mode.value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={viewMode === mode.value}
              leftIcon={mode.icon}
              onClick={() => setViewMode(mode.value)}
            >
              {mode.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/baseball/dashboard/college-interest" className="inline-flex items-center gap-2">
              <IconTrendingUp size={14} />
              College interest
            </Link>
          </Button>

          <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">Grad Year</span>
          <div className="w-36">
            <Select
              size="sm"
              aria-label="Filter by grad year"
              value={gradYearFilter || ALL_GRAD_YEARS}
              onValueChange={(v) => setGradYearFilter(!v || v === ALL_GRAD_YEARS ? '' : v)}
              options={gradYearOptions.map((o) => ({ value: o.value || ALL_GRAD_YEARS, label: o.label }))}
            />
          </div>
          {gradYearFilter && (
            <Button variant="ghost" size="sm" onClick={() => setGradYearFilter('')}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </SectionMasthead>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {masthead}
        <div className="mt-8">
          <PipelineBoardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {masthead}

      <div className="mt-8 space-y-8">
        {error && (
          <InlineNotice tone="danger" dismissible onDismiss={() => setError(null)}>
            {error}
          </InlineNotice>
        )}

        <PipelineStatsStrip watchlist={watchlist} />

        {watchlist.length === 0 ? (
          <EmptyIssue
            variant="pipeline"
            ink="pursuit"
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/baseball/dashboard/discover" className="inline-flex items-center gap-2">
                  <IconUsers size={16} />
                  Discover players
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            {viewMode === 'pipeline' && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scroll-smooth lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:snap-none">
                  {PIPELINE_STAGES.map((s) => (
                    <PipelineBoardColumn
                      key={s.id}
                      stage={s.id}
                      items={filteredByGradYear.filter((w) => w.pipeline_stage === s.id)}
                      onOpenPeek={setPeekPlayerId}
                      onQuickMove={handleQuickMove}
                      onQuickRemove={handleQuickRemove}
                    />
                  ))}
                </div>

                <DragOverlay>
                  {activeItem ? (
                    <div className="w-[260px] rotate-2 scale-105 rounded-card shadow-raise">
                      <RecruitCard
                        firstName={activeItem.player?.first_name || 'Unknown'}
                        lastName={activeItem.player?.last_name || 'Player'}
                        position={activeItem.player?.primary_position ?? undefined}
                        classYear={activeItem.player?.grad_year ? String(activeItem.player.grad_year) : undefined}
                        state={activeItem.player?.state ?? undefined}
                        topStat={headlineStat(activeItem.player)}
                        stage={getPipelineStageLabel((activeItem.pipeline_stage ?? 'watchlist') as PipelineStage)}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            {viewMode === 'position' && (
              <PositionPlanner
                watchlist={watchlist}
                gradYearFilter={gradYearFilter}
                onGradYearChange={setGradYearFilter}
              />
            )}

            {viewMode === 'list' && (
              <div className="space-y-4">
                <div className="-mx-6 overflow-x-auto px-6 lg:mx-0 lg:px-0">
                  <div className="flex items-center gap-2" role="tablist" aria-label="Filter by status">
                    {filterTabs.map((tab) => {
                      const count = tab.value === 'all'
                        ? watchlist.length
                        : watchlist.filter(w => w.pipeline_stage === tab.value).length;
                      return (
                        <Button
                          key={tab.value}
                          role="tab"
                          aria-selected={filterTab === tab.value}
                          variant={filterTab === tab.value ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setFilterTab(tab.value)}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {tab.label}
                            {count > 0 ? <InkBadge label={String(count)} tone="pursuit" /> : null}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">Position</span>
                  <div className="w-40">
                    <Select
                      size="sm"
                      aria-label="Filter by position"
                      value={positionFilter}
                      onValueChange={(v) => v && setPositionFilter(v)}
                      options={[{ value: 'all', label: 'All Positions' }, ...uniquePositions.map((pos) => ({ value: pos, label: pos }))]}
                    />
                  </div>
                  {positionFilter !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setPositionFilter('all')}>
                      Clear position filter
                    </Button>
                  )}
                </div>

                {selectedPlayers.size > 0 && (
                  <PaperCard className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-annual text-body-sm text-pursuit">
                        {selectedPlayers.size} player{selectedPlayers.size !== 1 ? 's' : ''} selected
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-48">
                          <Select
                            size="sm"
                            aria-label="Change status for selected players"
                            placeholder="Change status…"
                            value=""
                            onValueChange={(v) => v && handleBulkStatusChange(v as PipelineStage)}
                            options={statusOptions}
                          />
                        </div>
                        <IconButton
                          variant="danger"
                          size="sm"
                          aria-label="Remove selected players"
                          onClick={() => setBulkRemoveConfirm(true)}
                        >
                          <IconTrash size={16} />
                        </IconButton>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedPlayers(new Set())}>
                          Clear selection
                        </Button>
                      </div>
                    </div>
                  </PaperCard>
                )}

                {filteredWatchlist.length === 0 ? (
                  <EditorsLetter
                    ink="pursuit"
                    title={filterTab === 'all' ? 'No players match your filters.' : `No players in "${filterTabs.find(t => t.value === filterTab)?.label}."`}
                    body="Widen a filter — the rest of your pipeline is one clear away."
                    action={
                      isFiltered ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setFilterTab('all');
                            setPositionFilter('all');
                            setGradYearFilter('');
                          }}
                        >
                          Clear all filters
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    <p className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                      <kbd className="rounded-fw-sm border border-[color:var(--hairline)] bg-surface-sunken px-1.5 py-0.5 font-mono text-text-secondary">j</kbd>/
                      <kbd className="rounded-fw-sm border border-[color:var(--hairline)] bg-surface-sunken px-1.5 py-0.5 font-mono text-text-secondary">k</kbd> navigate ·{' '}
                      <kbd className="rounded-fw-sm border border-[color:var(--hairline)] bg-surface-sunken px-1.5 py-0.5 font-mono text-text-secondary">Enter</kbd> view ·{' '}
                      <kbd className="rounded-fw-sm border border-[color:var(--hairline)] bg-surface-sunken px-1.5 py-0.5 font-mono text-text-secondary">x</kbd> select
                    </p>

                    <PaperCard className="overflow-hidden p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-[color:var(--hairline)]">
                              <th className="px-3 py-3">
                                <Checkbox
                                  checked={selectedPlayers.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                                  onCheckedChange={toggleSelectAll}
                                  aria-label="Select all players"
                                />
                              </th>
                              {['Player', 'Position', 'Grad Year', 'Location', 'Status', 'Updated', 'Notes', 'Actions'].map((col) => (
                                <th
                                  key={col}
                                  className="px-3 py-3 text-left text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:var(--hairline)]">
                            {filteredWatchlist.map((item, index) => (
                              <PipelineListRow
                                key={item.id}
                                item={item}
                                focused={focusedIndex === index}
                                selected={selectedPlayers.has(item.id)}
                                editing={editingNote === item.id}
                                noteValue={noteValue}
                                onFocus={() => setFocusedIndex(index)}
                                onOpenPeek={() => setPeekPlayerId(item.player?.id || null)}
                                onToggleSelect={() => togglePlayerSelection(item.id)}
                                onStatusChange={(stage) => handleStatusChange(item.id, stage)}
                                onStartEditNote={() => startEditingNote(item.id, item.notes)}
                                onNoteValueChange={setNoteValue}
                                onSaveNote={() => handleSaveNote(item.id)}
                                onCancelNote={() => {
                                  setEditingNote(null);
                                  setNoteValue('');
                                }}
                                onViewProfile={() => item.player && setSelectedPlayer(item.player)}
                                onRemove={() => setRemoveConfirm(item.id)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </PaperCard>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Commit ceremony — fires once, on a successful drag into `committed`. */}
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

      {/* Player Detail Modal */}
      {selectedPlayer && coach?.id && (
        <PlayerDetailModal
          player={selectedPlayer}
          coachId={coach.id}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Remove Single Player Confirmation */}
      <ConfirmDialog
        open={!!removeConfirm}
        title="Remove from Pipeline"
        message="Are you sure you want to remove this player from your pipeline?"
        confirmLabel="Remove"
        variant="danger"
        isLoading={removing}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveConfirm(null)}
      />

      {/* Bulk Remove Confirmation */}
      <ConfirmDialog
        open={bulkRemoveConfirm}
        title="Remove Selected Players"
        message={`Are you sure you want to remove ${selectedPlayers.size} player(s) from your pipeline?`}
        confirmLabel="Remove All"
        variant="danger"
        isLoading={removing}
        onConfirm={handleBulkRemoveConfirm}
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

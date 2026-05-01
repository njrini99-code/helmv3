'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Header } from '@/components/layout/header';
import { PipelineColumn } from '@/components/features/pipeline-column';
import { PipelineCard } from '@/components/features/pipeline-card';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonPipeline } from '@/components/ui/skeleton-loader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PlayerDetailModal } from '@/components/coach/PlayerDetailModal';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { PositionPlanner } from '@/components/baseball/position-planner';
import { Badge } from '@/components/ui/badge';
import { IconUsers, IconTrash, IconUser, IconLayoutGrid, IconList, IconTarget, IconEye, IconStar, IconCheck, IconX as IconXCircle } from '@/components/icons';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { getFullName, cn } from '@/lib/utils';
import {
  removeFromWatchlist,
  updateWatchlistStatus,
  addWatchlistNote
} from '@/app/baseball/actions/watchlist';
import Link from 'next/link';
import type { PipelineStage, Player } from '@/lib/types';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';

const gradYearOptions = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

const statusOptions = PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label }));

const filterTabs = [
  { value: 'all', label: 'All' },
  ...PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label })),
];

type ViewMode = 'pipeline' | 'list' | 'position';

// Pipeline Stats Summary Bar Component
function PipelineStatsSummary({ watchlist }: { watchlist: Array<{ pipeline_stage: PipelineStage | null }> }) {
  const stats = useMemo(() => {
    const counts = {
      total: watchlist.length,
      watching: 0,
      highPriority: 0,
      offers: 0,
      committed: 0,
      uninterested: 0,
    };
    
    watchlist.forEach(item => {
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warm-50 border border-warm-200">
        <div className="w-9 h-9 rounded-lg bg-warm-200 flex items-center justify-center">
          <IconUsers size={18} className="text-warm-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-warm-900">{stats.total}</p>
          <p className="text-xs text-warm-500">Total</p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
          <IconEye size={18} className="text-blue-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-blue-900">{stats.watching}</p>
          <p className="text-xs text-blue-600">Watching</p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
          <IconStar size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-amber-900">{stats.highPriority}</p>
          <p className="text-xs text-amber-600">High Priority</p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200">
        <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
          <IconTarget size={18} className="text-purple-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-purple-900">{stats.offers}</p>
          <p className="text-xs text-purple-600">Offers</p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
          <IconCheck size={18} className="text-green-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-green-900">{stats.committed}</p>
          <p className="text-xs text-green-600">Committed</p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warm-50 border border-warm-200">
        <div className="w-9 h-9 rounded-lg bg-warm-200 flex items-center justify-center">
          <IconXCircle size={18} className="text-warm-500" />
        </div>
        <div>
          <p className="text-lg font-semibold text-warm-700">{stats.uninterested}</p>
          <p className="text-xs text-warm-500">Not Interested</p>
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { coach } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();
  const { watchlist, loading, updateStage, refetch } = useWatchlist();

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
  const listContainerRef = useRef<HTMLDivElement>(null);

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

    const activeItem = filteredByGradYear.find((item) => item.id === active.id);
    const newStage = over.id as PipelineStage;

    if (activeItem && activeItem.pipeline_stage !== newStage) {
      try {
        await updateStage(activeItem.player_id, newStage);
        setError(null);
        const playerName = getFullName(activeItem.player?.first_name, activeItem.player?.last_name);
        const stageLabel = statusOptions.find(o => o.value === newStage)?.label || newStage;
        showToast(`${playerName} moved to ${stageLabel}`, 'success');
      } catch (err) {
        console.error('Error updating pipeline stage:', err);
        setError('Failed to update player stage. Please try again.');
      }
    }

    setActiveId(null);
  };

  // Watchlist handlers
  async function handleStatusChange(watchlistId: string, newStatus: PipelineStage) {
    try {
      await updateWatchlistStatus(watchlistId, newStatus);
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
      await removeFromWatchlist(item.coach_id, item.player_id);
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
      await addWatchlistNote(watchlistId, noteValue);
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

  function formatDate(dateString: string | null) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      await Promise.all(
        Array.from(selectedPlayers).map(watchlistId =>
          updateWatchlistStatus(watchlistId, newStatus)
        )
      );
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

      await Promise.all(
        itemsToRemove.map(item =>
          removeFromWatchlist(item.coach_id, item.player_id)
        )
      );

      refetch();
      setSelectedPlayers(new Set());
      showToast(`${selectedPlayers.size} player(s) removed from watchlist`, 'success');
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

  // Route protection
  if (routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  if (loading) return (
    <>
      <Header title="Pipeline" subtitle="Manage your recruiting pipeline" />
      <div className="p-6 lg:p-8">
        <SkeletonPipeline />
      </div>
    </>
  );

  return (
    <>
      <Header
        title="Pipeline"
        subtitle={watchlist.length === 0 ? 'Manage your recruiting pipeline' : `${watchlist.length} player${watchlist.length !== 1 ? 's' : ''} total`}
      />
      <div className="p-6 lg:p-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pipeline Stats Summary */}
        <PipelineStatsSummary watchlist={watchlist} />

        {/* View Toggle Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-1 p-1 bg-warm-100 rounded-lg overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setViewMode('pipeline')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap min-h-[44px]',
                viewMode === 'pipeline'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              <IconLayoutGrid size={16} />
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('position')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap min-h-[44px]',
                viewMode === 'position'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              <IconTarget size={16} />
              <span className="hidden sm:inline">Position Planner</span>
              <span className="sm:hidden">Planner</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap min-h-[44px]',
                viewMode === 'list'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              <IconList size={16} />
              List
            </button>
          </div>

          {/* Grad Year Filter (shared) */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-warm-700 whitespace-nowrap">Grad Year:</label>
            <Select
              options={gradYearOptions}
              value={gradYearFilter}
              onChange={(value) => setGradYearFilter(value)}
              className="w-36 text-base"
            />
            {gradYearFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGradYearFilter('')}
                className="min-h-[44px]"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Empty State Banner */}
        {watchlist.length === 0 && (
          <div className="relative glass-standard rounded-2xl p-8 mb-6 text-center overflow-clip">
            <ShineEffect />
            <IconUsers size={32} className="mx-auto mb-3 text-primary-600" />
            <h3 className="text-lg font-semibold tracking-tight text-warm-900 mb-2">Your pipeline is empty</h3>
            <p className="text-sm leading-relaxed text-warm-600 mb-4">
              Start by adding players to your watchlist from the Discover page.
            </p>
            <Link href="/baseball/dashboard/discover">
              <Button>Discover Players</Button>
            </Link>
          </div>
        )}

        {/* Pipeline (Kanban) View */}
        {viewMode === 'pipeline' && watchlist.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex lg:grid lg:grid-cols-7 gap-4 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:px-0 lg:overflow-visible snap-x snap-mandatory lg:snap-none scroll-smooth">
              {PIPELINE_STAGES.map((s) => (
                <PipelineColumn
                  key={s.id}
                  stage={s.id}
                  items={filteredByGradYear.filter((w) => w.pipeline_stage === s.id)}
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? (
                <div className="opacity-90 rotate-[2deg] scale-105 shadow-xl">
                  <PipelineCard item={activeItem} isDragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Position Planner View */}
        {viewMode === 'position' && watchlist.length > 0 && (
          <PositionPlanner
            watchlist={watchlist}
            gradYearFilter={gradYearFilter}
            onGradYearChange={setGradYearFilter}
          />
        )}

        {/* List (Table) View */}
        {viewMode === 'list' && watchlist.length > 0 && (
          <>
            {/* Status Filter Tabs with count badges */}
            <div className="flex items-center gap-2 mb-6 border-b border-warm-200 overflow-x-auto scrollbar-hide -mx-6 px-6 lg:mx-0 lg:px-0" role="tablist" aria-label="Filter by status">
              {filterTabs.map(tab => {
                const count = tab.value === 'all'
                  ? watchlist.length
                  : watchlist.filter(w => w.pipeline_stage === tab.value).length;
                return (
                  <button
                    key={tab.value}
                    role="tab"
                    aria-selected={filterTab === tab.value}
                    onClick={() => setFilterTab(tab.value)}
                    className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0 min-h-[44px] flex items-center gap-1.5 ${
                      filterTab === tab.value
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-warm-600 hover:text-warm-900'
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full ${
                        filterTab === tab.value
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-warm-100 text-warm-500'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Additional Filters */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-warm-700">Position:</label>
                <Select
                  options={[
                    { value: 'all', label: 'All Positions' },
                    ...uniquePositions.map(pos => ({ value: pos, label: pos }))
                  ]}
                  value={positionFilter}
                  onChange={(value) => setPositionFilter(value)}
                  className="w-40 text-sm"
                />
              </div>
              {positionFilter !== 'all' && (
                <button
                  onClick={() => setPositionFilter('all')}
                  className="text-sm leading-relaxed text-warm-600 hover:text-warm-900 underline"
                >
                  Clear position filter
                </button>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {selectedPlayers.size > 0 && (
              <div className="relative glass-standard rounded-2xl p-5 mb-6 overflow-clip">
                <ShineEffect />
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-primary-700">
                    {selectedPlayers.size} player{selectedPlayers.size !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex items-center gap-3">
                    <Select
                      options={[{ value: '', label: 'Change status...' }, ...statusOptions]}
                      value=""
                      onChange={(value) => {
                        if (value) {
                          handleBulkStatusChange(value as PipelineStage);
                        }
                      }}
                      className="w-48 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBulkRemoveConfirm(true)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors active:bg-red-100"
                    >
                      Remove Selected
                    </Button>
                    <button
                      onClick={() => setSelectedPlayers(new Set())}
                      className="text-sm leading-relaxed text-warm-600 hover:text-warm-900 underline"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
              </div>
            )}

            {filteredWatchlist.length === 0 ? (
              <EmptyState
                icon={<IconUser size={24} />}
                title={filterTab === 'all' ? 'No players match filters' : `No players in "${filterTabs.find(t => t.value === filterTab)?.label}"`}
                description="Try adjusting your filters or add more players to your pipeline."
              />
            ) : (
              <>
                {/* Mobile card view */}
                <div className="lg:hidden space-y-4">
                  {filteredWatchlist.map((item) => (
                    <div key={item.id} className="bg-white rounded-xl border border-warm-200 p-4 shadow-sm">
                      {/* Player header */}
                      <div className="flex items-start gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={selectedPlayers.has(item.id)}
                          onChange={() => togglePlayerSelection(item.id)}
                          className="mt-1 rounded border-warm-300 text-primary-600 focus:ring-primary-500 w-5 h-5"
                        />
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setPeekPlayerId(item.player?.id || null)}
                        >
                          <Avatar
                            src={item.player?.avatar_url}
                            name={getFullName(item.player?.first_name, item.player?.last_name)}
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-warm-900 truncate">
                              {getFullName(item.player?.first_name, item.player?.last_name)}
                            </h3>
                            <p className="text-sm text-warm-500">
                              {item.player?.primary_position || 'N/A'} {item.player?.grad_year ? `\u2022 ${item.player.grad_year}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            item.pipeline_stage === 'committed' ? 'success'
                              : item.pipeline_stage === 'high_priority' ? 'warning'
                              : item.pipeline_stage === 'offer_extended' ? 'primary'
                              : item.pipeline_stage === 'uninterested' ? 'danger'
                              : 'secondary'
                          }
                        >
                          {statusOptions.find(o => o.value === item.pipeline_stage)?.label || 'Watching'}
                        </Badge>
                      </div>

                      {/* Quick stats */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 text-sm">
                        <div>
                          <span className="text-warm-500">Location:</span>
                          <span className="ml-1 text-warm-900">
                            {item.player?.city && item.player?.state ? `${item.player.city}, ${item.player.state}` : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-warm-500">Updated:</span>
                          <span className="ml-1 text-warm-900">{formatDate(item.updated_at)}</span>
                        </div>
                      </div>

                      {/* Notes preview */}
                      {item.notes && (
                        <p className="text-sm text-warm-600 line-clamp-2 mb-3 bg-warm-50 rounded-lg px-3 py-2">
                          {item.notes}
                        </p>
                      )}

                      {/* Note editing inline */}
                      {editingNote === item.id && (
                        <div className="mb-3 space-y-2">
                          <textarea
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            placeholder="Add notes about this player..."
                            className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 placeholder:text-warm-400 transition-colors resize-none text-base"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveNote(item.id)} className="flex-1 min-h-[44px]">Save</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingNote(null); setNoteValue(''); }} className="flex-1 min-h-[44px]">Cancel</Button>
                          </div>
                        </div>
                      )}

                      {/* Status select */}
                      <div className="mb-3">
                        <Select
                          options={statusOptions}
                          value={item.pipeline_stage ?? undefined}
                          onChange={(value) => handleStatusChange(item.id, value as PipelineStage)}
                          className="w-full text-base"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => item.player && setSelectedPlayer(item.player)}
                          className="flex-1 min-h-[44px]"
                        >
                          View Profile
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEditingNote(item.id, item.notes)}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          {item.notes ? 'Edit Note' : 'Add Note'}
                        </Button>
                        <button
                          onClick={() => setRemoveConfirm(item.id)}
                          className="min-h-[44px] min-w-[44px] rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors flex items-center justify-center"
                          aria-label="Remove from pipeline"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Keyboard shortcuts hint */}
                {viewMode === 'list' && (
                  <p className="text-xs text-warm-400 mb-3">
                    <span className="hidden lg:inline">
                      <kbd className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 font-mono">j</kbd>/<kbd className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 font-mono">k</kbd> navigate • <kbd className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 font-mono">Enter</kbd> view • <kbd className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 font-mono">x</kbd> select
                    </span>
                  </p>
                )}

                {/* Desktop table view */}
                <div ref={listContainerRef} className="hidden lg:block bg-white rounded-2xl border border-warm-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-warm-200 bg-warm-50">
                        <th className="px-4 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={selectedPlayers.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Player</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Position</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Grad Year</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Location</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Status</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Updated</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Notes</th>
                        <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-200">
                      {filteredWatchlist.map((item, index) => (
                        <React.Fragment key={item.id}>
                          <tr 
                            className={cn(
                              'hover:bg-warm-50 active:bg-warm-100 transition-colors',
                              focusedIndex === index && 'bg-primary-50 ring-2 ring-inset ring-primary-500'
                            )}
                            onClick={() => setFocusedIndex(index)}
                          >
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedPlayers.has(item.id)}
                                onChange={() => togglePlayerSelection(item.id)}
                                className="rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={() => setPeekPlayerId(item.player?.id || null)}
                              >
                                <Avatar
                                  src={item.player?.avatar_url}
                                  name={getFullName(item.player?.first_name, item.player?.last_name)}
                                  size="md"
                                />
                                <div>
                                  <p className="text-sm font-medium text-warm-900 group-hover:text-primary-600 transition-colors">
                                    {getFullName(item.player?.first_name, item.player?.last_name)}
                                  </p>
                                  <p className="text-xs text-warm-500">
                                    {item.player?.high_school_name || 'No school'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600">
                              {item.player?.primary_position}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600">
                              {item.player?.grad_year}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600">
                              {item.player?.city && item.player?.state ? `${item.player.city}, ${item.player.state}` : 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              <Select
                                options={statusOptions}
                                value={item.pipeline_stage ?? undefined}
                                onChange={(value) => handleStatusChange(item.id, value as PipelineStage)}
                                className="w-44 text-sm"
                              />
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-500">
                              {formatDate(item.updated_at)}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => startEditingNote(item.id, item.notes)}
                                className="text-xs text-warm-600 hover:text-warm-900 underline max-w-[120px] truncate block"
                                title={item.notes || 'Add note'}
                              >
                                {item.notes ? (item.notes.length > 20 ? item.notes.substring(0, 20) + '...' : item.notes) : 'Add note'}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => item.player && setSelectedPlayer(item.player)}
                                >
                                  View
                                </Button>
                                <button
                                  onClick={() => setRemoveConfirm(item.id)}
                                  className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                                  aria-label="Remove from watchlist"
                                >
                                  <IconTrash size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editingNote === item.id && (
                            <tr>
                              <td colSpan={9} className="px-6 py-4 bg-warm-50">
                                <div className="flex items-start gap-3">
                                  <textarea
                                    value={noteValue}
                                    onChange={(e) => setNoteValue(e.target.value)}
                                    placeholder="Add notes about this player..."
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 placeholder:text-warm-400 transition-colors resize-none"
                                    rows={3}
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleSaveNote(item.id)}>
                                      Save
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingNote(null);
                                        setNoteValue('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

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
    </>
  );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { IconUsers, IconTrash, IconUser, IconLayoutGrid, IconList, IconTarget } from '@/components/icons';
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

const stages: PipelineStage[] = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'];

const gradYearOptions = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

const statusOptions = [
  { value: 'watchlist', label: 'Watching' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'offer_extended', label: 'Offer Extended' },
  { value: 'committed', label: 'Committed' },
  { value: 'uninterested', label: 'Not Interested' }
];

const filterTabs = [
  { value: 'all', label: 'All' },
  { value: 'watchlist', label: 'Watching' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'offer_extended', label: 'Offers' },
  { value: 'committed', label: 'Committed' },
  { value: 'uninterested', label: 'Not Interested' }
];

type ViewMode = 'pipeline' | 'list' | 'position';

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

        {/* View Toggle Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('pipeline')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                viewMode === 'pipeline'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <IconLayoutGrid size={16} />
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('position')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                viewMode === 'position'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <IconTarget size={16} />
              Position Planner
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <IconList size={16} />
              List View
            </button>
          </div>

          {/* Grad Year Filter (shared) */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Grad Year:</label>
            <Select
              options={gradYearOptions}
              value={gradYearFilter}
              onChange={(value) => setGradYearFilter(value)}
              className="w-36"
            />
            {gradYearFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGradYearFilter('')}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Empty State Banner */}
        {watchlist.length === 0 && (
          <div className="relative glass-standard rounded-2xl p-8 mb-6 text-center overflow-hidden">
            <ShineEffect />
            <IconUsers size={32} className="mx-auto mb-3 text-green-600" />
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">Your pipeline is empty</h3>
            <p className="text-sm leading-relaxed text-slate-600 mb-4">
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
            <div className="grid grid-cols-5 gap-4">
              {stages.map((stage) => (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  items={filteredByGradYear.filter((w) => w.pipeline_stage === stage)}
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? (
                <div className="opacity-90">
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
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-2 mb-6 border-b border-slate-200" role="tablist" aria-label="Filter by status">
              {filterTabs.map(tab => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={filterTab === tab.value}
                  onClick={() => setFilterTab(tab.value)}
                  className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
                    filterTab === tab.value
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Additional Filters */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Position:</label>
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
                  className="text-sm leading-relaxed text-slate-600 hover:text-slate-900 underline"
                >
                  Clear position filter
                </button>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {selectedPlayers.size > 0 && (
              <div className="relative glass-standard rounded-2xl p-5 mb-6 overflow-hidden">
                <ShineEffect />
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-700">
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
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Remove Selected
                    </Button>
                    <button
                      onClick={() => setSelectedPlayers(new Set())}
                      className="text-sm leading-relaxed text-slate-600 hover:text-slate-900 underline"
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
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 w-12">
                        <input
                          type="checkbox"
                          checked={selectedPlayers.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Player</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Position</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Grad Year</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Location</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Updated</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Notes</th>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredWatchlist.map((item) => (
                      <>
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedPlayers.has(item.id)}
                              onChange={() => togglePlayerSelection(item.id)}
                              className="rounded border-slate-300 text-green-600 focus:ring-green-500"
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
                                <p className="text-sm font-medium text-slate-900 group-hover:text-green-600 transition-colors">
                                  {getFullName(item.player?.first_name, item.player?.last_name)}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {item.player?.high_school_name || 'No school'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.player?.primary_position}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.player?.grad_year}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.player?.city && item.player?.state ? `${item.player.city}, ${item.player.state}` : 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <Select
                              options={statusOptions}
                              value={item.pipeline_stage}
                              onChange={(value) => handleStatusChange(item.id, value as PipelineStage)}
                              className="w-44 text-sm"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {formatDate(item.updated_at)}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => startEditingNote(item.id, item.notes)}
                              className="text-xs text-slate-600 hover:text-slate-900 underline max-w-[120px] truncate block"
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
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                aria-label="Remove from watchlist"
                              >
                                <IconTrash size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editingNote === item.id && (
                          <tr key={`note-${item.id}`}>
                            <td colSpan={9} className="px-6 py-4 bg-slate-50">
                              <div className="flex items-start gap-3">
                                <textarea
                                  value={noteValue}
                                  onChange={(e) => setNoteValue(e.target.value)}
                                  placeholder="Add notes about this player..."
                                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
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
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
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

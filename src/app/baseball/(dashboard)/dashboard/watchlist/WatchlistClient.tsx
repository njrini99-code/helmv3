'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { ShineEffect } from '@/components/ui/shine-effect';
import { useToast } from '@/components/ui/toast';
import {
  IconSearch,
  IconFilter,
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
import { getFullName } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { PipelineStage, Player } from '@/lib/types';

// Sortable columns
type SortKey = 'name' | 'position' | 'state' | 'gradYear' | 'stage' | 'dateAdded';
type SortDirection = 'asc' | 'desc';

const stageOptions: { value: PipelineStage | ''; label: string }[] = [
  { value: '', label: 'All Stages' },
  { value: 'watchlist', label: 'Watching' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'offer_extended', label: 'Offer Extended' },
  { value: 'committed', label: 'Committed' },
  { value: 'uninterested', label: 'Not Interested' },
];

const stageLabels: Record<string, string> = {
  watchlist: 'Watching',
  high_priority: 'High Priority',
  offer_extended: 'Offer Extended',
  committed: 'Committed',
  uninterested: 'Not Interested',
};

const gradYearOptions = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

export function WatchlistClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const { coach } = useAuth();
  const { watchlist, loading, refetch } = useWatchlist();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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

  // Player search for add modal
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  // Peek panel
  const [peekPlayerId, setPeekPlayerId] = useState<string | null>(null);

  // Loading states
  const [removing, setRemoving] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

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
      await removeFromWatchlist(item.coach_id, item.player_id);
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
      await Promise.all(
        itemsToRemove.map(item => removeFromWatchlist(item.coach_id, item.player_id))
      );
      refetch();
      setSelectedIds(new Set());
      showToast(`${selectedIds.size} player(s) removed`, 'success');
    } catch {
      showToast('Failed to remove some players', 'error');
    } finally {
      setRemoving(false);
      setBulkRemoveConfirm(false);
    }
  };

  const handleBulkStageChange = async (stage: PipelineStage) => {
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => updateWatchlistStatus(id, stage))
      );
      refetch();
      setSelectedIds(new Set());
      setBulkStageModal(false);
      showToast(`${selectedIds.size} player(s) moved to ${stageLabels[stage]}`, 'success');
    } catch {
      showToast('Failed to update some players', 'error');
    }
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setSavingNote(true);
    try {
      await addWatchlistNote(noteModal.id, noteModal.note);
      refetch();
      setNoteModal(null);
      showToast('Note saved', 'success');
    } catch {
      showToast('Failed to save note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleStageChange = async (watchlistId: string, stage: PipelineStage) => {
    try {
      await updateWatchlistStatus(watchlistId, stage);
      refetch();
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
      await addToWatchlist(coach.id, player.id);
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
      stageLabels[item.pipeline_stage || 'watchlist'],
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const SortableHeader = ({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyValue)}
      className="flex items-center gap-1 text-left text-label font-medium uppercase tracking-wider text-warm-500 hover:text-warm-700 transition-colors"
    >
      {label}
      {sortKey === sortKeyValue && (
        sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
      )}
    </button>
  );

  const clearFilters = () => {
    setSearchQuery('');
    setPositionFilter('');
    setStateFilter('');
    setGradYearFilter('');
    setStageFilter('');
  };

  const hasActiveFilters = searchQuery || positionFilter || stateFilter || gradYearFilter || stageFilter;

  if (loading) {
    return null; // loading.tsx handles this
  }

  return (
    <>
      <Header
        title="Watchlist"
        subtitle={watchlist.length === 0 
          ? 'Track and manage your recruiting prospects' 
          : `${watchlist.length} player${watchlist.length !== 1 ? 's' : ''} in your watchlist`
        }
      />

      <div className="p-6 lg:p-8">
        {/* Empty State */}
        {watchlist.length === 0 ? (
          <Card variant="glass">
            <CardContent className="p-8 text-center relative overflow-hidden">
              <ShineEffect />
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <IconUsers size={32} className="text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-warm-900 mb-2">
                  Your watchlist is empty
                </h2>
                <p className="text-sm leading-relaxed text-warm-600 mb-6">
                  Start building your recruiting pipeline by adding players from the Discover page 
                  or search for players below.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={() => router.push('/baseball/dashboard/discover')}>
                    Discover Players
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddModal(true)}>
                    <IconPlus size={16} className="mr-2" />
                    Quick Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or school..."
                  className="pl-9"
                />
              </div>

              <Select
                options={[{ value: '', label: 'All Positions' }, ...uniquePositions.map(p => ({ value: p, label: p }))]}
                value={positionFilter}
                onChange={setPositionFilter}
                className="w-36"
              />

              <Select
                options={[{ value: '', label: 'All States' }, ...uniqueStates.map(s => ({ value: s, label: s }))]}
                value={stateFilter}
                onChange={setStateFilter}
                className="w-36"
              />

              <Select
                options={gradYearOptions}
                value={gradYearFilter}
                onChange={setGradYearFilter}
                className="w-32"
              />

              <Select
                options={stageOptions}
                value={stageFilter}
                onChange={(v) => setStageFilter(v as PipelineStage | '')}
                className="w-40"
              />

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <IconX size={14} className="mr-1" />
                  Clear
                </Button>
              )}

              <div className="flex-1" />

              <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
                <IconPlus size={16} className="mr-1.5" />
                Add Player
              </Button>

              <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                <IconDownload size={16} className="mr-1.5" />
                Export CSV
              </Button>
            </div>

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
              <div className="relative glass-standard rounded-2xl p-4 mb-6 overflow-clip">
                <ShineEffect />
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-primary-700">
                    {selectedIds.size} player{selectedIds.size !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setBulkStageModal(true)}
                    >
                      Move Stage
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const note = prompt('Enter note for selected players:');
                        if (note) {
                          Promise.all(
                            Array.from(selectedIds).map(id => addWatchlistNote(id, note))
                          ).then(() => {
                            refetch();
                            setSelectedIds(new Set());
                            showToast('Notes added', 'success');
                          });
                        }
                      }}
                    >
                      Add Note
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBulkRemoveConfirm(true)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <IconTrash size={14} className="mr-1" />
                      Remove
                    </Button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-sm text-warm-600 hover:text-warm-900 underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {filteredWatchlist.length === 0 ? (
              <EmptyState
                icon={<IconFilter size={24} />}
                title="No players match your filters"
                description="Try adjusting your filter criteria or clear filters to see all players."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="lg:hidden space-y-4">
                  {filteredWatchlist.map(item => (
                    <div key={item.id} className="bg-white rounded-xl border border-warm-200 p-4 shadow-sm">
                      <div className="flex items-start gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
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
                            <p className="text-sm text-warm-500 truncate">
                              {item.player?.primary_position} • {item.player?.grad_year}
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
                          {stageLabels[item.pipeline_stage || 'watchlist']}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                        <div>
                          <span className="text-warm-500">Location:</span>
                          <span className="ml-1 text-warm-900">
                            {item.player?.state || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-warm-500">Added:</span>
                          <span className="ml-1 text-warm-900">
                            {formatDate(item.added_at || item.created_at)}
                          </span>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-sm text-warm-600 line-clamp-2 mb-3 bg-warm-50 rounded-lg px-3 py-2">
                          {item.notes}
                        </p>
                      )}

                      <div className="mb-3">
                        <Select
                          options={stageOptions.filter(s => s.value !== '')}
                          value={item.pipeline_stage || 'watchlist'}
                          onChange={(v) => handleStageChange(item.id, v as PipelineStage)}
                          className="w-full"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setPeekPlayerId(item.player?.id || null)}
                          className="flex-1 min-h-[44px]"
                        >
                          <IconEye size={14} className="mr-1" />
                          View
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setNoteModal({ id: item.id, note: item.notes || '' })}
                          className="min-h-[44px]"
                        >
                          <IconNote size={14} className="mr-1" />
                          Note
                        </Button>
                        <button
                          onClick={() => setRemoveConfirm(item.id)}
                          className="min-h-[44px] min-w-[44px] rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white rounded-2xl border border-warm-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-warm-200 bg-warm-50">
                          <th className="px-4 py-3 w-12">
                            <input
                              type="checkbox"
                              checked={selectedIds.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                              onChange={toggleSelectAll}
                              className="rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                            />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Player" sortKeyValue="name" />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Position" sortKeyValue="position" />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="State" sortKeyValue="state" />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Grad Year" sortKeyValue="gradYear" />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Stage" sortKeyValue="stage" />
                          </th>
                          <th className="px-6 py-3 text-left">
                            <SortableHeader label="Date Added" sortKeyValue="dateAdded" />
                          </th>
                          <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-500">
                            Notes
                          </th>
                          <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-500">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-100">
                        {filteredWatchlist.map(item => (
                          <tr key={item.id} className="hover:bg-warm-50 transition-colors">
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelection(item.id)}
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
                              {item.player?.primary_position || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600">
                              {item.player?.state || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600">
                              {item.player?.grad_year || '—'}
                            </td>
                            <td className="px-6 py-4">
                              <Select
                                options={stageOptions.filter(s => s.value !== '')}
                                value={item.pipeline_stage || 'watchlist'}
                                onChange={(v) => handleStageChange(item.id, v as PipelineStage)}
                                className="w-40 text-sm"
                              />
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-500">
                              {formatDate(item.added_at || item.created_at)}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => setNoteModal({ id: item.id, note: item.notes || '' })}
                                className="text-xs text-warm-600 hover:text-warm-900 underline max-w-[120px] truncate block"
                                title={item.notes || 'Add note'}
                              >
                                {item.notes 
                                  ? (item.notes.length > 20 ? item.notes.substring(0, 20) + '...' : item.notes)
                                  : 'Add note'
                                }
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPeekPlayerId(item.player?.id || null)}
                                >
                                  <IconEye size={14} className="mr-1" />
                                  View
                                </Button>
                                <button
                                  onClick={() => setRemoveConfirm(item.id)}
                                  className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <IconTrash size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Results count */}
                <div className="mt-4 text-sm text-warm-500 text-center">
                  Showing {filteredWatchlist.length} of {watchlist.length} players
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Add Player Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setPlayerSearchQuery('');
          setPlayerSearchResults([]);
        }}
        title="Add Player to Watchlist"
        size="md"
      >
        <div className="space-y-4">
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
            <Input
              value={playerSearchQuery}
              onChange={(e) => {
                setPlayerSearchQuery(e.target.value);
                searchPlayers(e.target.value);
              }}
              placeholder="Search by name or school..."
              className="pl-9"
              autoFocus
            />
          </div>

          {searchingPlayers && (
            <p className="text-sm text-warm-500">Searching...</p>
          )}

          {playerSearchResults.length > 0 && (
            <div className="border border-warm-200 rounded-lg divide-y divide-warm-100 max-h-64 overflow-y-auto">
              {playerSearchResults.map(player => (
                <button
                  key={player.id}
                  onClick={() => handleAddPlayer(player)}
                  disabled={addingPlayer}
                  className="w-full flex items-center gap-3 p-3 hover:bg-warm-50 transition-colors text-left disabled:opacity-50"
                >
                  <Avatar
                    name={getFullName(player.first_name, player.last_name)}
                    src={player.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 truncate">
                      {getFullName(player.first_name, player.last_name)}
                    </p>
                    <p className="text-xs text-warm-500 truncate">
                      {player.primary_position} • {player.grad_year} • {player.high_school_name}
                    </p>
                  </div>
                  <IconPlus size={16} className="text-primary-600" />
                </button>
              ))}
            </div>
          )}

          {playerSearchQuery.length >= 2 && playerSearchResults.length === 0 && !searchingPlayers && (
            <p className="text-sm text-warm-500 text-center py-4">
              No players found matching &quot;{playerSearchQuery}&quot;
            </p>
          )}

          <div className="pt-4 border-t border-warm-200">
            <p className="text-xs text-warm-500 text-center">
              Or <button onClick={() => { setShowAddModal(false); router.push('/baseball/dashboard/discover'); }} className="text-primary-600 hover:underline">browse all players</button>
            </p>
          </div>
        </div>
      </Modal>

      {/* Note Modal */}
      <Modal
        isOpen={!!noteModal}
        onClose={() => setNoteModal(null)}
        title="Edit Note"
        size="md"
      >
        {noteModal && (
          <div className="space-y-4">
            <Textarea
              value={noteModal.note}
              onChange={(e) => setNoteModal({ ...noteModal, note: e.target.value })}
              placeholder="Add notes about this player..."
              rows={4}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setNoteModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Stage Change Modal */}
      <Modal
        isOpen={bulkStageModal}
        onClose={() => setBulkStageModal(false)}
        title="Move to Stage"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600 mb-4">
            Move {selectedIds.size} player{selectedIds.size !== 1 ? 's' : ''} to:
          </p>
          {stageOptions.filter(s => s.value !== '').map(option => (
            <button
              key={option.value}
              onClick={() => handleBulkStageChange(option.value as PipelineStage)}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-warm-50 transition-colors border border-warm-200"
            >
              {option.label}
            </button>
          ))}
        </div>
      </Modal>

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
    </>
  );
}

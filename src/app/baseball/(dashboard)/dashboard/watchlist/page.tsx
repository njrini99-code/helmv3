'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading } from '@/components/ui/loading';
import { PageLoading } from '@/components/ui/loading';
import { Avatar } from '@/components/ui/avatar';
import { IconTrash, IconUser } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { PlayerDetailModal } from '@/components/coach/PlayerDetailModal';
import { useAuth } from '@/hooks/use-auth';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import { getFullName } from '@/lib/utils';
import {
  removeFromWatchlist,
  updateWatchlistStatus,
  addWatchlistNote
} from '@/app/baseball/actions/watchlist';
import type { Watchlist, Player, PipelineStage } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type WatchlistWithPlayer = Watchlist & { player: Player };

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

export default function WatchlistPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { coach, loading: authLoading } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();
  const [watchlist, setWatchlist] = useState<WatchlistWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [filterTab, setFilterTab] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [gradYearFilter, setGradYearFilter] = useState('all');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!authLoading && !routeLoading && isAllowed && coach?.id) {
      fetchWatchlist();
    } else if (!authLoading && !routeLoading && !coach) {
      setLoading(false);
    }
  }, [authLoading, routeLoading, isAllowed, coach?.id]);

  // Route protection - show loading while checking or redirecting
  if (authLoading || routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  async function fetchWatchlist() {
    if (!coach?.id) return;

    setLoading(true);
    const supabase = createClient();

    // Fetch watchlist with player details
    const { data, error } = await supabase
      .from('watchlists')
      .select(`
        id,
        coach_id,
        player_id,
        pipeline_stage,
        notes,
        priority,
        tags,
        added_at,
        created_at,
        updated_at,
        player:players (*)
      `)
      .eq('coach_id', coach.id)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching watchlist:', error);
      setLoading(false);
      return;
    }

    setWatchlist(data as WatchlistWithPlayer[]);
    setLoading(false);
  }

  const filteredWatchlist = watchlist.filter(item => {
    // Status filter
    if (filterTab !== 'all' && item.pipeline_stage !== filterTab) return false;
    // Position filter
    if (positionFilter !== 'all' && item.player.primary_position !== positionFilter) return false;
    // Grad year filter
    if (gradYearFilter !== 'all' && item.player.grad_year?.toString() !== gradYearFilter) return false;
    return true;
  });

  // Get unique positions and grad years for filters
  const uniquePositions = Array.from(new Set(watchlist.map(item => item.player.primary_position).filter((pos): pos is string => Boolean(pos))));
  const uniqueGradYears = Array.from(new Set(watchlist.map(item => item.player.grad_year).filter((year): year is number => Boolean(year)))).sort();

  async function handleStatusChange(watchlistId: string, newStatus: PipelineStage) {
    try {
      await updateWatchlistStatus(watchlistId, newStatus);
      // Update local state
      setWatchlist(prev => prev.map(item =>
        item.id === watchlistId
          ? { ...item, pipeline_stage: newStatus }
          : item
      ));
    } catch (error) {
      console.error('Error updating status:', error);
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
      // Update local state
      setWatchlist(prev => prev.filter(item => item.id !== removeConfirm));
      showToast('Player removed from watchlist', 'success');
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      showToast('Failed to remove from watchlist', 'error');
    } finally {
      setRemoving(false);
      setRemoveConfirm(null);
    }
  }

  async function handleSaveNote(watchlistId: string) {
    try {
      await addWatchlistNote(watchlistId, noteValue);
      // Update local state
      setWatchlist(prev => prev.map(item =>
        item.id === watchlistId
          ? { ...item, notes: noteValue }
          : item
      ));
      setEditingNote(null);
      setNoteValue('');
    } catch (error) {
      console.error('Error saving note:', error);
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

      setWatchlist(prev => prev.map(item =>
        selectedPlayers.has(item.id)
          ? { ...item, pipeline_stage: newStatus }
          : item
      ));

      setSelectedPlayers(new Set());
    } catch (error) {
      console.error('Error bulk updating status:', error);
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

      setWatchlist(prev => prev.filter(item => !selectedPlayers.has(item.id)));
      setSelectedPlayers(new Set());
      showToast(`${selectedPlayers.size} player(s) removed from watchlist`, 'success');
    } catch (error) {
      console.error('Error bulk removing:', error);
      showToast('Failed to remove some players', 'error');
    } finally {
      setRemoving(false);
      setBulkRemoveConfirm(false);
    }
  }

  if (authLoading) return <PageLoading />;

  if (!coach) {
    return (
      <>
        <Header title="Watchlist" subtitle="Coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Please log in as a coach to access watchlist.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Watchlist"
        subtitle={`${filteredWatchlist.length} player${filteredWatchlist.length !== 1 ? 's' : ''}`}
      />

      <div className="p-8">
        {/* Filter Tabs */}
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
        {!loading && watchlist.length > 0 && (
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
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Grad Year:</label>
              <Select
                options={[
                  { value: 'all', label: 'All Years' },
                  ...uniqueGradYears.map(year => ({ value: year.toString(), label: year.toString() }))
                ]}
                value={gradYearFilter}
                onChange={(value) => setGradYearFilter(value)}
                className="w-32 text-sm"
              />
            </div>
            {(positionFilter !== 'all' || gradYearFilter !== 'all') && (
              <button
                onClick={() => {
                  setPositionFilter('all');
                  setGradYearFilter('all');
                }}
                className="text-sm text-slate-600 hover:text-slate-900 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedPlayers.size > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <p className="text-sm font-medium text-green-900">
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
                className="text-sm text-slate-600 hover:text-slate-900 underline"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : filteredWatchlist.length === 0 ? (
          <EmptyState
            icon={<IconUser size={24} />}
            title={filterTab === 'all' ? 'No players in watchlist' : `No players in "${filterTabs.find(t => t.value === filterTab)?.label}"`}
            description={filterTab === 'all'
              ? "Start discovering players and add them to your watchlist to track your recruiting pipeline."
              : "No players match this filter."}
            action={filterTab === 'all' && (
              <Button onClick={() => router.push('/baseball/dashboard/discover')}>
                Discover Players
              </Button>
            )}
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
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Grad Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Last Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
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
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={item.player.avatar_url}
                            name={getFullName(item.player.first_name, item.player.last_name)}
                            size="md"
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {getFullName(item.player.first_name, item.player.last_name)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.player.high_school_name || 'No school'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.player.primary_position}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.player.grad_year}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.player.city && item.player.state ? `${item.player.city}, ${item.player.state}` : 'N/A'}
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
                            onClick={() => setSelectedPlayer(item.player)}
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
                      <tr>
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
                              <Button
                                size="sm"
                                onClick={() => handleSaveNote(item.id)}
                              >
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
        title="Remove from Watchlist"
        message="Are you sure you want to remove this player from your watchlist?"
        confirmLabel="Remove"
        variant="danger"
        loading={removing}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveConfirm(null)}
      />

      {/* Bulk Remove Confirmation */}
      <ConfirmDialog
        open={bulkRemoveConfirm}
        title="Remove Selected Players"
        message={`Are you sure you want to remove ${selectedPlayers.size} player(s) from your watchlist?`}
        confirmLabel="Remove All"
        variant="danger"
        loading={removing}
        onConfirm={handleBulkRemoveConfirm}
        onCancel={() => setBulkRemoveConfirm(false)}
      />
    </>
  );
}

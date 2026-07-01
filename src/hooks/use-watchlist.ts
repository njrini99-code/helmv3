'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/components/ui/sonner';
import {
  addToWatchlist as addToWatchlistAction,
  removeFromWatchlist as removeFromWatchlistAction,
  updateWatchlistStatus,
  addWatchlistNote,
} from '@/app/baseball/actions/watchlist';
import type { WatchlistWithPlayer, PipelineStage } from '@/lib/types';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchWatchlist = useCallback(async () => {
    if (!coach) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase
        .from('baseball_watchlists')
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
          player:baseball_players(*)
        `)
        .eq('coach_id', coach.id)
        .order('priority', { ascending: false });

      setWatchlist((data || []) as WatchlistWithPlayer[]);
    } catch (err) {
      console.error('[useWatchlist] fetchWatchlist failed:', err);
      setWatchlist([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 13). Adding it would noise the dep array without changing behavior.
  }, [coach]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const addToWatchlist = async (playerId: string) => {
    if (!coach) {
      toast.error('Authentication required', 'Please sign in to add players to your watchlist');
      return false;
    }

    const result = await addToWatchlistAction(coach.id, playerId);

    if (!result.success) {
      toast.error('Failed to add player', result.message || 'Could not add player to watchlist. Please try again.');
      return false;
    }

    toast.success('Player added', 'Successfully added to your watchlist');
    fetchWatchlist();
    return true;
  };

  const removeFromWatchlist = async (playerId: string) => {
    if (!coach) {
      toast.error('Authentication required', 'Please sign in to manage your watchlist');
      return false;
    }

    const result = await removeFromWatchlistAction(coach.id, playerId);

    if (!result.success) {
      toast.error('Failed to remove player', result.message || 'Could not remove player from watchlist. Please try again.');
      return false;
    }

    toast.success('Player removed', 'Successfully removed from your watchlist');
    fetchWatchlist();
    return true;
  };

  const updateStage = async (playerId: string, stage: PipelineStage) => {
    if (!coach) {
      toast.error('Authentication required', 'Please sign in to update pipeline stages');
      return false;
    }

    const item = watchlist.find(w => w.player_id === playerId);
    if (!item) {
      toast.error('Failed to update stage', 'Player not found in your watchlist.');
      return false;
    }

    const result = await updateWatchlistStatus(item.id, stage);

    if (!result.success) {
      toast.error('Failed to update stage', result.error || 'Could not update pipeline stage. Please try again.');
      return false;
    }

    toast.success('Stage updated', `Moved player to ${stage.replace('_', ' ')}`);
    fetchWatchlist();
    return true;
  };

  const updateNotes = async (playerId: string, notes: string) => {
    if (!coach) {
      toast.error('Authentication required', 'Please sign in to update notes');
      return false;
    }

    const item = watchlist.find(w => w.player_id === playerId);
    if (!item) {
      toast.error('Failed to update notes', 'Player not found in your watchlist.');
      return false;
    }

    const result = await addWatchlistNote(item.id, notes);

    if (!result.success) {
      toast.error('Failed to update notes', result.error || 'Could not save notes. Please try again.');
      return false;
    }

    toast.success('Notes saved', 'Successfully updated player notes');
    fetchWatchlist();
    return true;
  };

  const isOnWatchlist = (playerId: string) => watchlist.some(w => w.player_id === playerId);
  const getWatchlistItem = (playerId: string) => watchlist.find(w => w.player_id === playerId);

  return { watchlist, loading, addToWatchlist, removeFromWatchlist, updateStage, updateNotes, isOnWatchlist, getWatchlistItem, refetch: fetchWatchlist };
}

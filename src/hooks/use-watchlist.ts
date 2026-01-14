'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/components/ui/toast';
import type { WatchlistWithPlayer, PipelineStage } from '@/lib/types';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();
  const supabase = createClient();

  const fetchWatchlist = useCallback(async () => {
    if (!coach) {
      setLoading(false);
      return;
    }

    setLoading(true);
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
    setLoading(false);
  }, [coach]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const addToWatchlist = async (playerId: string, notes?: string) => {
    if (!coach) {
      toast.error('Authentication required', 'Please sign in to add players to your watchlist');
      return false;
    }

    const { error } = await supabase.from('baseball_watchlists').insert({
      coach_id: coach.id,
      player_id: playerId,
      notes: notes || null,
    });

    if (error) {
      console.error('[Watchlist] Failed to add player:', error);
      toast.error('Failed to add player', 'Could not add player to watchlist. Please try again.');
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

    const { error } = await supabase
      .from('baseball_watchlists')
      .delete()
      .eq('coach_id', coach.id)
      .eq('player_id', playerId);

    if (error) {
      console.error('[Watchlist] Failed to remove player:', error);
      toast.error('Failed to remove player', 'Could not remove player from watchlist. Please try again.');
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

    const { error } = await supabase
      .from('baseball_watchlists')
      .update({ pipeline_stage: stage })
      .eq('coach_id', coach.id)
      .eq('player_id', playerId);

    if (error) {
      console.error('[Watchlist] Failed to update stage:', error);
      toast.error('Failed to update stage', 'Could not update pipeline stage. Please try again.');
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

    const { error } = await supabase
      .from('baseball_watchlists')
      .update({ notes })
      .eq('coach_id', coach.id)
      .eq('player_id', playerId);

    if (error) {
      console.error('[Watchlist] Failed to update notes:', error);
      toast.error('Failed to update notes', 'Could not save notes. Please try again.');
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

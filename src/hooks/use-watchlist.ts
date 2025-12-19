'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { Watchlist, PipelineStage } from '@/types/database';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Watchlist[]>([]);
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
      .from('watchlists')
      .select(`
        id,
        coach_id,
        player_id,
        pipeline_stage,
        notes,
        priority,
        tags,
        last_contact,
        added_at,
        created_at,
        updated_at,
        player:players(*)
      `)
      .eq('coach_id', coach.id)
      .order('priority', { ascending: false });

    // @ts-ignore - Column exists in database but types may need refresh
    setWatchlist(data || []);
    setLoading(false);
  }, [coach]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const addToWatchlist = async (playerId: string, notes?: string) => {
    if (!coach) return false;
    const { error } = await supabase.from('watchlists').insert({
      coach_id: coach.id,
      player_id: playerId,
      notes: notes || null,
    });
    if (!error) fetchWatchlist();
    return !error;
  };

  const removeFromWatchlist = async (playerId: string) => {
    if (!coach) return false;
    const { error } = await supabase.from('watchlists').delete().eq('coach_id', coach.id).eq('player_id', playerId);
    if (!error) fetchWatchlist();
    return !error;
  };

  const updateStage = async (playerId: string, stage: PipelineStage) => {
    if (!coach) return false;
    const { error } = await supabase.from('watchlists').update({ pipeline_stage: stage as any }).eq('coach_id', coach.id).eq('player_id', playerId);
    if (!error) fetchWatchlist();
    return !error;
  };

  const updateNotes = async (playerId: string, notes: string) => {
    if (!coach) return false;
    const { error } = await supabase.from('watchlists').update({ notes }).eq('coach_id', coach.id).eq('player_id', playerId);
    if (!error) fetchWatchlist();
    return !error;
  };

  const isOnWatchlist = (playerId: string) => watchlist.some(w => w.player_id === playerId);
  const getWatchlistItem = (playerId: string) => watchlist.find(w => w.player_id === playerId);

  return { watchlist, loading, addToWatchlist, removeFromWatchlist, updateStage, updateNotes, isOnWatchlist, getWatchlistItem, refetch: fetchWatchlist };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Player } from '@/types/database';

interface UsePlayersOptions {
  gradYear?: number;
  position?: string;
  state?: string | string[];
  search?: string;
  limit?: number;
  excludeCommitted?: boolean;
}

export function usePlayers(options: UsePlayersOptions = {}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('players')
      .select('*')
      .eq('recruiting_activated', true)
      .order('created_at', { ascending: false });

    if (options.gradYear) query = query.eq('grad_year', options.gradYear);
    if (options.position) query = query.eq('primary_position', options.position);
    if (options.state) {
      if (Array.isArray(options.state)) {
        query = query.in('state', options.state);
      } else {
        query = query.eq('state', options.state);
      }
    }
    if (options.excludeCommitted) query = query.is('committed_to', null);
    if (options.limit) query = query.limit(options.limit);
    if (options.search) {
      query = query.or(`first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%,high_school_name.ilike.%${options.search}%`);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPlayers(data || []);
    }

    setLoading(false);
  }, [options.gradYear, options.position, options.state, options.search, options.limit, options.excludeCommitted]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  return { players, loading, error, refetch: fetchPlayers };
}

export function usePlayer(id: string) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchPlayer = async () => {
      const { data } = await supabase.from('players').select('*').eq('id', id).single();
      setPlayer(data);
      setLoading(false);
    };
    if (id) fetchPlayer();
  }, [id]);

  return { player, loading };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { College } from '@/lib/types';

interface UseCollegesOptions {
  division?: string;
  state?: string;
  conference?: string;
  search?: string;
}

export function useColleges(options: UseCollegesOptions = {}) {
  const [colleges, setColleges] = useState<College[]>([]);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from('organizations').select('*').eq('type', 'college').order('name');

    if (options.division) {
      query = query.eq('division', options.division);
    }
    if (options.state) {
      query = query.eq('location_state', options.state);
    }
    if (options.conference) {
      query = query.ilike('conference', `%${options.conference}%`);
    }
    if (options.search) {
      query = query.or(`name.ilike.%${options.search}%,location_city.ilike.%${options.search}%,location_state.ilike.%${options.search}%`);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setColleges([]);
    } else {
      setColleges(data || []);
    }
    setLoading(false);
  }, [options.division, options.state, options.conference, options.search, supabase]);

  const fetchInterests = useCallback(async () => {
    if (!user) return;

    // Get player record
    const { data: player, error: playerError } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError || !player) return;

    // Get interests - use organization_id to match against college id
    const { data: interestsData } = await supabase
      .from('baseball_recruiting_interests')
      .select('organization_id')
      .eq('player_id', player.id);

    if (interestsData) {
      const interestIds = new Set(interestsData.map(i => i.organization_id).filter(Boolean) as string[]);
      setInterests(interestIds);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchColleges();
  }, [fetchColleges]);

  useEffect(() => {
    fetchInterests();
  }, [fetchInterests]);

  const toggleInterest = (collegeId: string, isInterested: boolean) => {
    setInterests(prev => {
      const newSet = new Set(prev);
      if (isInterested) {
        newSet.add(collegeId);
      } else {
        newSet.delete(collegeId);
      }
      return newSet;
    });
  };

  return { colleges, interests, loading, error, refetch: fetchColleges, toggleInterest };
}

export function useStates() {
  const [states, setStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchStates = useCallback(async () => {
    setLoading(true);
    setError(null);
    // States must reflect colleges that can actually be filtered on
    // (location_state on organizations), not player home states.
    const { data, error: queryError } = await supabase
      .from('organizations')
      .select('location_state')
      .eq('type', 'college')
      .not('location_state', 'is', null);

    if (queryError) {
      setError(queryError.message);
      setStates([]);
    } else if (data) {
      const statesArray = data.map(d => d.location_state).filter(Boolean) as string[];
      const uniqueStates = Array.from(new Set(statesArray)).sort();
      setStates(uniqueStates);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchStates();
  }, [fetchStates]);

  return { states, loading, error, refetch: fetchStates };
}

export function useConferences() {
  const [conferences, setConferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchConferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('organizations')
      .select('conference')
      .eq('type', 'college')
      .not('conference', 'is', null);

    if (queryError) {
      setError(queryError.message);
      setConferences([]);
    } else if (data) {
      const conferencesArray = data.map(d => d.conference).filter(Boolean) as string[];
      const uniqueConferences = Array.from(new Set(conferencesArray)).sort();
      setConferences(uniqueConferences);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchConferences();
  }, [fetchConferences]);

  return { conferences, loading, error, refetch: fetchConferences };
}

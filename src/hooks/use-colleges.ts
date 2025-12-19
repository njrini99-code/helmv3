'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { College } from '@/types/database';

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
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('colleges').select('*').order('name');

    if (options.division) {
      query = query.eq('division', options.division);
    }
    if (options.state) {
      query = query.eq('state', options.state);
    }
    if (options.conference) {
      query = query.ilike('conference', `%${options.conference}%`);
    }
    if (options.search) {
      query = query.or(`name.ilike.%${options.search}%,city.ilike.%${options.search}%,state.ilike.%${options.search}%`);
    }

    const { data } = await query;
    setColleges(data || []);
    setLoading(false);
  }, [options.division, options.state, options.conference, options.search]);

  const fetchInterests = useCallback(async () => {
    if (!user) return;

    // Get player record
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) return;

    // Get interests - use organization_id to match against college id
    const { data: interestsData } = await supabase
      .from('recruiting_interests')
      .select('organization_id')
      .eq('player_id', player.id);

    if (interestsData) {
      const interestIds = new Set(interestsData.map(i => i.organization_id).filter(Boolean) as string[]);
      setInterests(interestIds);
    }
  }, [user]);

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

  return { colleges, interests, loading, refetch: fetchColleges, toggleInterest };
}

export function useStates() {
  const [states, setStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchStates() {
      const { data } = await supabase
        .from('colleges')
        .select('state')
        .not('state', 'is', null);

      if (data) {
        const statesArray = data.map(d => d.state).filter(Boolean) as string[];
        const uniqueStates = Array.from(new Set(statesArray)).sort();
        setStates(uniqueStates);
      }
      setLoading(false);
    }
    fetchStates();
  }, []);

  return { states, loading };
}

export function useConferences() {
  const [conferences, setConferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchConferences() {
      const { data } = await supabase
        .from('colleges')
        .select('conference')
        .not('conference', 'is', null);

      if (data) {
        const conferencesArray = data.map(d => d.conference).filter(Boolean) as string[];
        const uniqueConferences = Array.from(new Set(conferencesArray)).sort();
        setConferences(uniqueConferences);
      }
      setLoading(false);
    }
    fetchConferences();
  }, []);

  return { conferences, loading };
}

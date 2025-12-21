'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

// Activity Feed Types
interface ActivityEvent {
  id: string;
  player_id: string;
  coach_id?: string;
  engagement_type: 'profile_view' | 'watchlist_add' | 'video_view' | 'message_sent';
  engagement_date: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    primary_position?: string;
    avatar_url?: string;
  };
}

export function useActivityFeed(limit = 10) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    async function fetchActivity() {
      if (!coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Use watchlists as activity source since player_engagement_events may not exist
      // This shows recent watchlist additions as activity
      const { data: watchlistData, error } = await supabase
        .from('watchlists')
        .select('id, player_id, coach_id, created_at, updated_at')
        .eq('coach_id', coach.id)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        // Only log if there's meaningful error info (not empty object from RLS)
        if (error.message && !error.message.includes('schema cache')) {
          console.error('Error fetching activity feed:', error.message);
        }
        setActivities([]);
      } else if (watchlistData && watchlistData.length > 0) {
        // Get unique player IDs
        const playerIds = Array.from(new Set(watchlistData.map(e => e.player_id)));

        // Fetch player details
        const { data: playersData } = await supabase
          .from('players')
          .select('id, first_name, last_name, primary_position, avatar_url')
          .in('id', playerIds);

        // Create a map for quick lookup
        const playerMap = new Map(
          (playersData || []).map(p => [p.id, p])
        );

        // Transform watchlist data to activity events
        const transformed = watchlistData.map(item => ({
          id: item.id,
          player_id: item.player_id,
          coach_id: item.coach_id,
          engagement_type: 'watchlist_add' as const,
          engagement_date: item.updated_at || item.created_at,
          player: playerMap.get(item.player_id) || undefined,
        }));
        setActivities(transformed as ActivityEvent[]);
      } else {
        setActivities([]);
      }

      setLoading(false);
    }

    fetchActivity();
  }, [coach?.id, limit]);

  return { activities, loading };
}

// Upcoming Events Types
interface UpcomingEvent {
  id: string;
  name: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location_venue: string | null;
  location_city: string | null;
  location_state: string | null;
}

interface UpcomingCamp {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  organization?: {
    name: string;
    logo_url?: string;
  } | null;
}

export function useUpcomingEvents(limit = 5) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [camps, setCamps] = useState<UpcomingCamp[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach, player } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    async function fetchUpcoming() {
      setLoading(true);
      const now = new Date().toISOString();
      const todayDate = now.split('T')[0] || '';

      // Fetch upcoming events
      if (coach?.id) {
        // Get coach's team first
        const { data: teamStaff } = await supabase
          .from('team_coach_staff')
          .select('team_id')
          .eq('coach_id', coach.id)
          .single();

        if (teamStaff?.team_id) {
          const { data: eventsData } = await supabase
            .from('events')
            .select('id, name, event_type, start_time, end_time, location_venue, location_city, location_state')
            .eq('team_id', teamStaff.team_id)
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(limit);

          setEvents((eventsData || []) as UpcomingEvent[]);
        }

        // Fetch upcoming camps for coaches
        const { data: campsData } = await supabase
          .from('camps')
          .select(`
            id,
            name,
            start_date,
            end_date,
            location,
            organization:organizations (name, logo_url)
          `)
          .eq('coach_id', coach.id)
          .gte('start_date', todayDate)
          .order('start_date', { ascending: true })
          .limit(limit);

        setCamps((campsData || []).map(c => ({
          ...c,
          organization: Array.isArray(c.organization) ? c.organization[0] : c.organization,
        })) as UpcomingCamp[]);
      } else if (player?.id) {
        // Get player's team
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('player_id', player.id)
          .single();

        if (teamMember?.team_id) {
          const { data: eventsData } = await supabase
            .from('events')
            .select('id, name, event_type, start_time, end_time, location_venue, location_city, location_state')
            .eq('team_id', teamMember.team_id)
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(limit);

          setEvents((eventsData || []) as UpcomingEvent[]);
        }

        // Fetch camps player is registered for
        const { data: registrations } = await supabase
          .from('camp_registrations')
          .select(`
            camps (
              id,
              name,
              start_date,
              end_date,
              location,
              organization:organizations (name, logo_url)
            )
          `)
          .eq('player_id', player.id);

        const playerCamps = (registrations || [])
          .filter(r => r.camps)
          .map(r => {
            const camp = r.camps as any;
            return {
              ...camp,
              organization: Array.isArray(camp.organization) ? camp.organization[0] : camp.organization,
            };
          })
          .filter(c => c.start_date && c.start_date >= todayDate)
          .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
          .slice(0, limit);

        setCamps(playerCamps as UpcomingCamp[]);
      }

      setLoading(false);
    }

    fetchUpcoming();
  }, [coach?.id, player?.id, limit]);

  return { events, camps, loading };
}

// Engagement Chart Data Hook
interface ChartDataPoint {
  date: string;
  views: number;
  watchlistAdds: number;
}

export function useEngagementChart(days = 7) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    async function fetchChartData() {
      if (!coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Use watchlists since player_engagement_events may not exist
      const { data: watchlistEvents } = await supabase
        .from('watchlists')
        .select('created_at, updated_at')
        .eq('coach_id', coach.id)
        .gte('created_at', startDate.toISOString());

      // Group by date
      const dataByDate: Record<string, { views: number; watchlistAdds: number }> = {};

      // Initialize all dates
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        if (dateStr) {
          dataByDate[dateStr] = { views: 0, watchlistAdds: 0 };
        }
      }

      // Count watchlist adds by date
      (watchlistEvents || []).forEach(event => {
        if (!event.created_at) return;
        const dateStr = new Date(event.created_at).toISOString().split('T')[0];
        if (dateStr && dataByDate[dateStr]) {
          dataByDate[dateStr].watchlistAdds++;
        }
      });

      // Convert to array
      const chartArray = Object.entries(dataByDate).map(([date, data]) => ({
        date,
        ...data,
      }));

      setChartData(chartArray);
      setLoading(false);
    }

    fetchChartData();
  }, [coach?.id, days]);

  return { chartData, loading };
}

// Saved Searches Types
interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, string>;
  created_at: string;
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();

  useEffect(() => {
    async function fetchSearches() {
      if (!coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Use localStorage for saved searches since the table may not exist
        const stored = localStorage.getItem(`saved_searches_${coach.id}`);
        if (stored) {
          setSearches(JSON.parse(stored));
        }
      } catch (error) {
        console.log('Error loading saved searches:', error);
        setSearches([]);
      }

      setLoading(false);
    }

    fetchSearches();
  }, [coach?.id]);

  const saveSearch = (name: string, filters: Record<string, string>): SavedSearch | null => {
    if (!coach?.id) return null;

    const newSearch: SavedSearch = {
      id: crypto.randomUUID(),
      name,
      filters,
      created_at: new Date().toISOString(),
    };

    const updated = [newSearch, ...searches].slice(0, 5);
    setSearches(updated);

    try {
      localStorage.setItem(`saved_searches_${coach.id}`, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving search:', error);
    }

    return newSearch;
  };

  const deleteSearch = (id: string): boolean => {
    if (!coach?.id) return false;

    const updated = searches.filter(s => s.id !== id);
    setSearches(updated);

    try {
      localStorage.setItem(`saved_searches_${coach.id}`, JSON.stringify(updated));
      return true;
    } catch (error) {
      console.error('Error deleting search:', error);
      return false;
    }
  };

  return { searches, loading, saveSearch, deleteSearch };
}

// Player Distribution by State Hook
export function usePlayersByState() {
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchStateCounts() {
      setLoading(true);

      // Get all players with recruiting activated, grouped by state
      const { data, error } = await supabase
        .from('players')
        .select('state')
        .eq('recruiting_activated', true)
        .not('state', 'is', null);

      if (error) {
        // Only log if there's meaningful error info
        if (error.message) {
          console.error('Error fetching player distribution:', error.message);
        }
        setStateCounts({});
      } else {
        // Count players per state
        const counts: Record<string, number> = {};
        (data || []).forEach((player) => {
          if (player.state) {
            // Normalize state to uppercase abbreviation
            const stateCode = player.state.toUpperCase().trim();
            counts[stateCode] = (counts[stateCode] || 0) + 1;
          }
        });
        setStateCounts(counts);
      }

      setLoading(false);
    }

    fetchStateCounts();
  }, []);

  return { stateCounts, loading };
}

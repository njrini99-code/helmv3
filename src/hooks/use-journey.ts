'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

export interface JourneySchool {
  id: string;
  school_name: string;
  division: string | null;
  conference: string | null;
  status: string;
  interest_level: string | null;
  notes: string | null;
  coach_name: string | null;
  last_contact_at: string | null;
  created_at: string;
  organization_id: string | null;
  // Engagement data
  profile_views: number;
  watchlist_added: boolean;
  last_engagement_at: string | null;
}

export interface JourneyEvent {
  id: string;
  type: 'profile_view' | 'watchlist_add' | 'video_view' | 'message' | 'added_interest' | 'status_change';
  school_name: string;
  coach_name?: string | null;
  timestamp: string;
  description: string;
  is_anonymous: boolean;
}

export interface JourneyStats {
  total_interests: number;
  schools_interested: number;
  schools_contacted: number;
  schools_visited: number;
  schools_offered: number;
  committed: boolean;
}

export function useJourney() {
  const [schools, setSchools] = useState<JourneySchool[]>([]);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [stats, setStats] = useState<JourneyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchJourneyData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Get player record
    const { data: player } = await supabase
      .from('players')
      .select('id, recruiting_activated')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      setLoading(false);
      return;
    }

    // Fetch recruiting interests
    const { data: interests } = await supabase
      .from('recruiting_interests')
      .select('*')
      .eq('player_id', player.id)
      .order('created_at', { ascending: false });

    // Fetch engagement events for this player
    const { data: engagementEvents } = await supabase
      .from('player_engagement_events')
      .select(`
        *,
        coaches (
          full_name,
          school_name
        )
      `)
      .eq('player_id', player.id)
      .order('engagement_date', { ascending: false })
      .limit(50);

    // Process schools with engagement data
    const processedSchools: JourneySchool[] = (interests || []).map(interest => {
      // Find related engagement events
      const schoolEngagements = (engagementEvents || []).filter(
        e => e.coaches?.school_name?.toLowerCase() === interest.school_name?.toLowerCase()
      );

      const profileViews = schoolEngagements.filter(e => e.engagement_type === 'profile_view').length;
      const watchlistAdded = schoolEngagements.some(e => e.engagement_type === 'watchlist_add');
      const lastEngagement = schoolEngagements[0]?.engagement_date || null;

      return {
        id: interest.id,
        school_name: interest.school_name,
        division: interest.division,
        conference: interest.conference,
        status: interest.status || 'interested',
        interest_level: interest.interest_level,
        notes: interest.notes,
        coach_name: interest.coach_name,
        last_contact_at: interest.last_contact_at,
        created_at: interest.created_at,
        organization_id: interest.organization_id,
        profile_views: profileViews,
        watchlist_added: watchlistAdded,
        last_engagement_at: lastEngagement,
      };
    });

    // Process timeline events
    const timelineEvents: JourneyEvent[] = [];

    // Add interest additions to timeline
    (interests || []).forEach(interest => {
      timelineEvents.push({
        id: `interest-${interest.id}`,
        type: 'added_interest',
        school_name: interest.school_name,
        timestamp: interest.created_at,
        description: `Added ${interest.school_name} to your journey`,
        is_anonymous: false,
      });
    });

    // Add engagement events to timeline
    (engagementEvents || []).forEach(event => {
      let type: JourneyEvent['type'] = 'profile_view';
      let description = '';

      switch (event.engagement_type) {
        case 'profile_view':
          type = 'profile_view';
          description = event.is_anonymous
            ? `A coach from ${event.coaches?.school_name || 'a program'} viewed your profile`
            : `${event.coaches?.full_name || 'A coach'} from ${event.coaches?.school_name || 'unknown'} viewed your profile`;
          break;
        case 'watchlist_add':
          type = 'watchlist_add';
          description = event.is_anonymous
            ? `A coach from ${event.coaches?.school_name || 'a program'} added you to their watchlist`
            : `${event.coaches?.full_name || 'A coach'} from ${event.coaches?.school_name || 'unknown'} added you to their watchlist`;
          break;
        case 'video_view':
          type = 'video_view';
          description = event.is_anonymous
            ? `A coach from ${event.coaches?.school_name || 'a program'} watched your video`
            : `${event.coaches?.full_name || 'A coach'} from ${event.coaches?.school_name || 'unknown'} watched your video`;
          break;
        default:
          description = `Activity from ${event.coaches?.school_name || 'unknown'}`;
      }

      timelineEvents.push({
        id: event.id,
        type,
        school_name: event.coaches?.school_name || 'Unknown',
        coach_name: event.coaches?.full_name,
        timestamp: event.engagement_date,
        description,
        is_anonymous: event.is_anonymous || false,
      });
    });

    // Sort events by date
    timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate stats
    const interestStatuses = (interests || []).map(i => i.status || 'interested');
    const journeyStats: JourneyStats = {
      total_interests: interests?.length || 0,
      schools_interested: interestStatuses.filter(s => s === 'interested').length,
      schools_contacted: interestStatuses.filter(s => s === 'contacted').length,
      schools_visited: interestStatuses.filter(s => s === 'visited').length,
      schools_offered: interestStatuses.filter(s => s === 'offered').length,
      committed: interestStatuses.some(s => s === 'committed'),
    };

    setSchools(processedSchools);
    setEvents(timelineEvents);
    setStats(journeyStats);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchJourneyData();
  }, [fetchJourneyData]);

  return { schools, events, stats, loading, refetch: fetchJourneyData };
}

export async function updateInterestStatus(interestId: string, status: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('recruiting_interests')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', interestId);

  if (error) {
    throw new Error('Failed to update status');
  }

  return { success: true };
}

export async function updateInterestNotes(interestId: string, notes: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('recruiting_interests')
    .update({
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', interestId);

  if (error) {
    throw new Error('Failed to update notes');
  }

  return { success: true };
}

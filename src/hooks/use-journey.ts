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
      .from('baseball_players')
      .select('id, recruiting_activated')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      setLoading(false);
      return;
    }

    // Fetch recruiting interests with organization data
    const { data: interests } = await supabase
      .from('baseball_recruiting_interests')
      .select(`
        id,
        player_id,
        organization_id,
        status,
        interest_level,
        notes,
        created_at,
        updated_at,
        organization:organizations (
          name,
          division,
          conference
        )
      `)
      .eq('player_id', player.id)
      .order('created_at', { ascending: false });

    // Fetch engagement events for this player
    const { data: engagementEvents } = await supabase
      .from('baseball_player_engagement_events')
      .select(`
        *,
        baseball_coaches (
          full_name,
          organization:organizations (name)
        )
      `)
      .eq('player_id', player.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Process schools with engagement data
    const processedSchools: JourneySchool[] = (interests || []).map(interest => {
      // Get school name from organization join
      const org = interest.organization as { name?: string; division?: string; conference?: string } | null;
      const schoolName = org?.name || 'Unknown School';

      // Find related engagement events - get school name from organization
      const schoolEngagements = (engagementEvents || []).filter(
        e => (e.baseball_coaches?.organization as { name?: string })?.name?.toLowerCase() === schoolName.toLowerCase()
      );

      const profileViews = schoolEngagements.filter(e => e.engagement_type === 'profile_view').length;
      const watchlistAdded = schoolEngagements.some(e => e.engagement_type === 'watchlist_add');
      const lastEngagement = schoolEngagements[0]?.created_at || null;

      return {
        id: interest.id,
        school_name: schoolName,
        division: org?.division || null,
        conference: org?.conference || null,
        status: interest.status || 'interested',
        interest_level: interest.interest_level,
        notes: interest.notes,
        coach_name: null, // Not available in current schema
        last_contact_at: null, // Not available in current schema
        created_at: interest.created_at || new Date().toISOString(),
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
      const org = interest.organization as { name?: string } | null;
      const schoolName = org?.name || 'Unknown School';
      timelineEvents.push({
        id: `interest-${interest.id}`,
        type: 'added_interest',
        school_name: schoolName,
        timestamp: interest.created_at || new Date().toISOString(),
        description: `Added ${schoolName} to your journey`,
        is_anonymous: false,
      });
    });

    const isRecruitingActivated = player.recruiting_activated || false;

    // Add engagement events to timeline
    (engagementEvents || []).forEach(event => {
      let type: JourneyEvent['type'] = 'profile_view';
      let description = '';
      const schoolName = (event.baseball_coaches?.organization as { name?: string })?.name || 'a program';
      const coachName = event.baseball_coaches?.full_name || 'A coach';

      switch (event.engagement_type) {
        case 'profile_view':
          type = 'profile_view';
          description = !isRecruitingActivated
            ? `A coach from ${schoolName} viewed your profile`
            : `${coachName} from ${schoolName} viewed your profile`;
          break;
        case 'watchlist_add':
          type = 'watchlist_add';
          description = !isRecruitingActivated
            ? `A coach from ${schoolName} added you to their watchlist`
            : `${coachName} from ${schoolName} added you to their watchlist`;
          break;
        case 'video_view':
          type = 'video_view';
          description = !isRecruitingActivated
            ? `A coach from ${schoolName} watched your video`
            : `${coachName} from ${schoolName} watched your video`;
          break;
        default:
          description = `Activity from ${schoolName}`;
      }

      timelineEvents.push({
        id: event.id,
        type,
        school_name: isRecruitingActivated ? schoolName : 'A college program',
        coach_name: isRecruitingActivated ? coachName : null,
        timestamp: event.created_at || new Date().toISOString(),
        description,
        is_anonymous: !isRecruitingActivated,
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
  }, [user, supabase]);

  useEffect(() => {
    fetchJourneyData();
  }, [fetchJourneyData]);

  return { schools, events, stats, loading, refetch: fetchJourneyData };
}

export async function updateInterestStatus(interestId: string, status: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('baseball_recruiting_interests')
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
    .from('baseball_recruiting_interests')
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

interface AnalyticsStats {
  profileViews: number;
  watchlistAdds: number;
  videoViews: number;
  messagesSent: number;
}

interface ViewOverTime {
  date: string;
  views: number;
}

interface TopSchool {
  school_name: string;
  school_id: string;
  view_count: number;
  division?: string;
  logo_url?: string;
}

interface EngagementEvent {
  id: string;
  player_id: string;
  coach_id?: string | null;
  engagement_type: string;
  engagement_date: string;
  created_at?: string;
  is_anonymous?: boolean | null;
  metadata?: unknown;
  video_id?: string | null;
  view_duration_seconds?: number | null;
  viewer_user_id?: string | null;
  coaches?: {
    id: string;
    school_name?: string;
    program_division?: string;
    logo_url?: string;
    school_state?: string;
    conference?: string;
  } | null;
}

interface AnalyticsData {
  stats: AnalyticsStats;
  viewsOverTime: ViewOverTime[];
  topSchools: TopSchool[];
  recentEngagement: EngagementEvent[];
}

export function useAnalytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const { user } = useAuthStore();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function fetchAnalytics() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Get player record with recruiting_activated status
      const { data: player } = await supabase
        .from('baseball_players')
        .select('id, recruiting_activated')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        setLoading(false);
        return;
      }

      const isRecruitingActivated = player.recruiting_activated || false;

      // Calculate date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch all engagement events from last 30 days
      const { data: events, error: eventsError } = await supabase
        .from('baseball_player_engagement_events')
        .select(`
          id,
          player_id,
          coach_id,
          engagement_type,
          metadata,
          created_at,
          engagement_date,
          baseball_coaches (
            id,
            full_name,
            organization:organizations (
              name,
              division,
              logo_url,
              location_state,
              conference
            )
          )
        `)
        .eq('player_id', player.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (eventsError || !events) {
        setData({
          stats: { profileViews: 0, watchlistAdds: 0, videoViews: 0, messagesSent: 0 },
          viewsOverTime: [],
          topSchools: [],
          recentEngagement: [],
        });
        setLoading(false);
        return;
      }

      // Calculate stats
      const stats: AnalyticsStats = {
        profileViews: events.filter(e => e.engagement_type === 'profile_view').length,
        watchlistAdds: events.filter(e => e.engagement_type === 'watchlist_add').length,
        videoViews: events.filter(e => e.engagement_type === 'video_view').length,
        messagesSent: events.filter(e => e.engagement_type === 'message_sent').length,
      };

      // Calculate views over time (last 30 days)
      const viewsByDate: Record<string, number> = {};
      events.filter(e => e.engagement_type === 'profile_view').forEach(event => {
        if (!event.created_at) return;
        const dateStr = new Date(event.created_at).toISOString().split('T')[0];
        if (dateStr) {
          viewsByDate[dateStr] = (viewsByDate[dateStr] || 0) + 1;
        }
      });

      const viewsOverTime: ViewOverTime[] = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        if (dateStr) {
          viewsOverTime.push({
            date: dateStr,
            views: viewsByDate[dateStr] || 0,
          });
        }
      }

      // Calculate top schools (by profile views)
      // If recruiting not activated, show anonymous data
      const schoolViews: Record<string, { name: string; count: number; division?: string; logo?: string; locationState?: string; conference?: string }> = {};
      events
        .filter(e => e.engagement_type === 'profile_view' && e.baseball_coaches)
        .forEach(event => {
          const coach = event.baseball_coaches as { organization?: { name?: string; location_state?: string; division?: string; conference?: string; logo_url?: string } };
          const org = coach?.organization;
          if (org) {
            let key: string;
            let displayName: string;

            if (isRecruitingActivated) {
              // Show identified school name
              key = org.name || 'Unknown School';
              displayName = key;
            } else {
              // Show anonymous data: "A coach from [State]" or "[Division] program"
              if (org.location_state) {
                key = `state_${org.location_state}`;
                displayName = `A coach from ${org.location_state}`;
              } else if (org.division) {
                key = `division_${org.division}`;
                displayName = `${org.division} program`;
              } else {
                key = 'unknown';
                displayName = 'A college coach';
              }
            }

            if (!schoolViews[key]) {
              schoolViews[key] = {
                name: displayName,
                count: 0,
                division: isRecruitingActivated ? org.division : undefined,
                logo: isRecruitingActivated ? org.logo_url : undefined,
                locationState: org.location_state,
                conference: org.conference,
              };
            }
            schoolViews[key]!.count++;
          }
        });

      const topSchools: TopSchool[] = Object.values(schoolViews)
        .map((data) => ({
          school_name: data.name,
          school_id: data.name, // Using name as ID for now
          view_count: data.count,
          division: data.division,
          logo_url: data.logo,
        }))
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, 10);

      setData({
        stats,
        viewsOverTime,
        topSchools,
        recentEngagement: (events as unknown as EngagementEvent[]).slice(0, 20),
      });

      setLoading(false);
    }

    fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef above).
  }, [user]);

  return { data, loading };
}

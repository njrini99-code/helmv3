'use client';

import { useState, useEffect } from 'react';
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

interface AnalyticsData {
  stats: AnalyticsStats;
  viewsOverTime: ViewOverTime[];
  topSchools: TopSchool[];
  recentEngagement: any[];
}

export function useAnalytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const { user } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    async function fetchAnalytics() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Get player record with recruiting_activated status
      const { data: player } = await supabase
        .from('players')
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
      const { data: events } = await supabase
        .from('player_engagement_events')
        .select(`
          *,
          coaches (
            id,
            school_name,
            division,
            logo_url
          )
        `)
        .eq('player_id', player.id)
        .gte('engagement_date', thirtyDaysAgo.toISOString())
        .order('engagement_date', { ascending: false });

      if (!events) {
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
        const dateStr = new Date(event.engagement_date).toISOString().split('T')[0];
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
      const schoolViews: Record<string, { name: string; count: number; division?: string; logo?: string; state?: string; conference?: string }> = {};
      events
        .filter(e => e.engagement_type === 'profile_view' && e.coaches)
        .forEach(event => {
          const coach = event.coaches as any;
          if (coach) {
            let key: string;
            let displayName: string;

            if (isRecruitingActivated) {
              // Show identified school name
              key = coach.school_name || 'Unknown School';
              displayName = key;
            } else {
              // Show anonymous data: "A coach from [State]" or "[Division] program"
              if (coach.state) {
                key = `state_${coach.state}`;
                displayName = `A coach from ${coach.state}`;
              } else if (coach.division) {
                key = `division_${coach.division}`;
                displayName = `${coach.division} program`;
              } else {
                key = 'unknown';
                displayName = 'A college coach';
              }
            }

            if (!schoolViews[key]) {
              schoolViews[key] = {
                name: displayName,
                count: 0,
                division: isRecruitingActivated ? coach.division : undefined,
                logo: isRecruitingActivated ? coach.logo_url : undefined,
                state: coach.state,
                conference: coach.conference,
              };
            }
            schoolViews[key]!.count++;
          }
        });

      const topSchools: TopSchool[] = Object.entries(schoolViews)
        .map(([_, data]) => ({
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
        recentEngagement: events.slice(0, 20),
      });

      setLoading(false);
    }

    fetchAnalytics();
  }, [user]);

  return { data, loading };
}

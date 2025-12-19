'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

interface CoachStats {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  unreadMessages: number;
  committedCount: number;
}

interface PlayerStats {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  videoViews: number;
  unreadMessages: number;
}

export function useCoachStats() {
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, coach } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !coach) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // Get conversation IDs for this user
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .or(`coach_id.eq.${coach.id},player_id.eq.${coach.id}`);
      const convIds = conversations?.map(c => c.id) || [];

      // Parallel queries
      const [
        { count: viewsThisWeek },
        { count: viewsLastWeek },
        { count: watchlistCount },
        { count: unreadMessages },
        { count: committedCount },
      ] = await Promise.all([
        supabase.from('profile_views').select('*', { count: 'exact', head: true })
          .eq('viewer_id', user.id).gte('created_at', weekAgo.toISOString()),
        supabase.from('profile_views').select('*', { count: 'exact', head: true })
          .eq('viewer_id', user.id).gte('created_at', twoWeeksAgo.toISOString()).lt('created_at', weekAgo.toISOString()),
        supabase.from('watchlists').select('*', { count: 'exact', head: true })
          .eq('coach_id', coach.id),
        convIds.length > 0
          ? supabase.from('messages').select('*', { count: 'exact', head: true })
              .eq('read', false).neq('sender_id', user.id).in('conversation_id', convIds)
          : { count: 0 },
        supabase.from('watchlists').select('*', { count: 'exact', head: true })
          .eq('coach_id', coach.id).eq('pipeline_stage', 'committed'),
      ]);

      setStats({
        profileViews: viewsThisWeek || 0,
        profileViewsChange: (viewsThisWeek || 0) - (viewsLastWeek || 0),
        watchlistCount: watchlistCount || 0,
        unreadMessages: unreadMessages || 0,
        committedCount: committedCount || 0,
      });
      setLoading(false);
    };

    fetchStats();
  }, [user, coach]);

  return { stats, loading };
}

export function usePlayerStats() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, player } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !player) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .or(`coach_id.eq.${player.id},player_id.eq.${player.id}`);
      const convIds = conversations?.map(c => c.id) || [];

      const [
        { count: viewsThisWeek },
        { count: viewsLastWeek },
        { count: watchlistCount },
        { data: videos },
        { count: unreadMessages },
      ] = await Promise.all([
        supabase.from('profile_views').select('*', { count: 'exact', head: true })
          .eq('player_id', player.id).gte('created_at', weekAgo.toISOString()),
        supabase.from('profile_views').select('*', { count: 'exact', head: true })
          .eq('player_id', player.id).gte('created_at', twoWeeksAgo.toISOString()).lt('created_at', weekAgo.toISOString()),
        supabase.from('watchlists').select('*', { count: 'exact', head: true })
          .eq('player_id', player.id),
        supabase.from('videos').select('view_count').eq('player_id', player.id),
        convIds.length > 0
          ? supabase.from('messages').select('*', { count: 'exact', head: true })
              .eq('read', false).neq('sender_id', user.id).in('conversation_id', convIds)
          : { count: 0 },
      ]);

      setStats({
        profileViews: viewsThisWeek || 0,
        profileViewsChange: (viewsThisWeek || 0) - (viewsLastWeek || 0),
        watchlistCount: watchlistCount || 0,
        videoViews: videos?.reduce((sum, v) => sum + (v.view_count || 0), 0) || 0,
        unreadMessages: unreadMessages || 0,
      });
      setLoading(false);
    };

    fetchStats();
  }, [user, player]);

  return { stats, loading };
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import {
  IconGolf, IconFlag, IconBook, IconCalendar, IconUser,
  IconTrendingUp, IconAward, IconChevronRight
} from '@/components/icons';

interface ActivityItem {
  id: string;
  type: 'round' | 'qualifier' | 'announcement' | 'event' | 'player_join' | 'achievement';
  title: string;
  subtitle?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface RecentActivityFeedProps {
  teamId?: string;
  playerId?: string;
  limit?: number;
  className?: string;
}

export function RecentActivityFeed({ 
  teamId, 
  playerId, 
  limit = 10,
  className 
}: RecentActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [teamId, playerId]);

  async function loadActivities() {
    const supabase = createClient();
    const items: ActivityItem[] = [];

    try {
      if (teamId) {
        // Fetch recent rounds for team
        const { data: rounds } = await supabase
          .from('golf_rounds')
          .select(`
            id, round_date, course_name, total_score, total_to_par,
            player:golf_players(id, first_name, last_name, team_id)
          `)
          .eq('player.team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (rounds) {
          for (const round of rounds) {
            if (round.player) {
              const toPar = round.total_to_par ?? 0;
              items.push({
                id: `round-${round.id}`,
                type: 'round',
                title: `${(round.player as any).first_name} ${(round.player as any).last_name}`,
                subtitle: `Shot ${round.total_score} (${toPar > 0 ? '+' : ''}${toPar}) at ${round.course_name}`,
                timestamp: round.round_date,
                metadata: { score: round.total_score, toPar },
              });
            }
          }
        }

        // Fetch recent announcements
        const { data: announcements } = await supabase
          .from('golf_announcements')
          .select('id, title, created_at')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(3);

        if (announcements) {
          for (const ann of announcements) {
            items.push({
              id: `announcement-${ann.id}`,
              type: 'announcement',
              title: 'New Announcement',
              subtitle: ann.title,
              timestamp: ann.created_at || new Date().toISOString(),
            });
          }
        }

        // Fetch upcoming events
        const { data: events } = await supabase
          .from('golf_events')
          .select('id, title, start_date, event_type')
          .eq('team_id', teamId)
          .gte('start_date', new Date().toISOString().split('T')[0])
          .order('start_date', { ascending: true })
          .limit(3);

        if (events) {
          for (const event of events) {
            items.push({
              id: `event-${event.id}`,
              type: 'event',
              title: event.title,
              subtitle: `${event.event_type} on ${new Date(event.start_date).toLocaleDateString()}`,
              timestamp: event.start_date,
            });
          }
        }
      } else if (playerId) {
        // Fetch player's recent rounds
        const { data: rounds } = await supabase
          .from('golf_rounds')
          .select('id, round_date, course_name, total_score, total_to_par')
          .eq('player_id', playerId)
          .order('round_date', { ascending: false })
          .limit(5);

        if (rounds) {
          for (const round of rounds) {
            const toPar = round.total_to_par ?? 0;
            items.push({
              id: `round-${round.id}`,
              type: 'round',
              title: round.course_name,
              subtitle: `Shot ${round.total_score} (${toPar > 0 ? '+' : ''}${toPar})`,
              timestamp: round.round_date,
              metadata: { score: round.total_score, toPar },
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading activities:', error);
    }

    // Sort by timestamp and limit
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setActivities(items.slice(0, limit));
    setLoading(false);
  }

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'round':
        return <IconGolf size={16} />;
      case 'qualifier':
        return <IconFlag size={16} />;
      case 'announcement':
        return <IconBook size={16} />;
      case 'event':
        return <IconCalendar size={16} />;
      case 'player_join':
        return <IconUser size={16} />;
      case 'achievement':
        return <IconAward size={16} />;
      default:
        return <IconGolf size={16} />;
    }
  };

  const getIconBg = (type: ActivityItem['type']) => {
    switch (type) {
      case 'round':
        return 'bg-green-100 text-green-600';
      case 'qualifier':
        return 'bg-amber-100 text-amber-600';
      case 'announcement':
        return 'bg-blue-100 text-blue-600';
      case 'event':
        return 'bg-purple-100 text-purple-600';
      case 'player_join':
        return 'bg-slate-100 text-slate-600';
      case 'achievement':
        return 'bg-yellow-100 text-yellow-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <IconGolf size={24} className="text-slate-400" />
        </div>
        <p className="text-slate-500 text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {activities.map((activity, index) => (
        <div
          key={activity.id}
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer',
            'animate-slide-in-up'
          )}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            getIconBg(activity.type)
          )}>
            {getIcon(activity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {activity.title}
            </p>
            {activity.subtitle && (
              <p className="text-xs text-slate-500 truncate">
                {activity.subtitle}
              </p>
            )}
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">
            {formatTimestamp(activity.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { IconBell } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getAnnouncementsWithMeta } from '@/app/baseball/actions/announcements';
import { AnnouncementsCoachView } from '@/components/baseball/announcements/AnnouncementsCoachView';
import { AnnouncementsPlayerView } from '@/components/baseball/announcements/AnnouncementsPlayerView';
import { CreateAnnouncementFlow } from '@/components/baseball/announcements/CreateAnnouncementFlow';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';

interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export default function BaseballAnnouncementsPage() {
  const { user, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const [announcements, setAnnouncements] = useState<BaseballAnnouncementMeta[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const isCoach = user?.role === 'coach';

  useEffect(() => {
    if (authLoading) return;
    if (!selectedTeamId || !user) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      setLoading(true);

      const playerId = player?.id || null;

      // Fetch announcements via server action
      const result = await getAnnouncementsWithMeta(
        selectedTeamId!,
        user!.id,
        isCoach,
        playerId
      );

      if (result.success && result.data) {
        setAnnouncements(result.data);
      }

      // For coaches: also fetch roster for the create flow
      if (isCoach && selectedTeamId) {
        const supabase = createClient();
        const { data: members } = await supabase
          .from('baseball_team_members')
          .select('player_id, player:baseball_players(id, first_name, last_name)')
          .eq('team_id', selectedTeamId)
          .eq('status', 'active');

        const rosterPlayers = (members || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => m.player)
          .filter(Boolean)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
          }));

        setPlayers(rosterPlayers);
      }

      setLoading(false);
    }

    fetchData();
  }, [authLoading, selectedTeamId, user, isCoach, player?.id]);

  if (authLoading) return <PageLoading />;

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  return (
    <>
      <Header
        title="Announcements"
        subtitle={isCoach ? 'Share updates with your team' : 'Team news and updates'}
      >
        {isCoach && selectedTeamId && (
          <CreateAnnouncementFlow
            players={players}
            teamId={selectedTeamId}
          />
        )}
      </Header>

      <div className="p-6 lg:p-8">
        {/* Recent count badge */}
        {recentCount > 0 && !loading && (
          <div className="mb-4">
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700">
              {recentCount} new this week
            </span>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-standard rounded-2xl p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
                    <div className="h-3 bg-slate-200 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !selectedTeamId ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconBell size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Team Selected</h3>
              <p className="text-slate-500 max-w-sm mx-auto">
                Please select a team from the sidebar to view announcements.
              </p>
            </CardContent>
          </Card>
        ) : announcements.length === 0 ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconBell size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Announcements</h3>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                {isCoach
                  ? 'Create announcements to keep your team informed about schedule changes, game updates, and important news.'
                  : 'No announcements have been posted yet. Check back later for team updates.'}
              </p>
              {isCoach && selectedTeamId && (
                <CreateAnnouncementFlow
                  players={players}
                  teamId={selectedTeamId}
                />
              )}
            </CardContent>
          </Card>
        ) : isCoach ? (
          <AnnouncementsCoachView announcements={announcements} />
        ) : (
          <AnnouncementsPlayerView
            announcements={announcements}
            playerId={player?.id || ''}
          />
        )}
      </div>
    </>
  );
}

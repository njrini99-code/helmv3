'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { AnnouncementsFairway } from '@/components/baseball/announcements/AnnouncementsFairway';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const isCoach = user?.role === 'coach';

  // Stable refetch used both by the initial load effect and by the create/delete
  // success callbacks below — router.refresh() alone cannot re-run this because
  // the announcements list lives in useState, not in server-rendered data.
  const fetchAnnouncements = useCallback(async () => {
    if (!selectedTeamId || !user) return;

    setLoading(true);
    setLoadError(null);

    const playerId = player?.id || null;

    const result = await getAnnouncementsWithMeta(
      selectedTeamId,
      user.id,
      isCoach,
      playerId
    );

    if (result.success && result.data) {
      setAnnouncements(result.data);
    } else {
      setAnnouncements([]);
      setLoadError(result.error ?? 'Announcements could not be loaded.');
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
  }, [selectedTeamId, user, isCoach, player?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!selectedTeamId || !user) {
      setLoading(false);
      return;
    }
    void fetchAnnouncements();
  }, [authLoading, selectedTeamId, user, fetchAnnouncements]);

  if (authLoading) return <PageLoading />;

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <AnnouncementsFairway
          announcements={announcements}
          players={players}
          selectedTeamId={selectedTeamId}
          isCoach={isCoach}
          playerId={player?.id || ''}
          loading={loading}
          loadError={loadError}
          recentCount={recentCount}
          onRefresh={fetchAnnouncements}
        />
      </div>
    );
  }

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
            onCreated={fetchAnnouncements}
          />
        )}
      </Header>

      <div className="p-6 lg:p-8">
        {/* Recent count badge */}
        {recentCount > 0 && !loading && (
          <div className="mb-4">
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
              {recentCount} new this week
            </span>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-standard rounded-2xl p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-warm-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-warm-200 rounded w-1/3 mb-3" />
                    <div className="h-3 bg-warm-200 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-warm-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !selectedTeamId ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <IconBell size={28} className="text-warm-400" />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">No Team Selected</h3>
              <p className="text-warm-500 max-w-sm mx-auto">
                Please select a team from the sidebar to view announcements.
              </p>
            </CardContent>
          </Card>
        ) : loadError ? (
          <ReadModelStateNotice
            state="error"
            title="Announcements unavailable"
            onRetry={() => void fetchAnnouncements()}
          />
        ) : announcements.length === 0 ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <IconBell size={28} className="text-warm-400" />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">No Announcements</h3>
              <p className="text-warm-500 mb-6 max-w-sm mx-auto">
                {isCoach
                  ? 'Create announcements to keep your team informed about schedule changes, game updates, and important news.'
                  : 'No announcements have been posted yet. Check back later for team updates.'}
              </p>
              {isCoach && selectedTeamId && (
                <CreateAnnouncementFlow
                  players={players}
                  teamId={selectedTeamId}
                  onCreated={fetchAnnouncements}
                />
              )}
            </CardContent>
          </Card>
        ) : isCoach ? (
          <AnnouncementsCoachView announcements={announcements} onDeleted={fetchAnnouncements} />
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

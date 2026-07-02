'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getAnnouncementsWithMeta } from '@/app/baseball/actions/announcements';
import { AnnouncementsFairway } from '@/components/baseball/announcements/AnnouncementsFairway';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { fairwayScope } from '@/lib/redesign/flag';
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

  if (loadError) {
    return (
      <div className={fairwayScope('mx-auto max-w-5xl p-4 md:p-6')}>
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-900">Announcements</h1>
        <ReadModelStateNotice
          state="error"
          title="Announcements unavailable"
          onRetry={() => void fetchAnnouncements()}
        />
      </div>
    );
  }

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  return (
    <div className={fairwayScope('min-h-full')}>
      <AnnouncementsFairway
        announcements={announcements}
        players={players}
        selectedTeamId={selectedTeamId}
        isCoach={isCoach}
        playerId={player?.id || ''}
        loading={loading}
        recentCount={recentCount}
        onRefresh={fetchAnnouncements}
      />
    </div>
  );
}

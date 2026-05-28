import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { IconBell } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { AnnouncementsCoachView } from '@/components/golf/announcements/AnnouncementsCoachView';
import { AnnouncementsPlayerView } from '@/components/golf/announcements/AnnouncementsPlayerView';
import { CreateAnnouncementFlow } from '@/components/golf/announcements/CreateAnnouncementFlow';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

export const metadata: Metadata = {
  title: 'Team Announcements | Helm Sports',
  description: 'View team news, updates, and important announcements from your golf coaching staff',
};

export const revalidate = 120;

export default async function GolfAnnouncementsPage() {
  // React.cache() dedupes auth queries across render tree (free after layout)
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { userId, role, coach, player } = session;
  const isCoach = role === 'coach';
  const orgId = coach?.organization_id ?? null;
  const playerId = player?.id ?? null;

  // Supabase client only for team/data lookups
  const supabase = await createClient();

  // Team lookup in parallel for coach and player paths
  let teamId: string | null = null;
  try {
    const [coachTeamResult, playerTeamResult] = await Promise.all([
      orgId
        ? supabase.from('golf_teams').select('id').eq('organization_id', orgId).maybeSingle()
        : Promise.resolve({ data: null }),
      playerId
        ? supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    teamId = coachTeamResult.data?.id || playerTeamResult.data?.team_id || null;
  } catch {
    // Network failure — proceed with null teamId (empty state below)
  }

  // Fetch announcements + coach data (roster + documents) in parallel
  let announcements: Awaited<ReturnType<typeof getAnnouncementsWithMeta>>['data'] = [];
  let players: { id: string; first_name: string; last_name: string }[] = [];
  let documents: { id: string; title: string; file_type: string; file_size: number }[] = [];

  try {
    const [announcementsResult, membersResult, docsResult] = await Promise.all([
      teamId
        ? getAnnouncementsWithMeta(teamId, userId, isCoach, playerId)
        : Promise.resolve({ success: true as const, data: [] }),
      isCoach && teamId
        ? supabase
            .from('golf_team_members')
            .select('player_id, player:golf_players(id, first_name, last_name)')
            .eq('team_id', teamId)
            .eq('status', 'active')
            .limit(100)
        : Promise.resolve({ data: null }),
      isCoach && teamId
        ? supabase
            .from('golf_documents')
            .select('id, title, file_type, file_size')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null }),
    ]);

    announcements = announcementsResult.data ?? [];

    players = (membersResult.data || [])
      .map((m: any) => m.player) // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })); // eslint-disable-line @typescript-eslint/no-explicit-any

    documents = ((docsResult.data || []) as Array<{ id: string; title: string; file_type: string; file_size: number }>);
  } catch {
    // Network failure — render empty state
  }

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  return (
    <AnimatedPage>
      {/* Header */}
      <AnimatedItem>
        <LargeTitleHeader
          title="Announcements"
          subtitle={isCoach ? 'Share updates with your team' : 'Team news and updates'}
        >
          {recentCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
              {recentCount} new
            </span>
          )}
          {isCoach && (
            <CreateAnnouncementFlow
              players={players}
              documents={documents}
            />
          )}
        </LargeTitleHeader>
      </AnimatedItem>

      {/* Content */}
      <AnimatedItem className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — frames the announcements feed beneath the
            sticky title header in the magazine-cover rhythm. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Announcements"
              eyebrowAccent="primary"
              title="What's new."
              subtitle={
                announcements.length === 0
                  ? isCoach
                    ? 'Share schedule changes, news, and important updates with your team.'
                    : 'The latest from the coaching staff.'
                  : recentCount > 0
                    ? `${recentCount} this week · ${announcements.length} total.`
                    : `${announcements.length} posted.`
              }
            />
          </div>
        </Reveal>

        {announcements.length === 0 ? (
          <div className="surface-matte rounded-3xl p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No Announcements</h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create announcements to keep your team informed about schedule changes, upcoming events, and important updates.'
                : 'No announcements have been posted yet. Check back later for team updates.'}
            </p>
            {isCoach && (
              <CreateAnnouncementFlow
                players={players}
                documents={documents}
              />
            )}
          </div>
        ) : isCoach ? (
          <AnnouncementsCoachView announcements={announcements} />
        ) : !playerId ? (
          <div className="surface-matte rounded-3xl p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">Player Profile Not Found</h3>
            <p className="text-warm-500 max-w-sm mx-auto">
              Unable to load your player profile. Please complete onboarding or contact support.
            </p>
          </div>
        ) : (
          <AnnouncementsPlayerView announcements={announcements} playerId={playerId} />
        )}
      </AnimatedItem>
    </AnimatedPage>
  );
}

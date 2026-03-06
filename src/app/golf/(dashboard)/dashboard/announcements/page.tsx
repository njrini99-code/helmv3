import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { IconBell } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { AnnouncementsCoachView } from '@/components/golf/announcements/AnnouncementsCoachView';
import { AnnouncementsPlayerView } from '@/components/golf/announcements/AnnouncementsPlayerView';
import { CreateAnnouncementFlow } from '@/components/golf/announcements/CreateAnnouncementFlow';
import { MobileMenuButton } from '@/components/golf/layout/MobileMenuButton';

export const metadata: Metadata = {
  title: 'Team Announcements | Helm Sports',
  description: 'View team news, updates, and important announcements from your golf coaching staff',
};

export const revalidate = 120;

export default async function GolfAnnouncementsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Role + profiles in parallel
  const [userRoleResult, coachResult, playerResult] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('golf_players').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const isCoach = userRoleResult.data?.role === 'coach';
  const orgId = coachResult.data?.organization_id;
  const playerId = playerResult.data?.id || null;

  // Team lookup in parallel for coach and player paths
  const [coachTeamResult, playerTeamResult] = await Promise.all([
    orgId
      ? supabase.from('golf_teams').select('id').eq('organization_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    playerId
      ? supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const teamId = coachTeamResult.data?.id || playerTeamResult.data?.team_id || null;

  // Fetch announcements + coach data (roster + documents) in parallel
  const [announcementsResult, membersResult, docsResult] = await Promise.all([
    teamId
      ? getAnnouncementsWithMeta(teamId, user.id, isCoach, playerId)
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

  const announcements = announcementsResult.data ?? [];

  const players = (membersResult.data || [])
    .map((m: any) => m.player) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter(Boolean)
    .map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })); // eslint-disable-line @typescript-eslint/no-explicit-any

  const documents = ((docsResult.data || []) as Array<{ id: string; title: string; file_type: string; file_size: number }>);

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  return (
    <AnimatedPage>
      {/* Header */}
      <AnimatedItem className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MobileMenuButton />
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-warm-900">Announcements</h1>
                  {recentCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
                      {recentCount} new
                    </span>
                  )}
                </div>
                <p className="text-warm-500 mt-0.5">
                  {isCoach ? 'Share updates with your team' : 'Team news and updates'}
                </p>
              </div>
            </div>
            {isCoach && (
              <CreateAnnouncementFlow
                players={players}
                documents={documents}
              />
            )}
          </div>
        </div>
      </AnimatedItem>

      {/* Content */}
      <AnimatedItem className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {announcements.length === 0 ? (
          <div className="glass-standard rounded-2xl p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">No Announcements</h3>
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
          <div className="glass-standard rounded-2xl p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">Player Profile Not Found</h3>
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

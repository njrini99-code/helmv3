import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { IconBell } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { AnnouncementsCoachView } from '@/components/golf/announcements/AnnouncementsCoachView';
import { AnnouncementsPlayerView } from '@/components/golf/announcements/AnnouncementsPlayerView';
import { CreateAnnouncementFlow } from '@/components/golf/announcements/CreateAnnouncementFlow';

export const metadata: Metadata = {
  title: 'Team Announcements | Helm Sports',
  description: 'View team news, updates, and important announcements from your golf coaching staff',
};

export const revalidate = 120;

export default async function GolfAnnouncementsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role;
  const isCoach = userRole === 'coach';

  let teamId: string | null = null;
  let playerId: string | null = null;

  if (isCoach) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id || null;
    }
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (player) {
      playerId = player.id;
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', player.id)
        .maybeSingle();
      teamId = membership?.team_id || null;
    }
  }

  // Fetch enriched announcements
  const announcementsResult = teamId
    ? await getAnnouncementsWithMeta(teamId, user.id, isCoach, playerId)
    : { success: true as const, data: [] };

  const announcements = announcementsResult.data ?? [];

  // For coaches: fetch roster + team documents for the create flow
  let players: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
  let documents: Array<{ id: string; title: string; file_type: string; file_size: number }> = [];

  if (isCoach && teamId) {
    // Fetch team roster
    const { data: members } = await supabase
      .from('golf_team_members')
      .select('player_id, player:golf_players(id, first_name, last_name)')
      .eq('team_id', teamId)
      .eq('status', 'active');

    players = (members || [])
      .map((m: any) => m.player) // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Fetch team documents
    const { data: docs } = await supabase
      .from('golf_documents')
      .select('id, title, file_type, file_size')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    documents = (docs || []) as typeof documents;
  }

  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false;
    return (Date.now() - new Date(a.published_at).getTime()) < 7 * 86400000;
  }).length;

  return (
    <AnimatedPage>
      {/* Header */}
      <AnimatedItem className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Announcements</h1>
                {recentCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700">
                    {recentCount} new
                  </span>
                )}
              </div>
              <p className="text-slate-500 mt-0.5">
                {isCoach ? 'Share updates with your team' : 'Team news and updates'}
              </p>
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
      <AnimatedItem className="max-w-4xl mx-auto px-6 py-8">
        {announcements.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Announcements</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
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
        ) : (
          <AnnouncementsPlayerView announcements={announcements} playerId={playerId!} />
        )}
      </AnimatedItem>
    </AnimatedPage>
  );
}

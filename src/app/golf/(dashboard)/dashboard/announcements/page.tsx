import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CreateAnnouncementButton } from '@/components/golf/announcements/CreateAnnouncementButton';
import { AnnouncementCard } from '@/components/golf/announcements/AnnouncementCard';
import type { GolfAnnouncement } from '@/lib/types/golf';
import { IconBell } from '@/components/icons';

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
  let announcements: GolfAnnouncement[] = [];

  if (isCoach) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = coach?.team_id || null;
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = player?.team_id || null;
    playerId = player?.id || null;
  }

  if (teamId) {
    const { data: announcementsData } = await supabase
      .from('golf_announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('published_at', { ascending: false });

    announcements = announcementsData || [];
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Announcements</h1>
            <p className="text-slate-500 mt-1">Team news and updates</p>
          </div>
          {isCoach && <CreateAnnouncementButton />}
        </div>

        {/* Announcements List */}
        {announcements.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm text-center">
            <IconBell size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Announcements
            </h3>
            <p className="text-slate-500 mb-4">
              {isCoach
                ? 'Create announcements to keep your team informed'
                : 'No announcements have been posted yet'}
            </p>
            {isCoach && <CreateAnnouncementButton />}
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                isCoach={isCoach}
                playerId={playerId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

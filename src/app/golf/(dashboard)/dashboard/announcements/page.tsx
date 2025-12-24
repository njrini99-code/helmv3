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

  // Get recent count (announcements from last 7 days)
  const recentCount = announcements.filter(a => {
    if (!a.published_at) return false; // Handle null published_at
    const publishedAt = new Date(a.published_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return publishedAt > sevenDaysAgo;
  }).length;

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Announcements</h1>
                {recentCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                    {recentCount} new
                  </span>
                )}
              </div>
              <p className="text-slate-500 mt-0.5">Team news and updates</p>
            </div>
            {isCoach && <CreateAnnouncementButton />}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {announcements.length === 0 ? (
          <div 
            className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center"
            style={{
              animation: 'fadeInUp 0.4s ease-out forwards',
              opacity: 0,
            }}
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconBell size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Announcements</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create announcements to keep your team informed'
                : 'No announcements have been posted yet'}
            </p>
            {isCoach && <CreateAnnouncementButton />}
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement, index) => (
              <div
                key={announcement.id}
                style={{
                  animation: 'fadeInUp 0.4s ease-out forwards',
                  animationDelay: `${index * 50}ms`,
                  opacity: 0,
                }}
              >
                <AnnouncementCard
                  announcement={announcement}
                  isCoach={isCoach}
                  playerId={playerId}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

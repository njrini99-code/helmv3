import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PlayerCard } from '@/components/player/profile/PlayerCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconMail, IconStar, IconVideo, IconTrendingUp } from '@/components/icons';
import { Metadata } from 'next';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('first_name, last_name, primary_position, grad_year')
    .eq('id', params.id)
    .single();

  if (!player) {
    return {
      title: 'Player Not Found | Helm',
    };
  }

  return {
    title: `${player.first_name} ${player.last_name} - ${player.primary_position} | Helm`,
    description: `View ${player.first_name} ${player.last_name}'s baseball recruiting profile. Class of ${player.grad_year}.`,
  };
}

export default async function PublicPlayerProfilePage({ params }: PageProps) {
  const supabase = await createClient();

  // Fetch player with settings and related data
  const { data: player, error } = await supabase
    .from('players')
    .select(`
      *,
      player_settings (*),
      player_videos (
        id,
        title,
        thumbnail_url,
        video_url,
        duration_seconds,
        is_highlight,
        created_at
      ),
      player_dream_schools (
        id,
        rank,
        college_program:college_programs (
          id,
          name,
          division,
          logo_url
        )
      ),
      player_stats (
        *
      )
    `)
    .eq('id', params.id)
    .single();

  if (error || !player) {
    notFound();
  }

  // Check if current user is viewing (for analytics)
  const { data: { user } } = await supabase.auth.getUser();

  // Log engagement event if coach is viewing
  if (user) {
    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach) {
      // Log profile view
      await supabase
        .from('player_engagement_events')
        .insert({
          player_id: player.id,
          coach_id: coach.id,
          engagement_type: 'profile_view',
          metadata: { source: 'public_profile' },
        });
    }
  }

  const settings = player.player_settings || {} as any;
  const showVideos = settings.show_videos !== false;
  const showDreamSchools = settings.show_dream_schools !== false;
  const showStats = settings.show_stats !== false;

  // Get latest stats
  const latestStats = (player as any).player_stats?.[0];

  // Sort dream schools by rank
  const dreamSchools = ((player as any).player_dream_schools || [])
    .sort((a: any, b: any) => a.rank - b.rank)
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-slate-900">Helm</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Player Card */}
          <div className="lg:col-span-2 space-y-6">
            <PlayerCard player={player as any} isPublic={true} />

            {/* Videos Section */}
            {showVideos && (player as any).player_videos && (player as any).player_videos.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconVideo size={20} className="text-green-600" />
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">Highlight Videos</h2>
                  </div>
                </div>
                <div className="p-6 bg-slate-50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(player as any).player_videos.slice(0, 4).map((video: any) => (
                      <div
                        key={video.id}
                        className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-green-200 transition-colors cursor-pointer"
                      >
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title}
                            className="w-full h-32 object-cover"
                          />
                        ) : (
                          <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
                            <IconVideo size={32} className="text-slate-400" />
                          </div>
                        )}
                        <div className="p-3">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {video.title}
                          </p>
                          {video.duration_seconds && (
                            <p className="text-xs text-slate-500 mt-1">
                              {Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Stats Section */}
            {showStats && latestStats && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconTrendingUp size={20} className="text-green-600" />
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">Statistics</h2>
                    {latestStats.season && (
                      <Badge variant="secondary">{latestStats.season}</Badge>
                    )}
                  </div>
                </div>
                <div className="p-6 bg-white">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Batting Stats */}
                    {latestStats.batting_avg && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          AVG
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.batting_avg.toFixed(3)}
                        </p>
                      </div>
                    )}
                    {latestStats.home_runs !== null && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          HR
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.home_runs}
                        </p>
                      </div>
                    )}
                    {latestStats.rbis !== null && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          RBI
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.rbis}
                        </p>
                      </div>
                    )}
                    {latestStats.stolen_bases !== null && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          SB
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.stolen_bases}
                        </p>
                      </div>
                    )}

                    {/* Pitching Stats */}
                    {latestStats.era && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          ERA
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.era.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {latestStats.strikeouts !== null && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          K
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.strikeouts}
                        </p>
                      </div>
                    )}
                    {latestStats.fb_velo_avg && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
                          FB Velo
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {latestStats.fb_velo_avg} mph
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Contact Actions */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
                Connect
              </h3>
              <div className="space-y-2">
                <Button className="w-full">
                  <IconMail size={16} />
                  Send Message
                </Button>
                <Button variant="secondary" className="w-full">
                  Add to Watchlist
                </Button>
              </div>
            </Card>

            {/* Dream Schools */}
            {showDreamSchools && dreamSchools.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconStar size={20} className="text-green-600" />
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                      Dream Schools
                    </h3>
                  </div>
                </div>
                <div className="p-4 bg-slate-50">
                  <div className="space-y-2">
                    {dreamSchools.map((school: any) => (
                      <div
                        key={school.id}
                        className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200"
                      >
                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-green-700">
                            {school.rank}
                          </span>
                        </div>
                        {school.college_program?.logo_url ? (
                          <img
                            src={school.college_program.logo_url}
                            alt={school.college_program.name}
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                            <IconStar size={16} className="text-slate-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {school.college_program?.name}
                          </p>
                          {school.college_program?.division && (
                            <p className="text-xs text-slate-500">
                              {school.college_program.division}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Profile Insights */}
            <Card className="p-6 bg-gradient-to-br from-green-50 to-white">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
                Activity
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Profile Views</span>
                  <span className="text-sm font-semibold text-slate-900">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Watchlists</span>
                  <span className="text-sm font-semibold text-slate-900">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Last Updated</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {player.updated_at ? new Date(player.updated_at).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PlayerCard } from '@/components/player/profile/PlayerCard';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconMessage, IconChartBar } from '@/components/icons';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Parallel fetch: player + current user
  const [{ data: player }, { data: { user } }] = await Promise.all([
    supabase.from('baseball_players').select('*, player_settings (*)').eq('id', id).single(),
    supabase.auth.getUser(),
  ]);

  if (!player) notFound();

  const isPublicView = !user || user.id !== player.user_id;

  // Fetch coach's team to pull season stats (best-effort — null if not a coach)
  let seasonStats: {
    g: number; ab: number; avg: number | null; obp: number | null; slg: number | null; ops: number | null;
    hr: number; rbi: number; sb: number; k: number;
    ip: number; era: number | null; whip: number | null; k9: number | null;
    w: number; l: number; k_thrown: number;
  } | null = null;
  let teamId: string | null = null;

  if (user) {
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('baseball_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .single();

      if (team) {
        teamId = team.id;
        const year = new Date().getFullYear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ss } = await (supabase as any)
          .from('baseball_player_season_stats')
          .select('g,ab,avg,obp,slg,ops,hr,rbi,sb,k,ip,era,whip,k9,w,l,k_thrown')
          .eq('player_id', id)
          .eq('team_id', team.id)
          .eq('season_year', year)
          .maybeSingle();

        if (ss) seasonStats = ss;
      }
    }
  }

  const hasBatting = seasonStats && seasonStats.ab > 0;
  const hasPitching = seasonStats && seasonStats.ip > 0;
  const hasStats = hasBatting || hasPitching;

  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link href="/baseball/dashboard/discover">
          <Button variant="ghost" size="sm" className="mb-6">
            <IconArrowLeft size={16} />
            Back to Discover
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Player Card - Takes 2 columns */}
          <div className="lg:col-span-2">
            <PlayerCard player={player as unknown as Parameters<typeof PlayerCard>[0]['player']} isPublic={isPublicView} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {isPublicView && (
              <>
                <Button className="w-full">
                  <IconMessage size={16} />
                  Send Message
                </Button>
                <Button variant="secondary" className="w-full">
                  Add to Watchlist
                </Button>
              </>
            )}

            {/* Season Stats Card */}
            {hasStats ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                    {new Date().getFullYear()} Stats
                  </h3>
                  {teamId && (
                    <Link
                      href={`/baseball/dashboard/players/${id}/stats`}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <IconChartBar size={12} />
                      Full stats →
                    </Link>
                  )}
                </div>

                {hasBatting && seasonStats && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Batting</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { label: 'AVG', value: seasonStats.avg != null ? seasonStats.avg.toFixed(3).replace(/^0/, '') : '—' },
                        { label: 'OBP', value: seasonStats.obp != null ? seasonStats.obp.toFixed(3).replace(/^0/, '') : '—' },
                        { label: 'SLG', value: seasonStats.slg != null ? seasonStats.slg.toFixed(3).replace(/^0/, '') : '—' },
                        { label: 'OPS', value: seasonStats.ops != null ? seasonStats.ops.toFixed(3) : '—' },
                        { label: 'HR', value: String(seasonStats.hr) },
                        { label: 'RBI', value: String(seasonStats.rbi) },
                        { label: 'SB', value: String(seasonStats.sb) },
                        { label: 'G', value: String(seasonStats.g) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">{label}</span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasBatting && hasPitching && (
                  <div className="border-t border-slate-100 my-3" />
                )}

                {hasPitching && seasonStats && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Pitching</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { label: 'ERA', value: seasonStats.era != null ? seasonStats.era.toFixed(2) : '—' },
                        { label: 'WHIP', value: seasonStats.whip != null ? seasonStats.whip.toFixed(3) : '—' },
                        { label: 'K/9', value: seasonStats.k9 != null ? seasonStats.k9.toFixed(1) : '—' },
                        { label: 'IP', value: seasonStats.ip.toFixed(1) },
                        { label: 'W-L', value: `${seasonStats.w}-${seasonStats.l}` },
                        { label: 'K', value: String(seasonStats.k_thrown) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">{label}</span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Fallback: profile engagement stats when no box score data */
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
                  Quick Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Profile Views</span>
                    <span className="text-sm font-bold text-slate-900">127</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Watchlists</span>
                    <span className="text-sm font-bold text-slate-900">8</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Last Active</span>
                    <span className="text-sm font-bold text-slate-900">2h ago</span>
                  </div>
                  {teamId && (
                    <Link
                      href={`/baseball/dashboard/players/${id}/stats`}
                      className="block mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View game stats →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

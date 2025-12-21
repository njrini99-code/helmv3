import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PlayerCard } from '@/components/player/profile/PlayerCard';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconMessage } from '@/components/icons';
import Link from 'next/link';

interface PageProps {
  params: { id: string };
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const supabase = await createClient();

  // Get player with their settings
  const { data: player } = await supabase
    .from('players')
    .select(`
      *,
      player_settings (*)
    `)
    .eq('id', params.id)
    .single();

  if (!player) {
    notFound();
  }

  // Get current user to determine if this is a coach viewing
  const { data: { user } } = await supabase.auth.getUser();
  const isPublicView = !user || user.id !== player.user_id;

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
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
            <PlayerCard player={player as any} isPublic={isPublicView} />
          </div>

          {/* Action Sidebar */}
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

            {/* Quick Stats Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
                Quick Stats
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Profile Views</p>
                  <p className="text-lg font-semibold text-slate-900">127</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Watchlists</p>
                  <p className="text-lg font-semibold text-slate-900">8</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Last Active</p>
                  <p className="text-lg font-semibold text-slate-900">2h ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

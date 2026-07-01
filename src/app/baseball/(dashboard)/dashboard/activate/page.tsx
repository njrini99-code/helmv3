// =============================================================================
// src/app/baseball/(dashboard)/dashboard/activate/page.tsx
//
// Recruiting activation — SERVER-GATED entry.
//
// This route used to be a client component that gated on useAuth()'s async
// `loading` + a `user.role` check done DURING render. For baseball, role is
// derived from profile presence (not users.role), so the guard frequently never
// matched and the page stranded on a permanent PageLoading shimmer skeleton
// (QA: "STILL-SKELETON", textLen=0). We now resolve the session server-side and
// redirect BEFORE any skeleton paints — the same fix already applied to
// /baseball/dashboard/page.tsx. The interactive activation UI is a thin client
// island that only mounts for an eligible, not-yet-activated player.
// =============================================================================

import { redirect } from 'next/navigation';

import { getSessionProfile } from '@/lib/auth/session';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { IconLock } from '@/components/icons';
import { ActivateRecruitingClient } from '@/components/baseball/player-access/ActivateRecruitingClient';

export const metadata = {
  title: 'Activate Recruiting | Helm Baseball',
  description: 'Make your profile visible to college coaches.',
};

export default async function ActivateRecruitingPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/activate');
  }

  // Coaches (and any non-player) have no business here — bounce to their home.
  if (!session.player) {
    redirect('/baseball/dashboard/command-center');
  }

  const player = session.player;

  // Already activated → straight to the player surface.
  if (player.recruiting_activated) {
    redirect('/baseball/player/today');
  }

  // College players never activate recruiting exposure. Show a clear, honest
  // state instead of a dead skeleton.
  if (player.player_type === 'college') {
    return (
      <>
        <Header title="Activate Recruiting" subtitle="Not available for college players" />
        <div className="mx-auto max-w-lg p-6 lg:p-8">
          <Card variant="glass" className="border-warm-200">
            <CardContent className="p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warm-100">
                <IconLock size={26} className="text-warm-400" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-warm-900">
                Recruiting activation isn&apos;t for college players
              </h2>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-warm-500">
                Recruiting activation is for high school, JUCO, and showcase players. As a college
                player, your team features are available from the main dashboard.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Activate Recruiting" subtitle="Get discovered by college coaches" />
      <ActivateRecruitingClient playerId={player.id} />
    </>
  );
}

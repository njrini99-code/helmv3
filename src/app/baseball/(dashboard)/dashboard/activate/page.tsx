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
//
// Living-Annual migration (P4.27): presentation only — every redirect/guard
// condition below is unchanged, including the exact `player_type === 'college'`
// check. Only the rendered chrome moved to the Living-Annual kit.
// =============================================================================

import { redirect } from 'next/navigation';

import { getSessionProfile } from '@/lib/auth/session';
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';
import { fairwayScope } from '@/lib/redesign/flag';
import { EditorsLetter } from '@/components/baseball/living-annual';
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

  // Product-module gate. This is the most consequential of the sunset's
  // direct-URL gaps: every other recruiting route only *displays* recruiting,
  // while this one TURNS IT ON — it is the opt-in that flips
  // baseball_players.recruiting_activated and makes a player discoverable to
  // other programs. Leaving it reachable meant a bookmarked or guessed URL
  // could enable a module the product is not currently shipping, and the
  // resulting state would outlive the sunset.
  //
  // Placed after the non-player bounce so an unauthenticated or coach caller
  // keeps its existing destination; a player is sent to the same surface the
  // already-activated branch below uses.
  if (!isRecruitingEnabled()) {
    redirect('/baseball/player/today');
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
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <EditorsLetter
            ink="team"
            title="Recruiting activation isn't for college players"
            body="Recruiting activation is for high school, JUCO, and showcase players. As a college player, your team features are available from the main dashboard."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <ActivateRecruitingClient playerId={player.id} />
    </div>
  );
}

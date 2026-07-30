// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (CampsClient branches
// internally on role) — thin server wrapper just requires a signed-in
// baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';
import CampsClient from './CampsClient';

export default async function CampsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  // PRODUCT-MODULE gate (recruiting sunset — product-modules.ts). Camps are
  // prospect-facing showcase events, so `/baseball/dashboard/camps` is already
  // listed in both MODULE_ROUTE_PREFIXES and the middleware's RECRUITING_ROUTES.
  // The gate is repeated here for two reasons:
  //
  //   1. Nothing in this file said the route was withheld. A reader saw a live
  //      page and had to know two lists in two other files to learn otherwise.
  //   2. The middleware's refusal is SEAT-BLIND for a shared surface. Camps is
  //      coach + player (CampsClient branches on role), but the middleware path
  //      for a recruiting route looks up baseball_coaches and sends anyone
  //      without a coach row to PLAYER_HOME — so a player following an old link
  //      was bounced by a coach-profile lookup that has nothing to do with them.
  //      Deciding here means each seat lands on its own home.
  if (!isRecruitingEnabled()) {
    redirect(
      session.role === 'coach' ? '/baseball/dashboard/command-center' : '/baseball/player/today',
    );
  }

  return <CampsClient />;
}

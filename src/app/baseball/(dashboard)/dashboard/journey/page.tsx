// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Player-only per nav-registry.ts ("Player-only; coaches
// never need this view"). Thin server wrapper matches the repo's standard
// shape — JourneyClient (renamed from the former default export) is
// unchanged.
//
// Gated additionally by `player_type` (fix: recruiting hub had no such
// gate — a college player, whose recruiting status is "Never" per the
// Recruiting Activation Model, could reach and fully use the school-interest
// tracker). Mirrors the existing `/dashboard/activate` pattern: an honest
// "not available" state instead of a silent redirect.
import { requireRecruitingPlayerRoute } from '@/lib/baseball/server-route-guards';
import { fairwayScope } from '@/lib/redesign/flag';
import { EditorsLetter } from '@/components/baseball/living-annual';
import JourneyClient from './JourneyClient';

export default async function JourneyPage() {
  const { isCollegePlayer } = await requireRecruitingPlayerRoute();

  // UNREACHABLE while recruiting is sunset (product-modules.ts): the guard above
  // carries the module gate and redirects every player before this returns, so
  // nothing below renders today. Kept, not deleted — it is correct code that the
  // documented restore path needs the moment the flag flips, and the college-
  // player rule it encodes ("recruiting status: Never") is a permanent product
  // rule, not a property of the sunset.
  //
  // The live player-story surface is /baseball/player/timeline. Do not re-link
  // Journey from a player screen expecting it to render.
  if (isCollegePlayer) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <EditorsLetter
            ink="team"
            title="My Journey isn't for college players"
            body="School-interest tracking is for high school, JUCO, and showcase players. As a college player, your team features are available from the main dashboard."
          />
        </div>
      </div>
    );
  }

  return <JourneyClient />;
}

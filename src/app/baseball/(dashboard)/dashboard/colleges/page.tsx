// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Player-only per nav-registry.ts ("Player discovers and
// marks interest in programs. Player-only; coaches use Discover for the
// reverse direction."). Thin server wrapper matches the repo's standard shape
// — CollegesClient (renamed from the former default export) is unchanged.
//
// Gated additionally by `player_type` (fix: recruiting hub had no such
// gate — a college player, whose recruiting status is "Never" per the
// Recruiting Activation Model, could reach and fully use college discovery).
// Mirrors the existing `/dashboard/activate` pattern: an honest "not
// available" state instead of a silent redirect.
import { requireRecruitingPlayerRoute } from '@/lib/baseball/server-route-guards';
import { fairwayScope } from '@/lib/redesign/flag';
import { EditorsLetter } from '@/components/baseball/living-annual';
import CollegesClient from './CollegesClient';

export default async function CollegesPage() {
  const { isCollegePlayer } = await requireRecruitingPlayerRoute();

  if (isCollegePlayer) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <EditorsLetter
            ink="team"
            title="Discover Colleges isn't for college players"
            body="College search is for high school, JUCO, and showcase players. As a college player, your team features are available from the main dashboard."
          />
        </div>
      </div>
    );
  }

  return <CollegesClient />;
}

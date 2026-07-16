// Gated additionally by `player_type` (fix: recruiting hub had no such
// gate — a college player, whose recruiting status is "Never" per the
// Recruiting Activation Model, could reach recruiting-profile-view
// analytics that mean nothing for their situation). Mirrors the existing
// `/dashboard/activate` pattern: an honest "not available" state instead of
// a silent redirect. Coach redirect target (`command-center`) preserved
// exactly via `redirectTo`.
import { fairwayScope } from '@/lib/redesign/flag';
import { requireRecruitingPlayerRoute } from '@/lib/baseball/server-route-guards';
import { EditorsLetter } from '@/components/baseball/living-annual';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const { isCollegePlayer } = await requireRecruitingPlayerRoute({
    redirectTo: '/baseball/dashboard/command-center',
  });

  if (isCollegePlayer) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <EditorsLetter
            ink="team"
            title="My Analytics isn't for college players"
            body="Recruiting profile-view analytics are for high school, JUCO, and showcase players. As a college player, your team features are available from the main dashboard."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <AnalyticsClient />
    </div>
  );
}

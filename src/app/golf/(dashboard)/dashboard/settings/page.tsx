import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsGeneral } from '@/components/fairway/pages/settings';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseSettingsRoute } from '@/clubhouse/routes/settings';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';

export default async function GolfSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Clubhouse Settings (golf_clubhouse_ui): coaches and players, same tables and actions.
  if ((await isClubhouseFor(await getGolfDashboardRole()))) {
    const { section } = await searchParams;
    return <ClubhouseSettingsRoute section={section} />;
  }
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwaySettingsGeneral />
    </div>
  );
}

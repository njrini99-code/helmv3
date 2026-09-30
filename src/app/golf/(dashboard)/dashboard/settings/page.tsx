import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsGeneral } from '@/components/fairway/pages/settings';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseSettingsRoute } from '@/clubhouse/routes/settings';

export default async function GolfSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Clubhouse Settings (golf_clubhouse_ui): coaches and players, same tables and actions.
  const session = await getGolfSessionProfile();
  if (isClubhouseFor(session?.coach ? 'coach' : session?.player ? 'player' : null)) {
    const { section } = await searchParams;
    return <ClubhouseSettingsRoute section={section} />;
  }
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwaySettingsGeneral />
    </div>
  );
}

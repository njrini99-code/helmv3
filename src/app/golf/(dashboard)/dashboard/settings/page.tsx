import { ClubhouseSettingsRoute } from '@/clubhouse/routes/settings';

export default async function GolfSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Clubhouse Settings: coaches and players, one page with a section each.
  const { section } = await searchParams;
  return <ClubhouseSettingsRoute section={section} />;
}

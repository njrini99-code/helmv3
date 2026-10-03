import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: the selection workspace is /qualifiers/[id]/selection; Fairway's qualifier detail still links here (swap audit §14 D8).
export default async function QualifyingWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await redirectToClubhouse({ coach: `/golf/dashboard/qualifiers/${encodeURIComponent(id)}/selection` });
  return children;
}

import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import WatchlistPageClient from './WatchlistPageClient';

export default async function WatchlistPage() {
  await requireRecruitingCoachRoute();
  return <WatchlistPageClient />;
}

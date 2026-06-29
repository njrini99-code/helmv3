import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import DiscoverClient from './DiscoverClient';

export default async function DiscoverPage() {
  await requireRecruitingCoachRoute();
  return <DiscoverClient />;
}

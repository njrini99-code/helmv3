import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import CompareClient from './CompareClient';

export default async function ComparePage() {
  await requireRecruitingCoachRoute();
  return <CompareClient />;
}

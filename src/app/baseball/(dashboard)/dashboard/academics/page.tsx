import { requireAcademicsCoachRoute } from '@/lib/baseball/server-route-guards';
import AcademicsClient from './AcademicsClient';

export default async function AcademicsPage() {
  await requireAcademicsCoachRoute();
  return <AcademicsClient />;
}

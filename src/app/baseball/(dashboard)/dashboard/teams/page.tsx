import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import TeamsClient from './TeamsClient';

export default async function TeamsPage() {
  await requireShowcaseOrgRoute();
  return <TeamsClient />;
}

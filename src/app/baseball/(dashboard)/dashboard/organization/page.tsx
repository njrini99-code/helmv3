import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import OrganizationClient from './OrganizationClient';

export default async function OrganizationPage() {
  await requireShowcaseOrgRoute();
  return <OrganizationClient />;
}

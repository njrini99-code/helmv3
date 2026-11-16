import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import OrganizationClient from './OrganizationClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Organization' };

export default async function OrganizationPage() {
  await requireShowcaseOrgRoute();
  return <OrganizationClient />;
}

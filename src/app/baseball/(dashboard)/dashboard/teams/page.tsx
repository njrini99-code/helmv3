import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import TeamsClient from './TeamsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Teams' };

export default async function TeamsPage() {
  await requireShowcaseOrgRoute();
  return <TeamsClient />;
}

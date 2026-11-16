import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import EventsClient from './EventsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  await requireShowcaseOrgRoute();
  return <EventsClient />;
}

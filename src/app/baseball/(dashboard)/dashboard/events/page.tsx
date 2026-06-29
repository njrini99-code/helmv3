import { requireShowcaseOrgRoute } from '@/lib/baseball/server-route-guards';
import EventsClient from './EventsClient';

export default async function EventsPage() {
  await requireShowcaseOrgRoute();
  return <EventsClient />;
}

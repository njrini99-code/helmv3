import { requireAcademicsCoachRoute } from '@/lib/baseball/server-route-guards';
import AcademicsClient from './AcademicsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Academics' };

export default async function AcademicsPage() {
  await requireAcademicsCoachRoute();
  return <AcademicsClient />;
}

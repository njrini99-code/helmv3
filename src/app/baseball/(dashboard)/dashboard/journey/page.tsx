// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Player-only per nav-registry.ts ("Player-only; coaches
// never need this view"). Thin server wrapper matches the repo's standard
// shape — JourneyClient (renamed from the former default export) is
// unchanged.
import { requireBaseballPlayerRoute } from '@/lib/baseball/server-route-guards';
import JourneyClient from './JourneyClient';

export default async function JourneyPage() {
  await requireBaseballPlayerRoute();
  return <JourneyClient />;
}

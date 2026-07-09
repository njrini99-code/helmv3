// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Player-only per nav-registry.ts ("Player discovers and
// marks interest in programs. Player-only; coaches use Discover for the
// reverse direction."). Thin server wrapper matches the repo's standard shape
// — CollegesClient (renamed from the former default export) is unchanged.
import { requireBaseballPlayerRoute } from '@/lib/baseball/server-route-guards';
import CollegesClient from './CollegesClient';

export default async function CollegesPage() {
  await requireBaseballPlayerRoute();
  return <CollegesClient />;
}

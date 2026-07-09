// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all — only a client-side `user?.role !== 'coach'` render
// branch (harmless UX message, kept in DevPlansClient unchanged). Coach-only
// per nav-registry.ts. Thin server wrapper matches the repo's standard shape.
import { requireBaseballCoachRoute } from '@/lib/baseball/server-route-guards';
import DevPlansClient from './DevPlansClient';

export default async function DevPlansPage() {
  await requireBaseballCoachRoute();
  return <DevPlansClient />;
}

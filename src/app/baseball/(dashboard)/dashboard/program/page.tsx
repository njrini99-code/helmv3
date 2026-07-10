// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all — only a client-side `user?.role !== 'coach'` render
// branch (harmless UX message, kept in ProgramClient unchanged). Coach-only
// per nav-registry.ts ("Organization / program-level details"). Thin server
// wrapper matches the repo's standard shape.
import { requireBaseballCoachRoute } from '@/lib/baseball/server-route-guards';
import ProgramClient from './ProgramClient';

export default async function ProgramPage() {
  await requireBaseballCoachRoute();
  return <ProgramClient />;
}

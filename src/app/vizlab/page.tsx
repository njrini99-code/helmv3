import { notFound } from 'next/navigation';
import { VizLabClient } from './VizLabClient';

/**
 * /_vizlab — dev-only visual-test harness for the new CoachHelm viz.
 * Outside the /golf/dashboard auth gate so it is reachable without a session.
 * Returns 404 in production so it never ships to users.
 */
export const dynamic = 'force-dynamic';

export default function VizLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <VizLabClient />;
}

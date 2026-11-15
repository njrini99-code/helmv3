import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/coach/pending: drawn in the sign-in room, as the page draws it while it checks. */
export default function Loading() {
  return <GateLoading label="Waiting for approval" title="Waiting for approval" line="Checking your request…" say={{ title: 'Almost on the team.', line: 'Your head coach has your request' }} />;
}

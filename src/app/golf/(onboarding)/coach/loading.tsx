import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/coach: drawn in the sign-in room, as the page draws it while it checks. */
export default function Loading() {
  return <GateLoading label="Setting up your program" title="Set up your program" line="Checking your account…" />;
}

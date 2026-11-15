import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/join/[code]: drawn in the sign-in room, as the page draws it while it checks. */
export default function Loading() {
  return <GateLoading label="Checking your team code" title="Checking your code" line="Finding your team…" />;
}

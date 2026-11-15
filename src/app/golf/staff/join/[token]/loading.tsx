import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/staff/join/[token]: drawn in the sign-in room, as the page draws it while it checks. */
export default function Loading() {
  return <GateLoading label="Checking your invitation" title="Your invitation" line="Checking it…" />;
}

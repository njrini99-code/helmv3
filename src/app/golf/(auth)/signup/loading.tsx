import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/signup: the sign-in room, never a skeleton of another page. */
export default function Loading() {
  return <GateLoading label="Join GolfHelm" title="Join GolfHelm" line="Opening…" />;
}

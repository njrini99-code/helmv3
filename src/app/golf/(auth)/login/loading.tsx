import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/login: the sign-in room, never a skeleton of another page. */
export default function Loading() {
  return <GateLoading label="Sign in" title="Sign in" line="Opening…" />;
}

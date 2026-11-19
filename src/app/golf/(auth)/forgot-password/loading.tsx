import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/forgot-password: the sign-in room, as the page draws it. */
export default function Loading() {
  return <GateLoading label="Reset your password" title="Reset password" line="Opening…" />;
}

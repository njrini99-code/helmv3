import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/**
 * Route Suspense fallback for /golf/player. The page reads the account before it draws (loadPlayerOnboard), so this
 * shows while it does: the sign-in room, never the dashboard's skeleton.
 */
export default function Loading() {
  return <GateLoading label="Your game" title="Your game" line="Checking your account…" />;
}

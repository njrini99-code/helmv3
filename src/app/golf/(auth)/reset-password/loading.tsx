import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/reset-password: the reset page's own room. */
export default function Loading() {
  return <GateLoading label="Choose a new password" title="Choose a new password" line="Opening…" say={{ title: 'Back on the course in a minute.', line: 'A new password, and you’re in' }} />;
}

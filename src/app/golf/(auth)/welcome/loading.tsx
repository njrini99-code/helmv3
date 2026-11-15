import { WelcomeStage } from '@/clubhouse/screens/auth/WelcomeStage';

/** Route Suspense fallback for /golf/welcome: the welcome stage itself, empty, so the greeting lands on the same frame. */
export default function Loading() {
  return <WelcomeStage />;
}

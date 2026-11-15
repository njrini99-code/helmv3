import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';

/** Route Suspense fallback for /golf/demo: the demo entry's own room. */
export default function Loading() {
  return <GateLoading label="Try the live demo" title="Try the live demo" line="Opening…" say={{ title: 'Step inside a live team.', line: 'A full roster, real strokes-gained stats and CoachHelm' }} />;
}

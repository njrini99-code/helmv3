import { PlanFormatSkeleton } from '@/clubhouse/screens/practice/PracticeSkeletons';
import '@/clubhouse/styles/coachhelm-plan.css';
import '@/clubhouse/styles/practice.css';

/** Practice › Plan format in waiting: its own shape (GAP-S-16), not CoachHelm's. */
export default function Loading() {
  return <PlanFormatSkeleton />;
}

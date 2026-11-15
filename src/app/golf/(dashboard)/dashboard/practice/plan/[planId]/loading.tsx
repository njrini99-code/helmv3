import { PracticeLoading } from '@/clubhouse/screens/practice/PracticeLoading';
import '@/clubhouse/styles/coachhelm-plan.css';
import '@/clubhouse/styles/practice.css';

/** A plan's page in waiting: the coach's status line and the sheet, or the player's own practice. */
export default function Loading() {
  return <PracticeLoading page="plan" />;
}

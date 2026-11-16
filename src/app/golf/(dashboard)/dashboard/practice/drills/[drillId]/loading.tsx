import { PracticeLoading } from '@/clubhouse/screens/practice/PracticeLoading';
import '@/clubhouse/styles/coachhelm-plan.css';
import '@/clubhouse/styles/practice.css';

/** A drill in waiting: its header and facts card in their loaded places, so the push draws them at once (MAC-04). */
export default function Loading() {
  return <PracticeLoading page="drill" />;
}

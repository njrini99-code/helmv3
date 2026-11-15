import { PracticeLoading } from '@/clubhouse/screens/practice/PracticeLoading';
import '@/clubhouse/styles/coachhelm-plan.css';
import '@/clubhouse/styles/practice.css';

/** Practice, the tab, in waiting: the page's own shape (the coach's, or the player's). */
export default function Loading() {
  return <PracticeLoading page="home" />;
}

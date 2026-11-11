import { PracticeLoading } from '@/clubhouse/screens/practice/PracticeLoading';
import '@/clubhouse/styles/coachhelm-plan.css';
import '@/clubhouse/styles/practice.css';

/** Drills in waiting: the library's own shape. */
export default function Loading() {
  return <PracticeLoading page="drills" />;
}

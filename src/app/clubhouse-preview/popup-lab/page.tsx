import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { PREVIEW_COACH, PREVIEW_SHELL } from '@/clubhouse/preview/fixtures';
import { PopupLab } from '@/clubhouse/preview/PopupLab';
import '@/clubhouse/styles/settings.css';
import '@/clubhouse/styles/popup-lab.css';
import '@/clubhouse/styles/recruiting.css';

/** Local diagnostic fixtures; no reads, writes or customer routes. */
export default function PopupLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ClubhouseFrame userData={PREVIEW_COACH} shell={PREVIEW_SHELL} pathname="/golf/dashboard/settings" forceRebuilt><PopupLab /></ClubhouseFrame>;
}

import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { PREVIEW_COACH, PREVIEW_SHELL } from '@/clubhouse/preview/fixtures';
import { CardLab } from '@/clubhouse/preview/CardLab';
import '@/clubhouse/styles/roster.css';
import '@/clubhouse/styles/card-lab.css';

/** The card kernel beside today's Roster leader cards (design lab pilot P1). Local fixtures; no reads or writes. */
export default function CardLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <ClubhouseFrame userData={PREVIEW_COACH} shell={PREVIEW_SHELL} pathname="/golf/dashboard/roster" forceRebuilt>
      <CardLab />
    </ClubhouseFrame>
  );
}

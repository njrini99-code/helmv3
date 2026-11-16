import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseCalendarHoursRoute } from '@/clubhouse/routes/calendar-hours';

export const metadata: Metadata = {
  title: 'Practice hours',
  description: 'Each player’s countable practice hours for the week, drafted from the calendar and attendance',
};

interface PracticeHoursPageProps {
  /** `?date=YYYY-MM-DD`: any day of the week to show; this week without it. */
  searchParams: Promise<{ date?: string }>;
}

export default async function PracticeHoursPage({ searchParams }: PracticeHoursPageProps) {
  const { date } = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  return <ClubhouseCalendarHoursRoute date={date} />;
}

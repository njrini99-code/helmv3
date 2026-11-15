import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseSettingsRoute } from '@/clubhouse/routes/settings';

export const metadata: Metadata = {
  title: 'Notification preferences',
};

export default async function NotificationPrefsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // One Settings page; this link opens its Notifications section (both roles have one).
  return <ClubhouseSettingsRoute section="notifications" />;
}

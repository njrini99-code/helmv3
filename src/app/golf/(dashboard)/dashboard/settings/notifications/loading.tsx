import { SettingsRouteSkeleton } from '@/clubhouse/screens/settings/SettingsSkeleton';

export default function NotificationSettingsLoading() {
  // This route opens Settings on Notifications, so the skeleton draws that section (GAP-S-17).
  return <SettingsRouteSkeleton section="notifications" />;
}

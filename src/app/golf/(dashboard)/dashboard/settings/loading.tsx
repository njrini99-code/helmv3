import { SettingsRouteSkeleton } from '@/clubhouse/screens/settings/SettingsSkeleton';

export default function SettingsLoading() {
  // The address's `?section=` decides the section the skeleton draws (GAP-S-17).
  return <SettingsRouteSkeleton />;
}

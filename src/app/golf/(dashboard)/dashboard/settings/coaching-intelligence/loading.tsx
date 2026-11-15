import { SettingsSkeleton } from '@/clubhouse/screens/settings/SettingsSkeleton';

/** Route Suspense fallback for /golf/dashboard/settings/coaching-intelligence: Clubhouse opens it as the CoachHelm section of Settings (CH-8401). */
export default function CoachingIntelligenceLoading() {
  return <SettingsSkeleton />;
}

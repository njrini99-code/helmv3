import { SettingsRouteSkeleton } from '@/clubhouse/screens/settings/SettingsSkeleton';

/**
 * Route Suspense fallback for /golf/dashboard/settings/coaching-intelligence: Clubhouse opens it as the CoachHelm section
 * of Settings (CH-8401), so a coach's skeleton draws that section; a player's has no CoachHelm section and draws Account.
 */
export default function CoachingIntelligenceLoading() {
  return <SettingsRouteSkeleton section="coachhelm" />;
}

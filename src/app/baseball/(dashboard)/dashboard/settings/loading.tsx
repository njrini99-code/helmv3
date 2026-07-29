import { SettingsHubSkeleton } from '@/components/baseball/settings/SettingsHubSkeleton';

/**
 * Route-level loading skeleton for the Settings hub (Lane 3 · THE PRESSBOX,
 * team ink).
 *
 * Delegates to the same component the page's own `useAuth()` loading branch
 * renders, so the navigation frame and the auth-settling frame are one picture.
 * Those were previously two different shapes — and the second was a centred
 * full-page spinner — which made every visit to Settings flash two chromes.
 */
export default function Loading() {
  return <SettingsHubSkeleton />;
}

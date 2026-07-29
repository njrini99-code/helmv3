import { SettingsLeafSkeleton } from '@/components/baseball/settings/SettingsLeafSkeleton';

/**
 * Route-level loading skeleton.
 *
 * Shape-matches `SettingsShell` (masthead + section cards) instead of the
 * centred `PageLoading` spinner this used to render — that spinner belonged to
 * no design system in the product and was replaced wholesale a frame later, so
 * every navigation inside Settings flashed a foreign chrome.
 */
export default function Loading() {
  return <SettingsLeafSkeleton label="Loading Coaching Philosophy…" sections={3} />;
}

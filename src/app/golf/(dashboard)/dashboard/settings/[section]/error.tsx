'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/golf/dashboard/settings/[section]"
      component="SettingsSectionPage"
      title="Failed to load settings"
      message="We couldn't load this settings page. Please try again."
      homePath="/golf/dashboard/settings"
    />
  );
}

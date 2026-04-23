'use client';

/**
 * OfflineWarningBanner — hard-disabled.
 *
 * The original floating banner was firing false positives on the dashboard
 * whenever /api/health hiccupped. Round-entry flow uses its own inline offline
 * messaging (see new-round-client.tsx and recover-round-client.tsx). Keeping
 * this as a no-op export so callers that still mount it don't break.
 */

interface OfflineWarningBannerProps {
  variant?: 'inline' | 'floating' | 'modal';
  showForSlowConnection?: boolean;
  dismissable?: boolean;
  onDismiss?: () => void;
  className?: string;
  context?: string;
}

export function OfflineWarningBanner(_props: OfflineWarningBannerProps) {
  return null;
}

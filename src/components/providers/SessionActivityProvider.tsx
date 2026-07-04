'use client';

import { useSessionActivity } from '@/lib/auth/session-activity';

/**
 * Provider component that enables automatic session timeout
 *
 * Wrap authenticated layouts with this component to enable:
 * - Automatic logout after the idle window (SESSION_IDLE_TIMEOUT_MS — 5 minutes)
 *   when the tab is hidden or the user is genuinely away
 * - Activity tracking (mouse, keyboard, touch events)
 * - Visible-tab heartbeat so reading a dashboard without moving the mouse
 *   does not trip the idle window
 * - Idle checks every minute + on tab re-show (visibilitychange / pageshow)
 *
 * Usage:
 * ```tsx
 * export default function DashboardLayout({ children }) {
 *   return (
 *     <SessionActivityProvider>
 *       {children}
 *     </SessionActivityProvider>
 *   );
 * }
 * ```
 */
export function SessionActivityProvider({ children }: { children: React.ReactNode }) {
  useSessionActivity();
  return <>{children}</>;
}

'use client';

import { useSessionActivity } from '@/lib/auth/session-activity';

/**
 * Provider component that enables automatic session timeout
 *
 * Wrap authenticated layouts with this component to enable:
 * - Automatic logout after 30 minutes of inactivity
 * - Activity tracking (mouse, keyboard, touch events)
 * - Session timeout checks every minute
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

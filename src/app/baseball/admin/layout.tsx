import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';

/**
 * /baseball/admin/* is idle-gated by the middleware (any sport path is), so it
 * must mount the activity tracker — WITHOUT it, nothing refreshes the
 * sb_last_activity marker and the idle gate bounces an actively-working admin
 * every ~5 minutes (2026-07-20 incident on the golf admin CRM). Auth/role
 * checks live in each page (e.g. demo-sessions does its own requireAdmin).
 */
export default function BaseballAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionActivityProvider>{children}</SessionActivityProvider>;
}

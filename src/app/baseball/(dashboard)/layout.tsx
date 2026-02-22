'use client';

import { ToastProvider } from '@/components/ui/toast';
import { SidebarProvider } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { PeekPanelProvider } from '@/components/baseball/peek-panel';
import { BaseballDashboardShell } from '@/components/baseball/dashboard-shell';
import { useBaseballAuth } from '@/hooks/use-baseball-auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, authorized, role } = useBaseballAuth();

  if (loading || !authorized) {
    return <PageLoading />;
  }

  return (
    <SidebarProvider>
      <ToastProvider>
        <SessionActivityProvider>
          <LastSeenUpdater />
          <PeekPanelProvider>
            <BaseballDashboardShell role={role}>{children}</BaseballDashboardShell>
          </PeekPanelProvider>
        </SessionActivityProvider>
      </ToastProvider>
    </SidebarProvider>
  );
}

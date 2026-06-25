'use client';

import { BaseballShellLayout } from '@/components/baseball/BaseballShellLayout';

export default function PlayerDashboardLayout({ children }: { children: React.ReactNode }) {
  return <BaseballShellLayout requiredRole="player">{children}</BaseballShellLayout>;
}

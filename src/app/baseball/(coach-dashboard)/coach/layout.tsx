'use client';

import { BaseballShellLayout } from '@/components/baseball/BaseballShellLayout';

export default function CoachDashboardLayout({ children }: { children: React.ReactNode }) {
  return <BaseballShellLayout requiredRole="coach">{children}</BaseballShellLayout>;
}

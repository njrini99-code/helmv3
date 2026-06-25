'use client';

import { BaseballShellLayout } from '@/components/baseball/BaseballShellLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <BaseballShellLayout requiredRole={null}>{children}</BaseballShellLayout>;
}

'use client';

import { AuthPendingDots } from '@/components/auth/baseball-auth-shell';

/**
 * Baseball-branded bootstrap state while the dashboard session guard settles
 * auth + nav context after sign-in. Replaces the generic 4-card page skeleton
 * so the login → command center transition does not feel like a product switch.
 */
export function BaseballDashboardBootstrap({
  label = 'Opening your command center',
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream-100 px-6">
      <AuthPendingDots label={label} />
    </div>
  );
}

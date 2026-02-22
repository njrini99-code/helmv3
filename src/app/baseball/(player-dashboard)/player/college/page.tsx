'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/loading';

/**
 * College players don't have a separate recruiting dashboard.
 * They use the team dashboard. Redirect them to the team dashboard
 * which has their stats, events, and team features.
 */
export default function CollegePlayerDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/baseball/dashboard/team');
  }, [router]);

  return <PageLoading />;
}

'use client';

import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { WatchlistClient } from './WatchlistClient';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';

function WatchlistContent() {
  const { isAllowed, isLoading } = useRecruitingRouteProtection();

  // Route protection - show loading while checking or redirecting
  if (isLoading || !isAllowed) {
    return <PageLoading />;
  }

  return <WatchlistClient />;
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WatchlistContent />
    </Suspense>
  );
}

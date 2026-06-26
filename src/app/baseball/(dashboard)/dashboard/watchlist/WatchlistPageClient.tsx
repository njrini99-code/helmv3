'use client';

import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { WatchlistClient } from './WatchlistClient';

function WatchlistContent() {
  return <WatchlistClient />;
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WatchlistContent />
    </Suspense>
  );
}

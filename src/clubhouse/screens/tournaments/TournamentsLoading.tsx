'use client';

import { SkelRows, Skeleton } from '../../ui/States';
import { TourLoading, useTourPhone } from './parts';

/**
 * The Tournaments routes' Suspense fallback (each segment's loading.tsx): the page's loading state (CH-16401) at the
 * head's geometry. Tournaments has no Fairway page, so there is no other frame to fall back to.
 */
export function TournamentsLoading({ title }: { title: string }) {
  const phone = useTourPhone();
  return (
    <TourLoading view="home" phone={phone} title={title}>
      <Skeleton width="100%" height={phone ? 160 : 180} radius={16} shape="solid" />
      <SkelRows rows={3} lead />
    </TourLoading>
  );
}

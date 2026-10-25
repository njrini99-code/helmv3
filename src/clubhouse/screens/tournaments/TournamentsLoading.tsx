'use client';

import { TourPlaceholder } from './TourPlaceholder';

/**
 * The Tournaments routes' Suspense fallback (each segment's loading.tsx): the page's loading state (CH-16401) at the
 * head's geometry. Tournaments has no Fairway page, so there is no other frame to fall back to.
 */
export function TournamentsLoading({ title }: { title: string }) {
  return <TourPlaceholder view="loading" eyebrow="Tournaments" title={title} detail="" load="loading" />;
}

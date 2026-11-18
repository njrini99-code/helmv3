'use client';

import type { ReactNode } from 'react';
import { SkelRows, Skeleton } from '../../ui/States';
import { TourLoading, useTourPhone, type ChTourView } from './parts';

/** The routes whose loading.tsx names its own view; the event's other pages open on the desk's. */
export type TournamentsLoadingView = Extract<ChTourView, 'home' | 'desk' | 'form' | 'lineup' | 'live' | 'compare' | 'history' | 'links'>;

/** Each view's class and body, as its screen draws its own loading state (GAP-S-15), so nothing jumps when the screen lands. */
const BODIES: Record<TournamentsLoadingView, { className?: string; body: (phone: boolean) => ReactNode }> = {
  home: {
    body: (phone) => (
      <>
        <Skeleton width="100%" height={phone ? 160 : 180} radius={16} shape="solid" />
        <SkelRows rows={3} lead />
      </>
    ),
  },
  desk: {
    className: 'ch-tour-desk',
    body: (phone) => (
      <>
        <Skeleton width={phone ? '70%' : 420} height={24} radius={12} />
        <Skeleton width="100%" height={40} radius={12} />
        <SkelRows rows={phone ? 5 : 7} trail />
      </>
    ),
  },
  form: {
    className: 'ch-tour-lu-form',
    body: (phone) => (
      <>
        <Skeleton width="100%" height={52} radius={12} />
        <Skeleton width="100%" height={phone ? 420 : 360} radius={16} shape="solid" />
      </>
    ),
  },
  lineup: {
    className: 'ch-tour-lu',
    body: (phone) => (
      <>
        <Skeleton width="100%" height={phone ? 260 : 220} radius={16} shape="solid" />
        <SkelRows rows={4} lead />
      </>
    ),
  },
  live: {
    className: 'ch-tour-live',
    body: (phone) => (
      <>
        <Skeleton width="100%" height={phone ? 120 : 132} radius={16} shape="solid" />
        <SkelRows rows={5} lead />
      </>
    ),
  },
  compare: {
    className: 'ch-tour-cmp',
    body: (phone) => (
      <>
        <Skeleton width="100%" height={phone ? 44 : 40} radius={12} />
        <Skeleton width="100%" height={phone ? 120 : 190} radius={16} shape="solid" />
        <SkelRows rows={phone ? 4 : 6} trail />
      </>
    ),
  },
  history: {
    className: 'ch-tour-rev-hist',
    body: (phone) => (
      <>
        <Skeleton width="100%" height={phone ? 44 : 40} radius={12} />
        <Skeleton width="100%" height={phone ? 230 : 300} radius={16} shape="solid" />
        {!phone && <SkelRows rows={5} trail />}
      </>
    ),
  },
  links: {
    className: 'ch-tour-rev',
    body: (phone) => (
      <>
        <SkelRows rows={4} lead />
        <Skeleton width="100%" height={phone ? 120 : 96} radius={16} shape="solid" />
      </>
    ),
  },
};

/**
 * The Tournaments routes' Suspense fallback (each segment's loading.tsx): the page's loading state (CH-16401) at the
 * head's geometry, in the boxes of the view the route opens (GAP-S-15). Tournaments has no Fairway page, so there is no
 * other frame to fall back to.
 */
export function TournamentsLoading({ title, view = 'home' }: { title: string; view?: TournamentsLoadingView }) {
  const phone = useTourPhone();
  const { className, body } = BODIES[view];
  return (
    <TourLoading view={view} phone={phone} title={title} className={className}>
      {body(phone)}
    </TourLoading>
  );
}

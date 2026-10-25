'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ChTourDeskTab } from './types';

/**
 * Where a Tournaments view links to. The views never write a URL by hand: they ask `useTourPaths()`, which gives the real
 * routes (the manifest's `plannedRoutes`, plan 14.1) unless a `TourPathsProvider` above says otherwise. The preview
 * wraps its screens in one that points every link at `/clubhouse-preview/tournament-*` and keeps the `?state=` it was
 * opened with, so a click stays inside the same scenario.
 */
export interface ChTourPaths {
  home: () => string;
  desk: (eventId: string, tab?: ChTourDeskTab) => string;
  review: (eventId: string) => string;
  history: () => string;
  links: () => string;
  compare: (eventId?: string | null) => string;
  newEvent: () => string;
  editEvent: (eventId: string) => string;
  lineup: (eventId: string) => string;
  live: (eventId: string) => string;
  player: (eventId?: string | null) => string;
  qualifier: (qualifierId: string) => string;
}

const BASE = '/golf/dashboard/tournaments';
const withTab = (href: string, tab?: ChTourDeskTab) => (tab && tab !== 'overview' ? `${href}?tab=${tab}` : href);

export const TOUR_ROUTES: ChTourPaths = {
  home: () => BASE,
  desk: (id, tab) => withTab(`${BASE}/${id}`, tab),
  review: (id) => `${BASE}/${id}?tab=review`,
  history: () => `${BASE}/history`,
  links: () => `${BASE}/links`,
  compare: (id) => (id ? `${BASE}/compare?event=${id}` : `${BASE}/compare`),
  newEvent: () => `${BASE}/new`,
  editEvent: (id) => `${BASE}/${id}/edit`,
  lineup: (id) => `${BASE}/${id}/lineup`,
  live: (id) => `${BASE}/${id}/live`,
  player: (id) => (id ? `${BASE}/${id}` : BASE),
  qualifier: (id) => `/golf/dashboard/qualifiers/${id}`,
};

/** The preview's paths (`/clubhouse-preview/tournament-*`), carrying the scenario's `?state=` along. */
export function tourPreviewPaths(state?: string | null): ChTourPaths {
  const at = (screen: string, params: Record<string, string | null | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (state && state !== 'ready') q.set('state', state);
    const s = q.toString();
    return `/clubhouse-preview/${screen}${s ? `?${s}` : ''}`;
  };
  return {
    home: () => at('tournaments'),
    desk: (id, tab) => at('tournament-desk', { event: id, tab: tab && tab !== 'overview' ? tab : null }),
    review: () => at('tournament-review'),
    history: () => at('tournament-history'),
    links: () => at('tournament-links'),
    compare: (id) => at('tournament-compare', { event: id ?? null }),
    newEvent: () => at('tournament-form'),
    editEvent: () => at('tournament-form', { view: 'edit' }),
    lineup: () => at('tournament-lineup'),
    live: () => at('tournament-live'),
    player: (id) => at('tournament-player', { event: id ?? null }),
    qualifier: () => '/clubhouse-preview/qualifier',
  };
}

const TourPathsContext = createContext<ChTourPaths>(TOUR_ROUTES);

export function TourPathsProvider({ paths, children }: { paths: ChTourPaths; children: ReactNode }) {
  return <TourPathsContext.Provider value={paths}>{children}</TourPathsContext.Provider>;
}

export function useTourPaths(): ChTourPaths {
  return useContext(TourPathsContext);
}

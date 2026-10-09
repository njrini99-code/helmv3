'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { clubhouseFontVariables } from '../lib/fonts';
import { ClubhouseMarker, useInClubhouse } from './context';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';

/**
 * A route `error.tsx` for Clubhouse screens, inside the shell or not (P007 D3). The shared RouteErrorBoundary already
 * classifies the error, reports it, and on a stale chunk (ChunkLoadError, "Loading chunk …", after a deploy) asks the
 * one recovery coordinator (`lib/recovery/client`) to reload: that reload happens once, under the session's attempt
 * budget and latch, and never over unsaved work. Every other error shows Clubhouse's own route error (RouteErrorView).
 *
 * Inside the shell that is all it does. Above it (the preview routes, where a crash fell through to the app's generic
 * Helm page) it brings its own Clubhouse root, fonts and tokens, so the same view draws.
 */
export function ClubhouseRouteError({
  error,
  reset,
  route,
  homePath = '/golf/dashboard',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  route: string;
  homePath?: string;
}) {
  const inside = useInClubhouse();
  const view = (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route={route}
      component="Clubhouse"
      title="Something went wrong on this page"
      message="It has been reported automatically."
      homePath={homePath}
    />
  );
  if (inside) return view;
  return (
    <div className={`ch-root ${clubhouseFontVariables}`} data-ui="clubhouse">
      <ClubhouseMarker>{view}</ClubhouseMarker>
    </div>
  );
}

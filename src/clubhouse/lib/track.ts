'use client';

import * as Sentry from '@sentry/nextjs';
import { logError } from '@/lib/error-logging';

/**
 * Clubhouse error tracking, client side. Everything funnels into the existing
 * logError pipeline (Sentry + error_logs + Bridge dedupe) with two tags on
 * every event:
 *   ui=clubhouse        - split Clubhouse from Fairway in Sentry
 *   surface=<screen.section>  - which part of which screen, for example home.leaderboard
 * Server-side reads use chLogServer in ./track-server.
 *
 * What the coach never sees is watched app-wide (src/instrumentation-client.ts), and Clubhouse inherits it: Sentry
 * Replay flags rage clicks (CH-1951), dead clicks (CH-1952) and slow clicks (CH-1953) in the sessions it records, and
 * browser tracing reports INP, CLS and LCP (CH-1954).
 */
export type ChSeverity = 'low' | 'medium' | 'high';

export function chReport(
  error: unknown,
  ctx: { surface: string; action?: string; severity?: ChSeverity; extra?: Record<string, unknown> },
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(err, { ui: 'clubhouse', surface: ctx.surface, component: `clubhouse.${ctx.surface}`, action: ctx.action, ...ctx.extra }, ctx.severity ?? 'medium');
}

/** A breadcrumb for user intent, so an error's Sentry trail shows what the coach did first. */
export function chTrail(message: string, data?: Record<string, string | number | boolean>): void {
  Sentry.addBreadcrumb({ category: 'clubhouse', message, data, level: 'info' });
}

/** Tag the whole session once the Clubhouse shell mounts. */
export function chTagSession(): void {
  Sentry.setTag('ui', 'clubhouse');
}

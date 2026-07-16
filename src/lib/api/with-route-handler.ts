// =============================================================================
// src/lib/api/with-route-handler.ts
//
// withRouteHandler — the shared error-tracking wrapper for Next.js route
// handlers. It standardizes the one thing a silent API route always got
// wrong: an uncaught throw disappearing with nothing but a generic 500,
// invisible to both Sentry and the Helm Bridge admin feed.
//
// Contract: NEVER changes a route's success-path behavior. It only wraps
// the call — on a clean return (including early `return NextResponse.json(
// {...}, { status: 4xx })` branches inside the handler) the response passes
// straight through untouched. Only an actual thrown exception is caught,
// logged, and converted to a generic 500 JSON body. Next.js control-flow
// "errors" (redirect(), notFound(), etc. — digest starting with 'NEXT_')
// are re-thrown as-is so the framework can still handle them.
//
// This is NOT a 'use server' module — it's a plain helper imported by route
// handler files, which are already server-only.
//
// USAGE
//   export const GET = withRouteHandler(
//     'golfPuttTendenciesApi.get',
//     { sport: 'golf', featureArea: 'golf_putt_tendencies' },
//     async (request, { params }: { params: Promise<{ playerId: string }> }) => {
//       ...
//       return NextResponse.json(payload);
//     },
//   );
// =============================================================================

import { NextResponse } from 'next/server';
import { logServerException } from '@/lib/server-error-logger';

export interface WithRouteHandlerOptions {
  /** Defaults to 'route_handler'. Use 'cron' for scheduled/Inngest-triggered routes. */
  source?: 'route_handler' | 'cron';
  sport?: 'golf' | 'baseball' | 'shared';
  feature?: string;
  featureArea?: string;
  /** Defaults to 'error'. */
  severity?: 'warning' | 'error' | 'critical';
}

/** Next.js control-flow signals (redirect(), notFound()) are framework behavior, not incidents. */
function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}

/**
 * Wrap a route handler so any uncaught throw is logged to Sentry + error_logs
 * + admin_events before falling back to a generic 500 JSON response. `Req` is
 * inferred from the handler you pass in (Request or NextRequest), and `Args`
 * captures whatever additional context arg Next.js supplies (e.g. the
 * `{ params }` object on dynamic routes).
 */
export function withRouteHandler<Req extends Request, Args extends unknown[]>(
  name: string,
  opts: WithRouteHandlerOptions,
  handler: (request: Req, ...args: Args) => Promise<Response>,
): (request: Req, ...args: Args) => Promise<Response> {
  return async (request: Req, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (isNextControlFlowError(error)) {
        throw error;
      }

      await logServerException(error, {
        action: name,
        route: new URL(request.url).pathname,
        source: opts.source ?? 'route_handler',
        handled: false,
        statusCode: 500,
        sport: opts.sport,
        feature: opts.feature,
        featureArea: opts.featureArea,
      }, opts.severity ?? 'error');

      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Liveness probe — GET/HEAD /api/ping.
 *
 * Answers "did this request reach the server and come back", and nothing else.
 * No database, no auth (src/proxy.ts lets it past updateSession), no body.
 *
 * WHY IT IS NOT /api/health. The browser's connectivity hook
 * (src/hooks/golf/use-connection-status.ts) used to ping /api/health, the
 * database READINESS probe, every 30s from every mounted instance — the
 * Fairway dashboard shell mounts one for every golf page, and a round screen
 * adds another.
 * Every ping cost a GoTrue getUser in the proxy (1.5s budget) plus up to two
 * 2.5s readiness reads, and the hook gives up at 5s. So whenever Supabase was
 * slow (2026-10-21 14:13Z and 18:40Z: every PostgREST request took 2-27s while
 * Postgres itself answered in milliseconds), the probe ran past the hook's
 * timeout and a player whose phone was online was told "Unable to reach
 * server" — the exact false offline the hook's own comment says it must never
 * produce. Each of those pings also raised two Sentry events
 * (JAVASCRIPT-NEXTJS-YY) and a degraded row for a database question nobody on
 * the page was asking.
 *
 * /api/health stays the readiness probe for the things that do ask it:
 * scripts/warm-edge.ts, StaleDeploymentRecoveryScript, and the Sentry uptime
 * monitor "Helm readiness /api/health".
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function alive(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export function GET(): NextResponse {
  return alive();
}

export function HEAD(): NextResponse {
  return alive();
}

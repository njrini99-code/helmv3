import { NextResponse, type NextRequest } from 'next/server';
import { logServerException } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Edge→node capture bridge for the edge-runtime branch of onRequestError
 * (src/instrumentation.ts). The edge runtime cannot import
 * server-error-logger directly (createAdminClient is not edge-safe), so it
 * fires-and-forgets a POST here. Shared-secret header, tiny payload,
 * best-effort semantics — mirrors log-auth-failure/route.ts.
 */

const inMemoryWindow = new Map<string, { count: number; resetAt: number }>();

function overLimit(ip: string): boolean {
  const now = Date.now();
  const entry = inMemoryWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    inMemoryWindow.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

// Mirrors the routeType→source mapping in src/instrumentation.ts. Kept as a
// small local copy (not shared) so this route stays import-light — it must
// not pull in the same module graph the edge runtime avoids.
function mapRouteTypeToSource(
  routeType: unknown,
): 'server_component' | 'route_handler' | 'server_action' | 'request_hook' {
  switch (routeType) {
    case 'route':
      return 'route_handler';
    case 'action':
      return 'server_action';
    case 'proxy':
    case 'middleware':
      return 'request_hook';
    default:
      return 'server_component';
  }
}

interface RelayedErrorBody {
  message?: unknown;
  stack?: unknown;
  name?: unknown;
  route?: unknown;
  routeType?: unknown;
  routerKind?: unknown;
  method?: unknown;
}

export async function POST(request: NextRequest) {
  const expected = process.env.INTERNAL_LOG_KEY;
  if (!expected || request.headers.get('x-internal-log-key') !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (overLimit(ip)) return NextResponse.json({ ok: false }, { status: 429 });

  let body: RelayedErrorBody = {};
  try {
    body = await request.json();
  } catch {
    // tolerate malformed bodies — best-effort telemetry
  }

  const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : 'edge runtime request error';
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 8000) : null;
  const name = typeof body.name === 'string' ? body.name.slice(0, 200) : 'Error';
  const route = typeof body.route === 'string' ? body.route.slice(0, 300) : null;
  const routeType = typeof body.routeType === 'string' ? body.routeType.slice(0, 50) : null;
  const routerKind = typeof body.routerKind === 'string' ? body.routerKind.slice(0, 50) : null;
  const method = typeof body.method === 'string' ? body.method.slice(0, 10) : null;

  const relayedError = new Error(message);
  relayedError.name = name;
  if (stack) relayedError.stack = stack;

  await logServerException(
    relayedError,
    {
      action: route ?? 'edge.onRequestError',
      route,
      source: mapRouteTypeToSource(routeType),
      handled: false,
      statusCode: 500,
      runtime: 'edge',
      metadata: { routerKind, routeType, method },
    },
    'error',
  );

  return new NextResponse(null, { status: 204 });
}

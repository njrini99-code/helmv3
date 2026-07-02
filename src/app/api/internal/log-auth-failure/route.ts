import { NextResponse, type NextRequest } from 'next/server';
import { logServerEvent } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Edge→node capture bridge. proxy.ts (edge) cannot use server-error-logger
 * directly (createAdminClient is not edge-safe), so it fires-and-forgets a
 * POST here. Shared-secret header, tiny payload, best-effort semantics.
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

export async function POST(request: NextRequest) {
  const expected = process.env.INTERNAL_LOG_KEY;
  if (!expected || request.headers.get('x-internal-log-key') !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (overLimit(ip)) return NextResponse.json({ ok: false }, { status: 429 });

  let body: { message?: unknown; pathname?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // tolerate malformed bodies — best-effort telemetry
  }
  const message = String(body.message ?? 'middleware auth failure').slice(0, 2000);
  const pathname = typeof body.pathname === 'string' ? body.pathname.slice(0, 300) : null;

  await logServerEvent(
    message,
    { action: 'middleware.updateSession', source: 'auth', route: pathname, skipSentry: false },
    'warning',
  );
  return new NextResponse(null, { status: 204 });
}

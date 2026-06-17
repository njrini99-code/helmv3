// ============================================================================
// DURABLE PARTIAL-ROUND SAVE — unload-safe endpoint for sendBeacon / keepalive
// ----------------------------------------------------------------------------
// The shot-tracking screens persist progress two ways while the round is open:
//   1. SYNCHRONOUS localStorage emergencySave (always completes before freeze)
//   2. an async server save via the `savePartialRound` server action
//
// (2) is reliable while the page is FOREGROUNDED, but the browser KILLS an
// in-flight server-action fetch the moment the page freezes — phone lock, app
// switch, tab close. On a flaky course connection that meant a player's
// in-progress round never reached the server, so it never appeared in
// "Unfinished Rounds" and could not be resumed (prod incident 2026-06-10:
// a prospect played 6 holes, got booted, and lost the round).
//
// `navigator.sendBeacon` (and `fetch(..., { keepalive: true })`) are the only
// transports the browser GUARANTEES to deliver during unload. They POST here;
// this handler performs the SAME write as the server action by delegating to
// `savePartialRound` — no duplicated write semantics, same auth + RLS scoping.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { savePartialRound, type PartialRoundData } from '@/app/golf/actions/golf';
import { logServerError } from '@/lib/server-error-logger';

// Reads auth cookies via savePartialRound → createClient(); always dynamic.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { data?: PartialRoundData; roundId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  }

  if (!body?.data || typeof body.data !== 'object') {
    return NextResponse.json({ success: false, error: 'Missing round data' }, { status: 400 });
  }

  const roundId = typeof body.roundId === 'string' && body.roundId.length > 0 ? body.roundId : undefined;

  try {
    // Delegates to the same server action the foreground autosave uses — auth,
    // player scoping, optimistic locking, and non-destructive upserts all live
    // there. We only adapt the transport (beacon/keepalive ↔ HTTP).
    const result = await savePartialRound(body.data, roundId);

    if (!result.success) {
      // An expired session mid-round is the one failure worth a 401 so the
      // keepalive-fetch fallback can distinguish "signed out" from a transient
      // error. Everything else returns 200 with the structured result; the
      // client's localStorage backup is the hard fallback regardless.
      const status = result.error === 'You must be signed in' ? 401 : 200;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    await logServerError(
      `Beacon partial-save failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        action: 'partialSaveBeaconRoute',
        source: 'route_handler',
        featureArea: 'shot_tracking',
        route: request.nextUrl.pathname,
        url: request.url,
        roundId: roundId ?? null,
        extra: { stack: error instanceof Error ? error.stack : undefined },
      },
      'critical'
    );
    return NextResponse.json({ success: false, error: 'Failed to save round.' }, { status: 500 });
  }
}

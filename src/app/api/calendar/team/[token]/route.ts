/**
 * Team Calendar iCal Feed API Route
 *
 * NOTE: This feature requires additional columns on golf_teams table:
 * - calendar_feed_token: string
 * - calendar_feed_enabled: boolean
 *
 * These columns don't exist yet in the current schema.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Await params to avoid Next.js warnings - token will be used when schema is updated
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token: _token } = await params;

  // Feature not yet implemented - requires schema additions
  return new NextResponse(
    'Team calendar feeds are not yet implemented. This feature requires additional database columns.',
    { status: 501 }
  );
}

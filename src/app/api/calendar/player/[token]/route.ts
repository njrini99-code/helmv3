/**
 * Player Calendar iCal Feed API Route
 *
 * NOTE: This feature requires additional columns on golf_players table:
 * - calendar_feed_token: string
 * - calendar_feed_enabled: boolean
 * - team_id: string (or join via golf_team_members)
 *
 * These columns don't exist yet in the current schema.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Await params to avoid Next.js warnings
  const { token: _token } = await params;

  // Feature not yet implemented - requires schema additions
  return new NextResponse(
    'Player calendar feeds are not yet implemented. This feature requires additional database columns.',
    { status: 501 }
  );
}

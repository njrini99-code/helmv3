/**
 * Putt Details API Route
 *
 * NOTE: This feature requires the putt_details table to be created.
 * The table should store detailed putt information including miss tags,
 * break direction, distance, etc.
 *
 * The table doesn't exist yet in the current schema.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest) {
  // Feature not yet implemented - requires schema additions
  return NextResponse.json(
    { error: 'Putt details tracking is not yet implemented. This feature requires additional database tables.' },
    { status: 501 }
  );
}

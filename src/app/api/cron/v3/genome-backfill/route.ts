/**
 * v3 genome one-shot backfill — GET/POST /api/cron/v3/genome-backfill
 *
 * Runs the orchestrator for EVERY active team player in a single
 * invocation. Used once after the schema lands to seed the vector for
 * everyone; the nightly cron handles ongoing refresh after that.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { computeGenomeForPlayer } from '@/lib/coachhelm/v3/genome/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface BackfillSummary {
  total_players: number;
  computed: number;
  null_only: number;
  errors: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('status', 'active');
  const playerIds = Array.from(new Set((members ?? []).map((m) => m.player_id)));

  let computed = 0;
  let nullOnly = 0;
  let errors = 0;
  for (const pid of playerIds) {
    try {
      const r = await computeGenomeForPlayer(pid);
      if (r.errors > 0) errors += r.errors;
      if (r.dimensions_computed > 0) computed += 1;
      else nullOnly += 1;
    } catch (err) {
      errors += 1;
      await logServerError(
        `genome-backfill exception for ${pid}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.genome-backfill' },
      );
    }
  }

  return NextResponse.json({
    total_players: playerIds.length,
    computed,
    null_only: nullOnly,
    errors,
    duration_ms: Date.now() - startedAt,
  } satisfies BackfillSummary);
}

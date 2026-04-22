/**
 * Durable analyze-player endpoint.
 *
 * Called from `submitGolfRoundComprehensive` via `fetch(..., { keepalive: true })`
 * and from the safety-net cron. Runs the V2 engine for a single player and
 * persists any new insights via `triggerPlayerInsightsAfterRound`.
 *
 * Auth: requires `x-internal-secret: $COACHHELM_INTERNAL_SECRET` header.
 * Runtime: Node.js (Fluid Compute); maxDuration 300s so Vercel doesn't kill the
 * process mid-analysis if feature extraction + NLG run long for large rosters.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  playerId: z.string().uuid(),
  triggerReason: z
    .enum(['round_submitted', 'manual_refresh', 'cron', 'safety_net'])
    .default('round_submitted'),
  roundId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const expected = process.env.COACHHELM_INTERNAL_SECRET;
  if (!expected || req.headers.get('x-internal-secret') !== expected) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid body',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  try {
    const result = await triggerPlayerInsightsAfterRound(parsed.playerId);
    if (!result.success) {
      // Non-fatal: engine returned a structured failure (e.g. team missing,
      // CoachHelm disabled). Surface as 200 so the caller doesn't retry endlessly.
      return NextResponse.json(
        {
          success: false,
          playerId: parsed.playerId,
          triggerReason: parsed.triggerReason,
          error: result.error ?? 'engine reported failure',
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      playerId: parsed.playerId,
      triggerReason: parsed.triggerReason,
      roundId: parsed.roundId ?? null,
      stats: {
        insightsCreated: result.insights_created ?? 0,
      },
    });
  } catch (err) {
    await logServerError(
      `analyze-player.api failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'api.coachhelm.analyzePlayer',
        featureArea: 'coachhelm',
        extra: {
          playerId: parsed.playerId,
          triggerReason: parsed.triggerReason,
          roundId: parsed.roundId ?? null,
          stack: err instanceof Error ? err.stack : undefined,
        },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: 'analysis failed' },
      { status: 500 },
    );
  }
}

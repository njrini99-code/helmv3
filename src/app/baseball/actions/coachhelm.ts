'use server';

// =============================================================================
// src/app/baseball/actions/coachhelm.ts
//
// Wave 10 / P10.4 — CoachHelm baseball engine WRITE LAYER (server-action shell).
//
// V12 REFACTOR: the engine RUN body (load -> run -> persist -> promote signals ->
// audit -> reconcile) now lives in the client-agnostic core
// src/lib/baseball/coachhelm/engine-run.ts so it can be driven from BOTH:
//   1. THIS server action (manual "Run engine" button / post-import / insights.ts
//      delegate) — RLS client + session-resolved context.
//   2. The SCHEDULED EVALUATOR (src/lib/inngest/functions.ts) — the daily durable
//      heartbeat that makes "Signals are the heartbeat of BaseballHelm" actually
//      true (time-relative re-evaluation + expires_at sweep over every team),
//      using the service-role admin client.
//
// This shell's ONLY job is auth: withBaseballAction enforces auth + active team +
// capability (can_manage_stats) SERVER-SIDE, scopes Sentry, sanitizes errors. It
// resolves the RLS-scoped client + the run context (team / coach / user / AI
// policy read with the RLS client) and hands them to the core. The HONESTY +
// non-destructive + dedupe contract lives entirely in the core (unchanged).
//
// Re-exported types (BaseballEngineRunResult) keep every caller compiling — the
// shape gained `signalsExpired` (additive).
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { readAiPolicy } from '@/lib/baseball/ai-policy-server';
import {
  runBaseballEngineCore,
  type EngineRunClient,
  type BaseballEngineRunResult,
} from '@/lib/baseball/coachhelm/engine-run';

export type { BaseballEngineRunResult } from '@/lib/baseball/coachhelm/engine-run';

// -----------------------------------------------------------------------------
// runBaseballEngine — generate + persist insights for the active team.
//
// Capability: `can_manage_stats` — generating diagnostic insights is a stats
// analysis action. Head/primary coach implicitly satisfy it.
// -----------------------------------------------------------------------------

export const runBaseballEngine = withBaseballAction(
  'runBaseballEngine',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx): Promise<BaseballEngineRunResult> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const coachId = ctx.activeCoachId;

    if (!coachId) {
      // Engine rows are coach-owned (coach_id NOT NULL); without a resolved coach
      // id we cannot attribute ownership. Honest failure, no write.
      return {
        success: false,
        generated: 0,
        archivedStale: 0,
        signalsEmitted: 0,
        signalsResolved: 0,
        signalsExpired: 0,
        aiWithheld: 0,
        aiAudited: 0,
        error: 'No active coach context.',
      };
    }

    // Read the team's AI-governance gates with the RLS client (caller membership
    // governs the row). The core consults the master switch + per-output gates.
    const policy = await readAiPolicy(teamId);

    const result = await runBaseballEngineCore(supabase as unknown as EngineRunClient, {
      teamId,
      coachId,
      createdByUserId: ctx.user.id,
      policy,
    });

    revalidatePath('/baseball/dashboard/command-center');
    revalidatePath('/baseball/dashboard/signals');
    revalidatePath('/baseball/dashboard/settings');

    return result;
  },
);

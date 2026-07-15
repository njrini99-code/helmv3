'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { BaseballInsightFeedback } from '@/lib/types';
import { resolveCallerCoachId } from '@/lib/baseball/insights/resolve-coach-id';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballDemoReadOnlyError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

// ============================================================================
// #394 action-guard migration
//
// `generateTeamInsights`/`getTeamInsights` were deleted here (dead code — zero
// callers repo-wide; `generateTeamInsightsImpl` compared an insight's
// `coach_id` directly against the caller-SUPPLIED `coachId` argument, the
// same auth-uid-vs-baseball_coaches.id domain confusion #472 fixed for
// dismiss/mark/submit below, and it was never wired up to inherit that fix).
// Team-level insight generation is superseded by the shared engine core in
// src/lib/baseball/coachhelm/engine-run.ts, which already reconciles insights
// without destroying coach decisions (see its own header comment for the
// keyOf(playerId,type) pattern this file's deleted code was mirroring).
//
// `resolveCallerCoachId` was relocated to the plain (non-'use server') module
// src/lib/baseball/insights/resolve-coach-id.ts so it stops being an
// accidental public server-action endpoint — it was never meant to be
// callable from the client, only used mid-body by the three actions below.
// ============================================================================

/**
 * Convert a `withBaseballAction` guard throw (auth / demo-readonly /
 * sanitized-internal-error) back into the `{ success: false, error }`
 * envelope these actions have always returned. PlayerInsightsPanel.tsx calls
 * dismissInsight/markInsightAddressed inside a `startTransition` with no
 * try/catch — it depends on always getting a resolved value, never a
 * rejected promise, so none of these guard errors may propagate as a throw.
 */
function toInsightActionFailure(error: unknown): { success: false; error: string } {
  if (
    error instanceof BaseballUnauthorizedError ||
    error instanceof BaseballNoActiveTeamError ||
    error instanceof BaseballDemoReadOnlyError ||
    error instanceof BaseballActionError
  ) {
    return { success: false, error: error.message };
  }
  throw error;
}

/**
 * Dismiss an insight
 */
async function dismissInsightImpl(insightId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only dismiss your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only dismiss your own insights' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'dismissed' })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to dismiss insight' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

/**
 * Mark an insight as addressed
 */
async function markInsightAddressedImpl(insightId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only update your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only update your own insights' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'resolved' })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to update insight' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

/**
 * Submit feedback on an insight (helpful/not helpful)
 */
async function submitInsightFeedbackImpl(
  insightId: string,
  feedback: BaseballInsightFeedback
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only provide feedback on your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id, metadata')
    .eq('id', insightId)
    .single() as { data: { coach_id: string; metadata: Record<string, unknown> | null } | null };

  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only provide feedback on your own insights' };
  }

  // Update metadata with feedback
  const updatedMetadata = {
    ...(insight.metadata || {}),
    feedback,
    feedbackAt: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ metadata: updatedMetadata })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to submit feedback' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

// ============================================================================
// GUARDED ACTIONS (#394)
//
// No requiredCapability: these are gated by OWNERSHIP (insight.coach_id ===
// the caller's resolved baseball_coaches.id, checked in-body above), the same
// precedent dev-plans.ts's getDevPlanForCoach/completeGoal/uncompleteGoal use
// — mirrors that any-coach-can-act-on-their-own-insights product shape.
// requireActiveContext: false — these actions derive identity via
// resolveCallerCoachId(user.id) themselves; they don't need (and the existing
// insight-lifecycle.test.ts mocks don't provide) a resolved active-team
// context. demoSafe: false (the default) — every one of these WRITES
// (dismiss/resolve/feedback), so the shared demo coach session must not be
// able to mutate an insight another visitor would then see.
// ============================================================================

const dismissInsightAction = withBaseballAction(
  'dismissInsight',
  { featureArea: 'baseball-insights', requireActiveContext: false },
  (_ctx, insightId: string) => dismissInsightImpl(insightId),
);

export async function dismissInsight(insightId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await dismissInsightAction(insightId);
  } catch (error) {
    return toInsightActionFailure(error);
  }
}

const markInsightAddressedAction = withBaseballAction(
  'markInsightAddressed',
  { featureArea: 'baseball-insights', requireActiveContext: false },
  (_ctx, insightId: string) => markInsightAddressedImpl(insightId),
);

export async function markInsightAddressed(insightId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await markInsightAddressedAction(insightId);
  } catch (error) {
    return toInsightActionFailure(error);
  }
}

const submitInsightFeedbackAction = withBaseballAction(
  'submitInsightFeedback',
  { featureArea: 'baseball-insights', requireActiveContext: false },
  (_ctx, insightId: string, feedback: BaseballInsightFeedback) =>
    submitInsightFeedbackImpl(insightId, feedback),
);

export async function submitInsightFeedback(
  insightId: string,
  feedback: BaseballInsightFeedback,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await submitInsightFeedbackAction(insightId, feedback);
  } catch (error) {
    return toInsightActionFailure(error);
  }
}

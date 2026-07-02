'use server';

/**
 * v3 Qualifying-workspace server actions (W29).
 *
 * Wraps the service module with: auth check → coach-of-team check →
 * service call → revalidatePath. RLS on golf_qualifier_selections also
 * enforces coach-of-team at the DB level.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import {
  transitionSelectionState,
  setCoachPick,
  removeCoachPick,
  confirmSelection,
} from '@/lib/coachhelm/v3/qualifying/service';
import type { QualifierSelectionState } from '@/lib/coachhelm/v3/qualifying/types';

export interface QualifyingActionResult {
  ok: boolean;
  error?: string;
}

async function getAuthedCoachContext(qualifier_id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };

  const { data: q } = await supabase
    .from('golf_qualifiers')
    .select('team_id')
    .eq('id', qualifier_id)
    .maybeSingle();
  if (!q) return { ok: false as const, error: 'Qualifier not found' };

  const team = await verifyTeamAccess(q.team_id, user.id, supabase);
  if (!team.allowed) return { ok: false as const, error: 'Not a coach of this team' };

  return { ok: true as const, supabase, user, team_id: q.team_id };
}

function pathsToRevalidate(qualifier_id: string): string[] {
  return [
    `/golf/dashboard/coachhelm/qualifying/${qualifier_id}`,
    `/golf/dashboard/qualifiers/${qualifier_id}`,
    '/golf/dashboard/qualifiers',
  ];
}

async function advanceSelectionStateImpl(
  qualifier_id: string,
  target: QualifierSelectionState,
): Promise<QualifyingActionResult> {
  try {
    const ctx = await getAuthedCoachContext(qualifier_id);
    if (!ctx.ok) return ctx;

    const r = await transitionSelectionState(ctx.supabase, qualifier_id, target);
    if (!r.ok) return r;

    pathsToRevalidate(qualifier_id).forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    await logServerError(
      `advanceSelectionState failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.qualifying.advanceSelectionState' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedAdvanceSelectionState = withAdminObserved(
  'advanceSelectionState',
  { sport: 'golf', feature: 'qualifiers' },
  advanceSelectionStateImpl,
);

export async function advanceSelectionState(
  qualifier_id: string,
  target: QualifierSelectionState,
): Promise<QualifyingActionResult> {
  return observedAdvanceSelectionState(qualifier_id, target);
}

async function setQualifierCoachPickImpl(
  qualifier_id: string,
  player_id: string,
  reasoning: string,
): Promise<QualifyingActionResult> {
  try {
    const ctx = await getAuthedCoachContext(qualifier_id);
    if (!ctx.ok) return ctx;

    const r = await setCoachPick(ctx.supabase, {
      qualifier_id,
      player_id,
      reasoning,
      user_id: ctx.user.id,
    });
    if (!r.ok) return r;

    pathsToRevalidate(qualifier_id).forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    await logServerError(
      `setQualifierCoachPick failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.qualifying.setCoachPick' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedSetQualifierCoachPick = withAdminObserved(
  'setQualifierCoachPick',
  { sport: 'golf', feature: 'qualifiers' },
  setQualifierCoachPickImpl,
);

export async function setQualifierCoachPick(
  qualifier_id: string,
  player_id: string,
  reasoning: string,
): Promise<QualifyingActionResult> {
  return observedSetQualifierCoachPick(qualifier_id, player_id, reasoning);
}

async function removeQualifierCoachPickImpl(
  qualifier_id: string,
  player_id: string,
): Promise<QualifyingActionResult> {
  try {
    const ctx = await getAuthedCoachContext(qualifier_id);
    if (!ctx.ok) return ctx;

    const r = await removeCoachPick(ctx.supabase, qualifier_id, player_id);
    if (!r.ok) return r;

    pathsToRevalidate(qualifier_id).forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    await logServerError(
      `removeQualifierCoachPick failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.qualifying.removeCoachPick' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedRemoveQualifierCoachPick = withAdminObserved(
  'removeQualifierCoachPick',
  { sport: 'golf', feature: 'qualifiers' },
  removeQualifierCoachPickImpl,
);

export async function removeQualifierCoachPick(
  qualifier_id: string,
  player_id: string,
): Promise<QualifyingActionResult> {
  return observedRemoveQualifierCoachPick(qualifier_id, player_id);
}

async function confirmQualifierSelectionImpl(
  qualifier_id: string,
): Promise<QualifyingActionResult> {
  try {
    const ctx = await getAuthedCoachContext(qualifier_id);
    if (!ctx.ok) return ctx;

    const r = await confirmSelection(ctx.supabase, {
      qualifier_id,
      user_id: ctx.user.id,
    });
    if (!r.ok) return r;

    pathsToRevalidate(qualifier_id).forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    await logServerError(
      `confirmQualifierSelection failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.qualifying.confirmSelection' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedConfirmQualifierSelection = withAdminObserved(
  'confirmQualifierSelection',
  { sport: 'golf', feature: 'qualifiers' },
  confirmQualifierSelectionImpl,
);

export async function confirmQualifierSelection(
  qualifier_id: string,
): Promise<QualifyingActionResult> {
  return observedConfirmQualifierSelection(qualifier_id);
}

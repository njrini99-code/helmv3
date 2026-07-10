// =============================================================================
// src/app/baseball/(player-dashboard)/player/today/page.tsx
//
// Wave 4 / packet P4.2 — Player Today (daily loop), server component.
//
// The player-facing "what do I need to do / know today" view for a single team.
// This server component:
//
//   1. Resolves the current player's server-validated active baseball context
//      (cookie re-validated against real membership rows — never trusted raw).
//   2. Reads the Wave-3 read-model getPlayerToday(teamId), which is itself
//      SELF-ONLY (it resolves the player from the session and only returns that
//      player's data; RLS backs every query).
//   3. Hands a plain serializable view-model to PlayerTodayClient.
//
// No data is fetched here that the read-model doesn't already gate. The page
// never accepts a player id from the URL — the player is always "me".
//
// HONESTY (v12): when there is no active team context we render an honest
// "join a team to unlock Today" TERMINAL (PlayerTodayTeamless) rather than
// redirect-looping or fabricating a team. Player onboarding explicitly allows
// finishing with NO team ("Skip for Now"), and the onboarding guard bounces a
// completed player back to /baseball/dashboard — so redirecting here to
// /baseball/player created an infinite first-run loop. We now land such a
// player on a real, usable screen whose single task is joining a team.
// When the read-model itself returns authorized:false we still render the
// client's honest envelope. Deferred feeds (assignments / check-ins) are
// passed through with their available:false flags so the client shows "coming
// soon" instead of inventing rows. The lift-today slot is a labeled
// placeholder that the Performance vertical wires in during integration.
//
// PERFORMANCE CHECK-IN SLOT (§5 integration):
//   After resolving the baseball context we also resolve the player's Helm
//   Lifting athlete row (if any) and fetch:
//     - getPlayerSorenessToday   → SorenessCheckCard
//     - getPlayerBodyweightHistory (today's pending request)  → WeightCheckInCard
//     - getPlayerNutritionPlans  → NutritionPlanCard (first active)
//   If the player has no athlete row, or no due items, the check-in slot is
//   simply null-ed out and the client renders nothing (honest empty state).
// =============================================================================

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getPlayerToday } from '@/lib/baseball/read-models/player-today';
import { getPlayerDailyContract } from '@/lib/baseball/read-models/player-daily-contract';
import { getPlayerPassport } from '@/lib/baseball/read-models/player-passport';
import {
  resolveTeamTimezone,
  todayIsoInTz,
} from '@/lib/baseball/daily-contract/contract-day';
import { createClient } from '@/lib/supabase/server';
import { PlayerTodayClient } from '@/components/baseball/player-today/PlayerTodayClient';
import { PlayerTodayTeamless } from '@/components/baseball/player-today/PlayerTodayTeamless';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import { getPlayerSorenessToday } from '@/app/lifting/actions/soreness';
import { getPlayerBodyweightHistory } from '@/app/lifting/actions/weight-checkins';
import { getPlayerNutritionPlans } from '@/app/lifting/actions/nutrition';
import type { PlayerSoreness } from '@/app/lifting/actions/soreness';
import type { PlayerNutritionPlanCard } from '@/app/lifting/actions/nutrition';
import { logServerException } from '@/lib/server-error-logger';

export const metadata = {
  title: 'Today · BaseballHelm',
};

// ---------------------------------------------------------------------------
// Performance check-in slot view-models
// These are the plain serialisable types passed to PlayerTodayClient.
// ---------------------------------------------------------------------------

export interface PerformanceCheckinSlot {
  orgId: string;
  athleteId: string;
  /**
   * The team-local calendar date (YYYY-MM-DD, same value as this page's
   * `todayIso`) that any check-in submitted from this slot should be written
   * against. SorenessCheckCard accepts this as `checkinDate` — without it,
   * the card falls back to the browser's UTC date, which silently mismatches
   * the coach board/heatmap for players outside UTC.
   */
  todayIso: string;
  /** null when no soreness check is due today and no checkin submitted */
  sorenessToday: PlayerSoreness | null;
  /** null when no weight request pending today */
  weightToday: {
    pendingRequestId: string | null;
    pendingDueDate: string | null;
  } | null;
  /** first active nutrition plan assigned to this athlete (null if none) */
  nutritionPlan: PlayerNutritionPlanCard | null;
}

export default async function PlayerTodayPage() {
  // 1. Resolve the active baseball context (server-validated against memberships).
  const context = await getActiveBaseballContext();

  // No baseball memberships at all → render the honest TEAMLESS terminal instead
  // of redirecting. Onboarding lets a player finish with no team, and the
  // onboarding guard bounces completed players to /baseball/dashboard, so a
  // redirect here ping-ponged forever (dashboard dispatcher → today → redirect →
  // onboarding guard → dashboard …). PlayerTodayTeamless is a real landing whose
  // single task is joining a team; once joined, the dispatcher resolves normally.
  if (!context) {
    return <PlayerTodayTeamless />;
  }

  // Resolve the TEAM tz once so the contract READ, the contract WRITE (server
  // actions), and the DISPLAY all agree on the same local "today". Without this,
  // the read silently defaulted to UTC and a late-night player saw the wrong day.
  const supabase = await createClient();
  const todayIso = todayIsoInTz(
    await resolveTeamTimezone(supabase, context.activeTeamId),
  );

  // 2. Read the SELF-ONLY read-models for the active team. Each returns an honest
  //    envelope (authorized:false / error string) rather than throwing. The
  //    Daily Contract is the commitment-loop mechanic; the Passport is the
  //    source-backed identity snapshot — both compose into the daily view.
  //
  //    Performance check-in resolution runs in parallel with the baseball reads.
  //    We wrap each lifting fetch in try/catch so a lifting failure never breaks
  //    the baseball today page (the slot simply renders as null).
  //
  //    recruitingRow is a small, separate read of this player's own activation
  //    state (conn-baseball-player Finding 2: "Activate Recruiting" had no
  //    persistent UI surface — the nav entry is command-palette/direct-URL
  //    only by design). Today is the one screen every player lands on daily,
  //    so it's where a one-time nudge belongs. Honest degrade: any failure
  //    here just hides the banner, it never blocks the page.
  const [today, dailyContract, passport, liftingCtx, recruitingRow] = await Promise.all([
    getPlayerToday(context.activeTeamId, { forDate: todayIso }),
    getPlayerDailyContract(context.activeTeamId, { forDate: todayIso }),
    getPlayerPassport(context.activeTeamId),
    resolveBaseballLiftingOrg(context.activeTeamId).catch(() => null),
    context.activePlayerId
      ? Promise.resolve(
          supabase
            .from('baseball_players')
            .select('recruiting_activated, player_type')
            .eq('id', context.activePlayerId)
            .maybeSingle(),
        )
          .then(({ data }) => data)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  // Eligible + not-yet-activated → the banner nudge; college players can never
  // activate (product rule, enforced again server-side by the action itself).
  const recruitingActivation =
    recruitingRow && recruitingRow.player_type !== 'college'
      ? { activated: recruitingRow.recruiting_activated === true }
      : null;

  // 3. If the player has a lifting org, resolve athlete ID + fetch due items.
  let performanceSlot: PerformanceCheckinSlot | null = null;

  if (liftingCtx) {
    const { organizationId: orgId } = liftingCtx;

    // Resolve the player's helm_lifting_athletes.id (null if not seeded).
    const athleteId = await resolveMyBaseballAthleteId(orgId).catch(async (error) => {
      await logServerException(
        error,
        {
          action: 'resolveMyBaseballAthleteId',
          featureArea: 'lifting-performance-checkin-slot',
          source: 'server_component',
          handled: true,
        },
        'warning',
      );
      return null;
    });

    if (athleteId) {
      // Fan out: soreness, weight history (for today's pending request),
      // and nutrition plans. Any individual failure yields null so a lifting
      // outage never breaks the baseball Today page — but we log it (instead
      // of swallowing silently) so a real regression (e.g. an access-gate
      // bug denying a legitimate athlete) is visible, not invisible forever.
      //
      // Exception: LiftingForbiddenError ("You do not have access to this
      // Lifting Lab") is an expected degradation path, not an incident — a
      // player with no Lift Lab org/canView grant hits this on every Today
      // render (e.g. the CI e2e player fixture). withLiftingAction already
      // records it once (skipSentry: true) before rethrowing, so logging it
      // again here just triples routine 403s into page-level warnings per
      // view. Stay silent and fall through to the existing honest empty
      // state (performanceSlot stays null) instead.
      const isLiftingForbiddenError = (error: unknown): boolean =>
        error instanceof Error && error.name === 'LiftingForbiddenError';

      const logSlotFailure = (action: string) => async (error: unknown) => {
        if (isLiftingForbiddenError(error)) {
          return null;
        }

        await logServerException(
          error,
          {
            action,
            featureArea: 'lifting-performance-checkin-slot',
            source: 'server_component',
            handled: true,
          },
          'warning',
        );
        return null;
      };

      const [sorenessToday, weightHistory, nutritionPlans] = await Promise.all([
        getPlayerSorenessToday({ orgId, athleteId, date: todayIso }).catch(
          logSlotFailure('getPlayerSorenessToday'),
        ),
        getPlayerBodyweightHistory({ orgId, athleteId, toDate: todayIso, days: 7 }).catch(
          logSlotFailure('getPlayerBodyweightHistory'),
        ),
        getPlayerNutritionPlans({ orgId, athleteId }).catch(
          logSlotFailure('getPlayerNutritionPlans'),
        ),
      ]);

      // Only include sorenessToday if there's a pending request or a submitted checkin.
      const hasSoreness =
        sorenessToday !== null &&
        (sorenessToday.request !== null || sorenessToday.checkin !== null);

      // Only include weight if there's a pending request.
      const hasPendingWeight =
        weightHistory !== null && weightHistory.pendingRequestId !== null;

      // First active nutrition plan (most recently assigned).
      const nutritionPlan: PlayerNutritionPlanCard | null =
        nutritionPlans && nutritionPlans.length > 0 ? (nutritionPlans[0] ?? null) : null;

      // Build the slot only if at least one item is actionable.
      if (hasSoreness || hasPendingWeight || nutritionPlan) {
        performanceSlot = {
          orgId,
          athleteId,
          todayIso,
          sorenessToday: hasSoreness ? sorenessToday : null,
          weightToday: hasPendingWeight
            ? {
                pendingRequestId: weightHistory!.pendingRequestId,
                pendingDueDate: weightHistory!.pendingDueDate,
              }
            : null,
          nutritionPlan,
        };
      }
    }
  }

  // 4. Hand the serializable view-models to the client. The client owns all
  //    interactivity (the acknowledgement affordance, the deferred + lift-today
  //    slots, the daily-contract loop).
  return (
    <PlayerTodayClient
      model={today}
      dailyContract={dailyContract}
      passport={passport}
      activeRole={context.activeRole}
      // ISO date the read-model treated as "today" — the TEAM-tz local day (not
      // server UTC), so display matches the contract the player actually wrote.
      // The client uses it only for display; it does not re-fetch.
      todayIso={todayIso}
      performanceSlot={performanceSlot}
      recruitingActivation={recruitingActivation}
    />
  );
}

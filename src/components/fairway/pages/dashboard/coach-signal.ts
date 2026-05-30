/**
 * ============================================================================
 * Fairway · Coach dashboard — CoachHelm signal derivation (PURE, no I/O)
 * ----------------------------------------------------------------------------
 * Derives the ONE glass-hero "CoachHelm signal" headline shown on the redesigned
 * coach dashboard from data that ALREADY EXISTS in the CoachDashboard props
 * (action items, today's events, top performers, team pulse, recent rounds).
 *
 * HARD DATA-GAP RULE (dashboard-home.json coach mustFix data-gap:high):
 *   This NEVER surfaces an effectiveness % or prediction-accuracy figure — those
 *   tables are a hollow shell (acted_upon/with_outcome 0; insights acknowledged
 *   1/444; predictions resolved 20/555). We source the strip strictly from raw
 *   counts that exist, and fall back to an honest insufficient-data note when
 *   there is nothing real to say.
 *
 * Pure + additive: imports only the existing dashboard-data types. No fetching,
 * no mutation — presentation/derivation only.
 * ========================================================================== */

import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';

export interface CoachSignal {
  /** Drives the InsightCard priority tint + lead icon. */
  priority: 'high' | 'medium' | 'low' | 'info';
  /** Small uppercase eyebrow. */
  overline: string;
  /** The headline (Fraunces on the hero). */
  title: string;
  /** One-line narrative. */
  body: string;
  /**
   * When true there is no real signal to surface — the strip renders an honest
   * "insufficient-data" voice instead of an authoritative-looking claim.
   */
  insufficient: boolean;
}

/**
 * Build the calm CoachHelm signal headline. Greedy by importance:
 *   1. action items waiting (real count)         → high
 *   2. a measurable team mover this week          → medium
 *   3. rounds logged this week (activity proof)   → low
 *   4. today's events on the calendar             → info
 *   5. nothing real yet                           → insufficient
 */
export function deriveCoachSignal(
  enhanced: CoachDashboardPayload | null | undefined,
  rosterSize: number,
): CoachSignal {
  const actionCount = enhanced?.actionItems?.length ?? 0;
  const roundsThisWeek = enhanced?.teamPulse?.roundsThisWeek ?? 0;
  const topMover = enhanced?.teamPulse?.topMover;
  const todayCount = enhanced?.todayEvents?.length ?? 0;

  if (actionCount > 0) {
    return {
      priority: 'high',
      overline: 'CoachHelm · This week',
      title:
        actionCount === 1
          ? '1 item is waiting on you'
          : `${actionCount} items are waiting on you`,
      body:
        'Tasks, approvals and deadlines CoachHelm flagged from your roster activity. Clear them to keep the week moving.',
      insufficient: false,
    };
  }

  if (topMover && Number.isFinite(topMover.delta) && topMover.delta !== 0) {
    // delta is a POSITIVE improvement magnitude (olderAvg - recentAvg, emitted
    // only when > 0), so a positive delta MEANS the player lowered their average.
    const verb = topMover.delta > 0 ? 'improved' : 'slipped';
    const mag = Math.abs(topMover.delta).toFixed(1);
    return {
      priority: 'medium',
      overline: 'CoachHelm · Team pulse',
      title: `${topMover.name} ${verb} ${mag} strokes`,
      body:
        'Your biggest mover across recent rounds. Open CoachHelm to see what changed and whether it is worth a focus area.',
      insufficient: false,
    };
  }

  if (roundsThisWeek > 0) {
    return {
      priority: 'low',
      overline: 'CoachHelm · This week',
      title:
        roundsThisWeek === 1
          ? '1 round logged this week'
          : `${roundsThisWeek} rounds logged this week`,
      body:
        'CoachHelm is reading new rounds as they come in. Signals sharpen as more of your roster logs activity.',
      insufficient: false,
    };
  }

  if (todayCount > 0) {
    return {
      priority: 'info',
      overline: 'CoachHelm · Today',
      title:
        todayCount === 1
          ? '1 event on the calendar today'
          : `${todayCount} events on the calendar today`,
      body:
        'Nothing urgent from CoachHelm yet. See the week’s activity digest in What’s New.',
      insufficient: false,
    };
  }

  // Honest empty — never a fake 0% effectiveness / accuracy headline.
  return {
    priority: 'info',
    overline: 'CoachHelm',
    title: rosterSize === 0 ? 'CoachHelm is ready when your roster is' : 'No new signals yet',
    body:
      rosterSize === 0
        ? 'Invite players and start logging rounds — CoachHelm surfaces patterns and coaching signals as activity builds.'
        : 'Effectiveness and prediction accuracy stay hidden until outcomes are measured — we’ll never show a hollow number. New patterns appear here as rounds come in.',
    insufficient: true,
  };
}

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

export const metadata = {
  title: 'Today · BaseballHelm',
};

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
  const [today, dailyContract, passport] = await Promise.all([
    getPlayerToday(context.activeTeamId),
    getPlayerDailyContract(context.activeTeamId, { forDate: todayIso }),
    getPlayerPassport(context.activeTeamId),
  ]);

  // 3. Hand the serializable view-models to the client. The client owns all
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
    />
  );
}

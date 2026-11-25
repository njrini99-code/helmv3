import 'server-only';
import { redirect } from 'next/navigation';
import { loadPlayerOnboard } from '../data/onboard';
import { Onboard } from '../screens/onboard/Onboard';
import { resumeStep } from '../screens/onboard/logic';
import { GateFailed } from '../screens/auth/GateLoading';

/** /golf/signup in Clubhouse: the intro, the code, and the questions before the account. */
export function ClubhouseSignupRoute() {
  return <Onboard start="intro" />;
}

/**
 * /golf/player in Clubhouse: a new player's questions after the account
 * ("Your game", the photo, the member card). The team code rides in on
 * ?joinCode=, as it does today; the server reads it here so the team is named from the first question.
 */
export async function ClubhousePlayerOnboardRoute({ searchParams }: { searchParams?: Promise<{ joinCode?: string | string[] }> } = {}) {
  const joinCode = (await searchParams)?.joinCode;
  const load = await loadPlayerOnboard(Array.isArray(joinCode) ? joinCode[0] : joinCode);
  if (load.kind === 'signedOut') redirect('/golf/login');
  // A failed read is said, with Try again (GAP-S-04): never the blank player form for someone who may be a coach or onboarded.
  if (load.kind === 'failed') return <GateFailed label="Your game" title="Your game" />;
  if (load.kind === 'coach' || load.kind === 'onboarded') redirect('/golf/dashboard');
  // Picks up at the first question the account does not already answer (name, class), so a resumed sign-in is never a dead end.
  return <Onboard start={resumeStep(load.seed)} seed={load.seed} />;
}

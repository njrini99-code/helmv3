import 'server-only';
import { redirect } from 'next/navigation';
import { loadPlayerOnboard } from '../data/onboard';
import { Onboard } from '../screens/onboard/Onboard';
import { GateFailed } from '../screens/auth/GateLoading';

/** /golf/signup in Clubhouse: the intro, the code, and the questions before the account. */
export function ClubhouseSignupRoute() {
  return <Onboard start="intro" />;
}

/**
 * /golf/player in Clubhouse: a new player's questions after the account
 * ("Your game", the photo, the member card). The team code rides in on
 * ?joinCode=, as it does today, and the screens read it in the browser.
 */
export async function ClubhousePlayerOnboardRoute() {
  const load = await loadPlayerOnboard();
  if (load.kind === 'signedOut') redirect('/golf/login');
  // A failed read is said, with Try again (GAP-S-04): never the blank player form for someone who may be a coach or onboarded.
  if (load.kind === 'failed') return <GateFailed label="Your game" title="Your game" />;
  if (load.kind === 'coach' || load.kind === 'onboarded') redirect('/golf/dashboard');
  return <Onboard start="game" seed={load.seed} />;
}

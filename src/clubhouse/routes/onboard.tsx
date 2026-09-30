import 'server-only';
import { redirect } from 'next/navigation';
import { loadPlayerOnboard } from '../data/onboard';
import { Onboard } from '../screens/onboard/Onboard';

/** /golf/signup in Clubhouse: the intro, the code, and the questions before the account. */
export function ClubhouseSignupRoute() {
  return <Onboard start="intro" />;
}

/**
 * /golf/player in Clubhouse: a new player's questions after the account
 * ("Your game", the photo, the member card). The join code rides in on
 * ?joinCode=, as it does today, and the screens read it in the browser.
 */
export async function ClubhousePlayerOnboardRoute() {
  const load = await loadPlayerOnboard();
  if (load.kind === 'signedOut') redirect('/golf/login');
  if (load.kind === 'coach' || load.kind === 'onboarded') redirect('/golf/dashboard');
  return <Onboard start="game" seed={load.seed} />;
}

import 'server-only';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { loadWelcome } from '../data/welcome';
import { SignIn } from '../screens/auth/SignIn';
import { Welcome } from '../screens/auth/Welcome';
import { WelcomeStage } from '../screens/auth/WelcomeStage';

/** /golf/login in Clubhouse. The form is in the server HTML: the URL is read in the browser (`useQueryParam`), so nothing here waits on a Suspense boundary. */
export function ClubhouseSignInRoute() {
  return <SignIn />;
}

export async function WelcomeLoader() {
  const load = await loadWelcome();
  // A session the auth server has ruled invalid: back to sign in, as the current page does.
  if (load.kind === 'signedOut') redirect('/golf/login');
  return <Welcome data={load.data} />;
}

/**
 * /golf/welcome in Clubhouse. The frame and the course are up straight away
 * (`WelcomeStage`) while the identity and updates are read, so the step from
 * sign-in never shows an empty page, and the greeting streams in over a course
 * that has already started moving.
 */
export function ClubhouseWelcomeRoute() {
  return (
    <WelcomeStage>
      <Suspense fallback={null}>
        <WelcomeLoader />
      </Suspense>
    </WelcomeStage>
  );
}

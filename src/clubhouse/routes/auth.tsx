import 'server-only';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { loadWelcome } from '../data/welcome';
import { SignIn } from '../screens/auth/SignIn';
import { Welcome } from '../screens/auth/Welcome';
import { WelcomeStage } from '../screens/auth/WelcomeStage';
import { ChPhoneHintProvider } from '../lib/use-phone';
import { phoneHint } from '../lib/phone-hint';

/**
 * /golf/login in Clubhouse. The form is in the server HTML: the URL is read in the browser (`useQueryParam`), so nothing
 * here waits on a Suspense boundary. Nothing here reads the request either (no cookie, no header): an async route
 * that read the phone hint made the segment dynamic, so a tap on Log in painted the nearest loading boundary,
 * `golf/loading.tsx`'s dashboard skeleton, before the sign in (owner, 2026-10-14: "not smooth"). The hint is not
 * needed here: the only reader is the course's crop, which draws after hydration, when the real width is known.
 * The provider stays so the layout cookie is written for the dashboard after sign in.
 */
export function ClubhouseSignInRoute() {
  return (
    <ChPhoneHintProvider phone={false}>
      <SignIn />
    </ChPhoneHintProvider>
  );
}

export async function WelcomeLoader() {
  const [load, phone] = await Promise.all([loadWelcome(), phoneHint()]);
  // CH-15903: a session the auth server has ruled invalid goes back to sign in, as the current page does.
  if (load.kind === 'signedOut') redirect('/golf/login');
  return (
    <ChPhoneHintProvider phone={phone}>
      <Welcome data={load.data} />
    </ChPhoneHintProvider>
  );
}

/**
 * /golf/welcome in Clubhouse. The frame and the course are up straight away
 * (`WelcomeStage`) while the identity and updates are read, so the step from
 * sign-in never shows an empty page, and the greeting streams in over a course
 * that has already started moving.
 */
export function ClubhouseWelcomeRoute() {
  // Synchronous, as the sign-in route is (F25): awaiting the phone hint here held the whole route, so the step from
  // sign-in showed /golf's dashboard skeleton first (audit A-02). The hint is read beside the identity, inside the
  // Suspense boundary, and only Welcome (which forks on it) is given it; the stage doesn't read it.
  return (
    <WelcomeStage>
      <Suspense fallback={null}>
        <WelcomeLoader />
      </Suspense>
    </WelcomeStage>
  );
}

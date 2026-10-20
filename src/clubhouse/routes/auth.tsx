import 'server-only';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { loadWelcome } from '../data/welcome';
import { CoachPending } from '../screens/auth/CoachPending';
import { DemoEntry } from '../screens/auth/DemoEntry';
import { JoinInvalid, JoinTeam, type JoinTeamData } from '../screens/auth/JoinTeam';
import type { PreviewStaffInviteResult } from '@/app/golf/actions/teams';
import { StaffInvite } from '../screens/auth/StaffInvite';
import { ResetPassword } from '../screens/auth/ResetPassword';
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

/**
 * /golf/reset-password in Clubhouse: the page the reset email's button opens. Like the sign-in route it reads nothing
 * from the request: the link's token is read in the browser, once, where the check also runs.
 */
export function ClubhouseResetPasswordRoute() {
  return (
    <ChPhoneHintProvider phone={false}>
      <ResetPassword />
    </ChPhoneHintProvider>
  );
}

/** /golf/join/[code] in Clubhouse: the page has already resolved the code, the player and every redirect; this draws the answer. */
export function ClubhouseJoinTeamRoute({ code, playerId, playerName, playerYear, email, team }: { code: string; playerId: string; playerName: string; playerYear: string; email: string | null; team: JoinTeamData['team'] }) {
  return (
    <ChPhoneHintProvider phone={false}>
      <JoinTeam data={{ code, team, player: { name: playerName, year: playerYear, email } }} playerId={playerId} />
    </ChPhoneHintProvider>
  );
}

/** A code that names no team. */
export function ClubhouseJoinInvalidRoute() {
  return (
    <ChPhoneHintProvider phone={false}>
      <JoinInvalid />
    </ChPhoneHintProvider>
  );
}

/** /golf/staff/join/[token] in Clubhouse: the page has already described the invitation (`previewStaffInvite`); this draws it. */
export function ClubhouseStaffInviteRoute({ token, preview }: { token: string; preview: PreviewStaffInviteResult }) {
  return (
    <ChPhoneHintProvider phone={false}>
      <StaffInvite token={token} preview={preview} />
    </ChPhoneHintProvider>
  );
}

/** /golf/coach/pending in Clubhouse: the page has already read who is waiting and for whom (and redirected anyone who should not be here). */
export function ClubhouseCoachPendingRoute({ programName }: { programName: string | null }) {
  return (
    <ChPhoneHintProvider phone={false}>
      <CoachPending programName={programName} />
    </ChPhoneHintProvider>
  );
}

/** /golf/demo in Clubhouse. Like sign in it reads nothing from the request; the URL's own parameters are read in the browser. */
export function ClubhouseDemoRoute() {
  return (
    <ChPhoneHintProvider phone={false}>
      <DemoEntry />
    </ChPhoneHintProvider>
  );
}

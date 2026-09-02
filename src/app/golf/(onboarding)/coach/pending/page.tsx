import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export const metadata = {
  title: 'Waiting for approval | GolfHelm',
};

/**
 * Where an assistant coach lands after signing up with the team code.
 *
 * The account is real and signed in — what it does not have is a
 * golf_team_coach_staff row, which is the entirety of team access (see
 * createPendingAssistantCoach in src/app/golf/actions/teams.ts). So this page
 * has to be a genuine destination rather than a redirect target, or the new
 * assistant bounces between an empty dashboard and onboarding that would mint
 * a duplicate program.
 *
 * It self-clears: once the head coach approves, the staff row exists and the
 * visit redirects straight through to the dashboard.
 */
export default async function CoachPendingPage() {
  const supabase = await createClient();
  // Bind `error`. supabase-js resolves an auth failure as { data: null, error }
  // rather than throwing, so an unbound read makes an OUTAGE indistinguishable
  // from a signed-out visitor — the assistant coach is bounced to /login with no
  // signal anywhere that auth was down. Redirecting is still the right response
  // (fail closed), but it must be a decision, not an accident.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    await logServerError(
      `[coach/pending] auth read failed: ${describeError(authError)}`,
      { action: 'golf.coachPending', featureArea: 'auth' },
      'warning',
    );
  }
  if (!user) redirect('/golf/login');

  const admin = createAdminClient();
  const { data: coach, error: coachError } = await admin
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (coachError) {
    await logServerError(
      `[coach/pending] coach read failed: ${describeError(coachError)}`,
      { action: 'golf.coachPending', featureArea: 'teams' },
      'warning',
    );
  }

  // Approved already? The staff row is the signal, so this reads the same
  // table the RLS helpers do rather than a second notion of "approved".
  if (coach?.id) {
    const { data: staffRow, error: staffError } = await admin
      .from('golf_team_coach_staff')
      .select('id')
      .eq('coach_id', coach.id)
      .limit(1)
      .maybeSingle();
    // This one matters most on the page. A failed read leaves staffRow null,
    // which is indistinguishable from "not approved yet" — so an assistant who
    // HAS been approved sits on this waiting screen indefinitely, and refreshing
    // does not help. Log it loudly rather than letting an outage look like a
    // pending approval.
    if (staffError) {
      await logServerError(
        `[coach/pending] staff-row read failed; an approved coach may be stranded on the waiting page: ${describeError(staffError)}`,
        { action: 'golf.coachPending', featureArea: 'teams' },
        'error',
      );
    }
    if (staffRow) redirect('/golf/dashboard');
  }

  let programName: string | null = null;
  if (coach?.organization_id) {
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('name')
      .eq('id', coach.organization_id)
      .maybeSingle();
    if (orgError) {
      await logServerError(
        `[coach/pending] organization read failed: ${describeError(orgError)}`,
        { action: 'golf.coachPending', featureArea: 'teams' },
        'warning',
      );
    }
    // Falls back to generic copy when the name is genuinely absent OR the read
    // failed — but the failure is now logged rather than silently cosmetic.
    programName = org?.name ?? null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-border-subtle bg-surface p-8">
        <h1 className="text-2xl font-semibold text-text-primary">
          You&rsquo;re all set — pending approval
        </h1>
        <p className="mt-3 text-text-secondary">
          Your account is created{programName ? <> and your request to join <strong className="font-semibold text-text-primary">{programName}</strong> as an assistant coach has been sent</> : <> and your request has been sent</>}.
          Your head coach approves it from{' '}
          <strong className="font-semibold text-text-primary">Team → Team settings</strong>.
        </p>
        <p className="mt-4 text-sm text-text-secondary">
          Nothing else is needed from you. Team data appears the moment they
          approve — reload this page to check.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/golf/coach/pending"
            className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Check again
          </Link>
          <Link
            href="/golf/login"
            className="rounded-xl border border-border-strong px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            Sign out
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Expected to be a player instead?{' '}
        <Link href="/golf/signup" className="font-medium text-primary-600 hover:underline">
          Sign up with your team code as a player
        </Link>
        .
      </p>
    </main>
  );
}

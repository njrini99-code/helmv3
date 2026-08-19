'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { redeemStaffInvite, type PreviewStaffInviteResult } from '@/app/golf/actions/teams';
import { signupWithStaffInviteAction } from '@/app/golf/actions/auth';

/**
 * Accept screen for a coach-issued staff invitation.
 *
 * Handles BOTH states deliberately:
 *   • already signed in  → one Accept button.
 *   • signed out         → create the account here, then redeem.
 *
 * The signed-out branch is the important one. GolfHelm's self-serve signup is a
 * player team-code gate, so an invited assistant coach genuinely cannot create
 * an account any other way — sending them to /golf/signup is the dead end that
 * produced the original bug report.
 */

function roleLabel(role: PreviewStaffInviteResult['role']): string {
  return role === 'admin' ? 'Program Admin' : 'Assistant Coach';
}

function roleDescription(role: PreviewStaffInviteResult['role']): string {
  return role === 'admin'
    ? 'You’ll have head-coach access across every team in this program.'
    : 'You’ll have coaching access to this team.';
}

export function StaffJoinClient({
  token,
  preview,
}: {
  token: string;
  preview: PreviewStaffInviteResult;
}) {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setSignedIn(Boolean(data.user));
      } catch {
        if (!cancelled) setSignedIn(false);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Shared tail: attach the staff row, then land them in the app. */
  async function finishRedeem(fullName?: string) {
    const result = await redeemStaffInvite(token, fullName);
    if (!result.success) {
      setError(result.error ?? 'Could not join the team. Please try again.');
      setSubmitting(false);
      return;
    }
    // Same ordering the signup form uses: refresh so server components re-read
    // the new session/staff row before we navigate, or the dashboard renders
    // against a cache that predates the row we just wrote.
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 150));
    router.push('/golf/dashboard');
  }

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    await finishRedeem();
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.fullName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    const signup = await signupWithStaffInviteAction(
      token,
      form.email,
      form.password,
      form.fullName,
    );
    if (!signup.success) {
      setError(signup.error ?? 'Could not create your account.');
      setSubmitting(false);
      return;
    }
    await finishRedeem(form.fullName);
  }

  if (!preview.valid) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-warm-200 bg-cream-50 p-8 text-center">
          <h1 className="text-xl font-bold text-warm-900">This invitation isn’t valid</h1>
          <p className="mt-2 text-warm-600">{preview.error}</p>
          <Link
            href="/golf/login"
            className="mt-6 inline-block text-primary-600 font-semibold hover:text-primary-500"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  const program = preview.organizationName ?? 'this program';
  const team = preview.teamName;

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-warm-200 bg-cream-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">
          Staff invitation
        </p>
        <h1 className="mt-2 text-2xl font-bold text-warm-900">
          Join {program} as {roleLabel(preview.role)}
        </h1>
        <p className="mt-2 text-warm-600">
          {team ? `${team} · ` : ''}
          {roleDescription(preview.role)}
        </p>

        {error && (
          <div
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        {checkingSession ? (
          <p className="mt-8 text-warm-500">Checking your session…</p>
        ) : signedIn ? (
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={submitting}
            className="mt-8 w-full h-12 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary-800"
          >
            {submitting ? 'Joining…' : 'Accept invitation'}
          </Button>
        ) : (
          <form onSubmit={handleCreateAccount} className="mt-8 space-y-4">
            <div>
              <label htmlFor="staff-name" className="block text-sm font-medium text-warm-700 mb-1">
                Full name
              </label>
              <Input
                id="staff-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                autoComplete="name"
                required
                className="h-12"
              />
            </div>
            <div>
              <label htmlFor="staff-email" className="block text-sm font-medium text-warm-700 mb-1">
                Email
              </label>
              <Input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
                required
                className="h-12"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="block text-sm font-medium text-warm-700 mb-1">
                Password
              </label>
              <Input
                id="staff-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                required
                className="h-12"
              />
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary-800"
            >
              {submitting ? 'Creating your account…' : 'Create account & join'}
            </Button>
            <p className="text-center text-sm text-warm-600">
              Already have an account?{' '}
              <Link
                href={`/golf/login?returnTo=${encodeURIComponent(`/golf/staff/join/${token}`)}`}
                className="text-primary-600 font-semibold hover:text-primary-500"
              >
                Sign in
              </Link>{' '}
              and open this link again.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

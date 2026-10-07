'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AuthCanvas,
  AuthFieldError,
  AuthSubmitButton,
  GroupedFieldRow,
  GroupedFields,
} from '@/components/auth/golf-auth-canvas';

const ERROR_ID = 'invite-code-error';
const HINT_ID = 'invite-code-hint';

/*
 * The same flat auth canvas as /golf/login, /golf/forgot-password and
 * /golf/reset-password: the course scene, the app mark, one card, an inset
 * grouped field and the 50pt accent button. This page used to have its own
 * orb background, glass card and button styling, and no way back.
 */
export default function JoinTeamPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const trimmed = code.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }

    if (trimmed.length < 4) {
      setError('Invite code must be at least 4 characters.');
      return;
    }

    router.push(`/golf/join/${trimmed}`);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  return (
    <AuthCanvas
      contentId="join-team-form"
      contentLabel="Join a team"
      title="Join a Team"
      subtitle="Enter the invite code your coach gave you to join their team."
      topBar={
        /*
         * The way back, styled like the login page's Home link. It points at
         * `/golf`, not `/`: the in-app links here (NoTeamBanner, player
         * onboarding, travel, classes) come from signed-in players, and
         * `/golf` sends them to their dashboard and a signed-out visitor to
         * sign-in. It is an app route, so unlike `/` (which the proxy bounces
         * to login in the native shell) it works on iOS too.
         */
        <Link
          href="/golf"
          aria-label="Back to home"
          className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-fw-sm px-2 text-body-lg text-accent-700 outline-none focus-visible:ring-2 focus-visible:ring-accent-600 active:opacity-60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Home
        </Link>
      }
    >
      <form onSubmit={handleSubmit} aria-label="Join a team">
        <GroupedFields>
          <GroupedFieldRow
            id="invite-code"
            label="Invite code"
            placeholder="Invite code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={10}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : HINT_ID}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus on the single-field join form
            autoFocus
            value={code}
            onChange={handleChange}
          />
        </GroupedFields>

        {error ? (
          <AuthFieldError id={ERROR_ID}>{error}</AuthFieldError>
        ) : (
          <p id={HINT_ID} className="mt-2.5 px-4 text-body-sm text-text-tertiary">
            {trimmed.length > 0
              ? `${trimmed.length} / 10 characters`
              : '4–10 characters, letters and numbers'}
          </p>
        )}

        <AuthSubmitButton className="mt-6" disabled={!trimmed}>
          Join Team
        </AuthSubmitButton>

        <p className="mt-4 text-center text-body-sm text-text-secondary">
          Don&apos;t have a code? Ask your coach for the team invite code.
        </p>
      </form>
    </AuthCanvas>
  );
}

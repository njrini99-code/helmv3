'use client';

import { useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { logError } from '@/lib/error-logging';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { AuthKeyLabel } from './AuthKey';
import { AuthNotice } from './AuthNotice';
import { RESET_UNEXPECTED_MESSAGE, normalizeResetEmail, resetEmailProblem } from './forgot-state';
import { useGlide, type Glider } from './use-glide';

const ERROR_ID = 'golf-forgot-error';

/** A plain click, which the panel answers in place; a modified one (a new tab) is left to the link's own href. */
export const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

interface ResetProblem {
  message: string;
  code: string;
  /** Validation is about the field (marked, shaken); a failure to send is not. */
  field: boolean;
}

/**
 * The reset form, drawn in the sign-in panel over the same course (owner, 2026-10-07; no board yet, so it is up for
 * owner review). What it does is today's page (`/golf/forgot-password`): the same `requestPasswordResetAction`, which
 * answers the same whether or not the address has an account, the same checks and the same words. Only the drawing,
 * the motion and the haptics are new. The links keep their real hrefs, so without JavaScript today's pages still serve.
 */
export function ResetForm({
  initialEmail,
  focusOnMount,
  stageRef,
  onSent,
  onBack,
  requestReset = requestPasswordResetAction,
}: {
  initialEmail: string;
  /** Opened by the person (not first paint): focus goes to the field, as today's page does. */
  focusOnMount: boolean;
  stageRef?: RefObject<HTMLElement | null>;
  onSent: (email: string) => void;
  onBack: (email: string) => void;
  /** The server action by default; the preview and the tests hand in their own. */
  requestReset?: typeof requestPasswordResetAction;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [problem, setProblem] = useState<ResetProblem | null>(null);
  // Bumped on every refusal, so a repeated one still moves focus and shakes again.
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyRowRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLParagraphElement>(null);
  const reduced = useChReducedMotion();
  const anchor = stageRef ?? formRef;
  // CH-15608: a refusal arriving or clearing moves the key and the way back; they glide there.
  const gliders = useMemo<Glider[]>(() => [{ ref: anchor }, { ref: keyRowRef, within: anchor }, { ref: altRef, within: anchor }], [anchor]);
  const glide = useGlide(reduced, gliders);
  const [changes, setChanges] = useState(0);

  // CH-15820: opened from sign in, the field takes focus (today's page autofocuses it). Focus follows presence, and the
  // carried address is taken whenever it changes, because a view that comes back mid-leave is the same copy re-entering.
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) emailRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);
  useEffect(() => {
    if (nonce > 0) emailRef.current?.focus();
  }, [nonce]);
  useLayoutEffect(() => {
    if (changes > 0) glide.play();
  }, [changes, glide]);

  const refuse = (p: ResetProblem) => {
    glide.capture();
    // CH-15703 a refusal about the field, CH-15704 a failure to send.
    haptic(p.field ? 'warning' : 'error');
    setProblem(p);
    setNonce((n) => n + 1);
    setChanges((n) => n + 1);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const normalized = normalizeResetEmail(email);
    const invalid = resetEmailProblem(normalized);
    if (invalid) {
      refuse({ ...invalid, field: true });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    // CH-15720: Send reset link is tapped.
    haptic('press');
    try {
      // Rate limited on the server, and the same answer whether or not the address has an account (no enumeration).
      const result = await requestReset(normalized);
      if (!result.success) {
        refuse({ message: result.error ?? RESET_UNEXPECTED_MESSAGE, code: 'CH-15020', field: false });
        inFlight.current = false;
        setBusy(false);
        return;
      }
      // CH-15721, CH-15921: asked for; the panel moves on to check your email (the form leaves with its in-flight key).
      haptic('success');
      onSent(normalized);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'ClubhouseResetForm', action: 'requestPasswordResetAction', sport: 'golf' });
      refuse({ message: RESET_UNEXPECTED_MESSAGE, code: 'CH-15021', field: false });
      inFlight.current = false;
      setBusy(false);
    }
  }

  const back = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    onBack(normalizeResetEmail(email));
  };

  // CH-15609: a refusal about the field shakes it, as on sign in.
  const shake = nonce > 0 && problem?.field ? (nonce % 2 ? 'a' : 'b') : undefined;
  const invalid = !!problem?.field;

  return (
    <form ref={formRef} className="ch-au-form" onSubmit={handleSubmit} noValidate aria-label="Reset your password">
      <h1>Reset password</h1>
      <p className="ch-au-sub">Enter your email and we’ll send you a link.</p>
      <div className="ch-au-fields" data-invalid={invalid ? '' : undefined} data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
        <div className="ch-au-field">
          <label className="ch-au-label" htmlFor="golf-forgot-email">
            Email
          </label>
          <div className="ch-au-input" data-invalid={invalid ? 'true' : undefined}>
            <input
              ref={emailRef}
              id="golf-forgot-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              required
              aria-required="true"
              aria-invalid={invalid || undefined}
              aria-describedby={problem ? ERROR_ID : undefined}
              placeholder="Email"
              value={email}
              // CH-15910: with the keyboard up, bring Send into view above it, as sign in does.
              onFocus={() => window.setTimeout(() => keyRowRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }), 320)}
              onChange={(e) => {
                setEmail(e.target.value);
                // Today's page: editing the address clears the refusal. What it held up glides back (CH-15608).
                if (problem) {
                  glide.capture();
                  setProblem(null);
                  setChanges((n) => n + 1);
                }
              }}
            />
          </div>
        </div>
      </div>
      {problem && (
        <div className="ch-au-err" key={nonce}>
          <AuthNotice tone="danger" id={ERROR_ID} code={problem.code}>
            {problem.message}
          </AuthNotice>
        </div>
      )}
      <div className="ch-au-submit" ref={keyRowRef}>
        {/* Stays on when the field is empty: Send says what is missing (today's page). CH-15420: in flight. */}
        <button type="submit" className="ch-btn ch-btn--primary ch-btn--lg" disabled={busy} aria-busy={busy || undefined} data-ch-code={busy ? 'CH-15420' : undefined}>
          <AuthKeyLabel busy={busy} idle="Send reset link" working="Sending reset link…" />
        </button>
      </div>
      <p className="ch-au-alt" ref={altRef}>
        Remember it?{' '}
        {/* CH-15922: back to sign in in place; the href is sign in for a new tab or no JavaScript. */}
        <Link href="/golf/login" onClick={back} data-ch-code="CH-15922">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Check your email (CH-15921): today's words, with the address that was actually sent to. */
export function ResetSent({ email, focusOnMount, onBack }: { email: string; focusOnMount: boolean; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  // CH-15820: the heading takes focus, so the change is read out.
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  return (
    <div className="ch-au-form ch-au-sent" data-ch-code="CH-15921">
      <h1 ref={titleRef} tabIndex={-1}>
        Check your email
      </h1>
      <p className="ch-au-sub">
        We sent a reset link to <b>{email}</b>
      </p>
      <p className="ch-au-body">Open the link in the email to choose a new password. It expires in 1 hour. If it doesn’t arrive, check your spam folder or try a different email.</p>
      <div className="ch-au-submit">
        <Link
          href="/golf/login"
          className="ch-btn ch-btn--primary ch-btn--lg"
          data-ch-code="CH-15922"
          onClick={(e) => {
            if (!isPlainClick(e)) return;
            e.preventDefault();
            onBack();
          }}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

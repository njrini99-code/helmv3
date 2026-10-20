'use client';

import { useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { AuthNotice } from './AuthNotice';
import { OPENING_PUSH_MS } from './auth-motion';
import { GateFrame, useGateView } from './GateFrame';
import { GateChecking, GateKey, PasswordInput, PasswordRules } from './gate-fields';
import { isPlainClick, ResetForm, ResetSent, type ResetWords } from './ForgotPassword';
import { RESET_LINK_EXPIRED, resetFieldProblem, type ResetFieldProblem } from './reset-state';
import { resetWrites, type ResetWrites } from './reset-writes';

export type ResetStage = 'checking' | 'form' | 'expired' | 'sent' | 'saved';

/** The preview draws a chosen state without a round trip. */
export interface ResetPreview {
  stage: ResetStage;
  email?: string;
  /** Someone else was signed in on this device when the link was opened. */
  previous?: string;
  /** The save is refused with this sentence under the new password (a field failure), or in a banner. */
  field?: ResetFieldProblem;
  banner?: string;
}

const EXPIRED_WORDS: ResetWords = {
  aria: 'Send a new reset link',
  title: 'This link has expired',
  sub: RESET_LINK_EXPIRED,
  idle: 'Send a new link',
  working: 'Sending…',
};

/**
 * /golf/reset-password in Clubhouse: the page the reset email's button opens. Today's page, drawn in the sign-in
 * panel: the link's token is checked once, a new password is chosen with the sign-up rules ticking off as it is typed,
 * and a spent link asks for a new one right here. What it does is `reset-writes.ts`, which is today's page's calls.
 *
 *   checking  the link's token_hash is verified
 *   form      choose a password
 *   expired   the link is used or expired; ask for a new one
 *   sent      a new link is on its way
 *   saved     the password is changed, this device stays signed in and the others are signed out
 */
export function ResetPassword({ writes = resetWrites, initial, navigate }: { writes?: ResetWrites; initial?: ResetPreview; navigate?: (href: string) => void } = {}) {
  const router = useRouter();
  const reduced = useChReducedMotion();
  const { view, dir, moved, go, stageRef } = useGateView<ResetStage>(initial?.stage ?? 'checking');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [previous, setPrevious] = useState<string | null>(initial?.previous ?? null);
  const [leaving, setLeaving] = useState(false);
  // A one-time token is spent by the first check: a development double effect must not make a second one.
  const started = useRef(false);

  useEffect(() => {
    if (initial || started.current) return;
    started.current = true;
    void (async () => {
      const url = new URL(window.location.href);
      const result = await writes.verifyLink(url.searchParams.get('token_hash') ?? '');
      if (!result.ok) {
        // CH-15930: used, expired or tampered with: one way forward, a new link.
        haptic('warning');
        go('expired');
        return;
      }
      setEmail(result.email);
      setPrevious(result.previous);
      go('form');
      // Drop the one-time token from the address bar so a reload or a shared screenshot doesn't carry it.
      window.history.replaceState(null, '', url.pathname);
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const to = (href: string) => (navigate ? navigate(href) : router.push(href));
  // CH-15932: Continue hands over the way sign in does: the sheet leaves, then the dashboard.
  const leave = (href: string) => {
    haptic('success');
    setLeaving(true);
    window.setTimeout(() => to(href), reduced ? 100 : Math.max(100, OPENING_PUSH_MS));
  };

  const signIn = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    to('/golf/login');
  };

  return (
    <GateFrame
      label="Choose a new password"
      say={{ title: 'Back on the course in a minute.', line: 'A new password, and you’re in' }}
      back={{ href: '/golf/login', label: 'Sign in' }}
      phase={leaving ? 'opening' : 'login'}
      viewKey={view}
      dir={dir}
      stageRef={stageRef}
    >
      {view === 'checking' ? (
        <GateChecking title="Reset your password" line="Checking your link…" code="CH-15430" />
      ) : view === 'form' ? (
        <NewPassword
          email={email}
          previous={previous}
          writes={writes}
          focusOnMount={moved}
          preview={initial}
          onSaved={() => go('saved')}
          onExpired={() => go('expired')}
          onSignIn={signIn}
        />
      ) : view === 'expired' ? (
        <ResetForm
          initialEmail=""
          focusOnMount={moved}
          stageRef={stageRef}
          requestReset={writes.requestReset}
          words={EXPIRED_WORDS}
          onSent={(sentTo) => {
            setEmail(sentTo);
            go('sent');
          }}
          onBack={() => to('/golf/login')}
        />
      ) : view === 'sent' ? (
        <ResetSent email={email} focusOnMount={moved} onBack={() => to('/golf/login')} />
      ) : (
        <Saved email={email} focusOnMount={moved} onContinue={() => leave('/golf/dashboard')} />
      )}
    </GateFrame>
  );
}

function NewPassword({
  email,
  previous,
  writes,
  focusOnMount,
  preview,
  onSaved,
  onExpired,
  onSignIn,
}: {
  email: string;
  previous: string | null;
  writes: ResetWrites;
  focusOnMount: boolean;
  preview?: ResetPreview;
  onSaved: () => void;
  onExpired: () => void;
  onSignIn: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ids = useId();
  const rulesId = `${ids}-rules`;
  const errorId = `${ids}-error`;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [problem, setProblem] = useState<(ResetFieldProblem & { server?: boolean }) | null>(preview?.field ? { ...preview.field, server: true } : null);
  const [banner, setBanner] = useState(preview?.banner ?? '');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Bumped on every refusal so a repeated one still moves focus and shakes again.
  const [nonce, setNonce] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const present = useIsPresent();

  useEffect(() => {
    if (present && focusOnMount) passwordRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  useEffect(() => {
    if (nonce === 0) return;
    (problem?.field === 'confirm' ? confirmRef.current : passwordRef.current)?.focus();
  }, [nonce, problem]);

  const mismatch = confirm.length > 0 && confirm !== password;
  // The mismatch shows once the confirmation has been left, or on a press of Save (the problem itself).
  const live = confirmTouched && mismatch && !problem ? 'These passwords don’t match.' : '';
  const message = problem?.message ?? live;
  const code = problem?.code ?? (live ? 'CH-15133' : undefined);
  const field = problem?.field ?? (live ? 'confirm' : null);

  const refuse = (p: ResetFieldProblem & { server?: boolean }) => {
    haptic(p.server ? 'error' : 'warning');
    setProblem(p);
    setNonce((n) => n + 1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setBanner('');
    setProblem(null);
    const invalid = resetFieldProblem(password, confirm);
    if (invalid) {
      if (invalid.field === 'confirm') setConfirmTouched(true);
      refuse(invalid);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    haptic('press');
    const saved = await writes.savePassword(password);
    if (!saved.ok) {
      inFlight.current = false;
      setBusy(false);
      const { failure } = saved;
      if (failure.kind === 'expired') {
        haptic('warning');
        onExpired();
        return;
      }
      if (failure.kind === 'field') {
        // CH-15030: the server's own refusal of the password, under the field.
        refuse({ field: 'password', message: failure.message, code: 'CH-15030', server: true });
        return;
      }
      // CH-15031: a failure that is not about the password.
      haptic('error');
      setBanner(failure.message);
      setNonce((n) => n + 1);
      return;
    }
    // Every OTHER session is signed out (owner 2026-10-18): whoever prompted the reset loses access, this device stays.
    await writes.revokeOthers();
    onSaved();
  }

  const shake = nonce > 0 && problem ? (nonce % 2 ? 'a' : 'b') : undefined;

  return (
    <form className="ch-au-form" onSubmit={submit} noValidate aria-label="Choose a new password">
      <h1>Choose a new password</h1>
      {email && (
        <p className="ch-au-sub">
          For <b className="ch-au-who">{email}</b>
        </p>
      )}
      {previous && (
        <div className="ch-au-notice-top">
          <AuthNotice tone="info" code="CH-15931">
            This link is for {email || 'another account'}. You were signed in as {previous} on this device, and that session has ended.
          </AuthNotice>
        </div>
      )}
      {/* Lets iCloud Keychain and other password managers file the new password under the right account. */}
      {email && <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="ch-au-sr" />}
      <div className="ch-au-fields" data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
        <PasswordInput
          id={`${ids}-new`}
          label="New password"
          inputRef={passwordRef}
          name="new-password"
          autoComplete="new-password"
          enterKeyHint="next"
          show={show}
          onToggle={() => setShow((v) => !v)}
          invalid={field === 'password'}
          aria-describedby={field === 'password' ? `${rulesId} ${errorId}` : rulesId}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (problem) setProblem(null);
            if (banner) setBanner('');
          }}
        />
        <PasswordRules id={rulesId} password={password} />
        <PasswordInput
          id={`${ids}-confirm`}
          label="Confirm new password"
          inputRef={confirmRef}
          name="confirm-password"
          autoComplete="new-password"
          enterKeyHint="go"
          show={show}
          onToggle={() => setShow((v) => !v)}
          invalid={field === 'confirm'}
          aria-describedby={field === 'confirm' ? errorId : undefined}
          value={confirm}
          onBlur={() => setConfirmTouched(true)}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (problem?.field === 'confirm') setProblem(null);
            if (banner) setBanner('');
          }}
        />
      </div>
      {(message || banner) && (
        <div className="ch-au-err" key={`${nonce}-${message ? 'f' : 'b'}`}>
          <AuthNotice tone="danger" id={errorId} code={message ? code : 'CH-15031'}>
            {message || banner}
          </AuthNotice>
        </div>
      )}
      {/* Never greyed out: pressing it with something missing points at the box that needs it. */}
      <GateKey idle="Save password" working="Saving…" busy={busy} code="CH-15431" />
      <p className="ch-au-alt">
        Remembered it?{' '}
        <Link href="/golf/login" onClick={onSignIn}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Saved (CH-15932): the password is changed and this device is signed in; the others were signed out. */
function Saved({ email, focusOnMount, onContinue }: { email: string; focusOnMount: boolean; onContinue: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  return (
    <div className="ch-au-form ch-au-sent" role="status" data-ch-code="CH-15932">
      <h1 ref={titleRef} tabIndex={-1}>
        Password updated
      </h1>
      <p className="ch-au-sub">
        {email ? (
          <>
            You’re signed in as <b>{email}</b>.
          </>
        ) : (
          'You’re signed in.'
        )}
      </p>
      <p className="ch-au-body">For your security, your other devices were signed out.</p>
      <GateKey idle="Continue to GolfHelm" working="Opening…" type="button" onClick={onContinue} />
    </div>
  );
}

'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validatePassword } from '@/lib/auth/password-validation';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { cn } from '@/lib/utils';
import { CheckingCard, ResetShell } from './reset-shell';
import { describeResetFailure } from './reset-errors';
import styles from './reset-password.module.css';

/*
 * /golf/reset-password — redesigned 2026-10-18 to match the reset email.
 *
 *   checking  the link's token_hash is verified
 *   form      choose a password; the sign-up rules tick off as you type
 *   expired   the link is used or expired; ask for a new one right here
 *   sent      a new link is on its way
 *   saved     the password is changed, this device stays signed in and the
 *             others are signed out
 *
 * The LINK is the authorization, never an existing session: it is verified
 * even when someone is already signed in, which replaces that session with
 * the recovering user's (a shared laptop must not let anyone change the
 * signed-in account's password without the old one).
 */

type Stage = 'checking' | 'form' | 'expired' | 'sent' | 'saved';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RULES = [
  { id: 'length', label: '8 or more characters', need: '8 or more characters' },
  { id: 'case', label: 'Upper and lower case', need: 'upper and lower case letters' },
  { id: 'number', label: 'A number', need: 'a number' },
  { id: 'symbol', label: 'A symbol', need: 'a symbol' },
] as const;

type RuleId = (typeof RULES)[number]['id'];

function rulesMet(password: string): Record<RuleId, boolean> {
  const { requirements: r } = validatePassword(password);
  return {
    length: r.minLength,
    case: r.hasUppercase && r.hasLowercase,
    number: r.hasNumber,
    symbol: r.hasSpecialChar,
  };
}

function joinNeeds(needs: string[]): string {
  if (needs.length <= 1) return needs[0] ?? '';
  return `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1]}`;
}

const CHECK_PATH = 'M2 5.2 4.1 7.3 8 3';

export default function ResetPasswordPage() {
  const router = useRouter();
  // createClient() returns a fresh browser client per call; memoize so the
  // verification effect below runs once.
  const supabase = useMemo(() => createClient(), []);

  const [stage, setStage] = useState<Stage>('checking');
  const [accountEmail, setAccountEmail] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function verifyLink() {
      try {
        const url = new URL(window.location.href);

        // Every GolfHelm reset link carries a `token_hash`: it is minted
        // server-side and sent through Resend (src/lib/auth/send-password-reset.ts),
        // and no golf surface calls resetPasswordForEmail, so there is never a
        // PKCE `?code=` this browser could exchange (it would have no verifier).
        // There is deliberately no branch that skips verification: a link
        // without a hash goes to verifyOtp with an empty one, which Supabase
        // rejects, so a missing or tampered parameter can only land on "expired".
        const { data, error } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: url.searchParams.get('token_hash') ?? '',
        });
        const ok = !error;
        const email = data?.user?.email ?? data?.session?.user?.email ?? undefined;

        if (cancelled) return;
        if (ok) {
          setAccountEmail(email ?? '');
          setStage('form');
          // Drop the one-time token from the address bar so a reload or a
          // shared screenshot doesn't carry it.
          window.history.replaceState(null, '', url.pathname);
        } else {
          setStage('expired');
        }
      } catch {
        if (!cancelled) setStage('expired');
      }
    }

    verifyLink();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const below =
    stage === 'form' || stage === 'expired' ? (
      <p className={cn(styles.below, styles.lockupEnter)}>
        Remembered it?{' '}
        <Link href="/golf/login" className={styles.link}>
          Sign in
        </Link>
      </p>
    ) : null;

  return (
    <ResetShell below={below}>
      {stage === 'checking' ? (
        <CheckingCard />
      ) : (
        // Keyed by stage so each state enters with a short rise.
        <div key={stage} className={styles.swap}>
          {stage === 'form' && (
            <PasswordForm
              email={accountEmail}
              onSaved={() => setStage('saved')}
              onExpired={() => setStage('expired')}
              supabase={supabase}
            />
          )}
          {stage === 'expired' && <ExpiredCard onSent={(email) => { setAccountEmail(email); setStage('sent'); }} />}
          {stage === 'sent' && <SentCard email={accountEmail} />}
          {stage === 'saved' && <SavedCard email={accountEmail} onContinue={() => router.push('/golf/dashboard')} />}
        </div>
      )}
    </ResetShell>
  );
}

/* ── Choose a password ──────────────────────────────────────────────────── */

type BrowserClient = ReturnType<typeof createClient>;

function PasswordForm({
  email,
  supabase,
  onSaved,
  onExpired,
}: {
  email: string;
  supabase: BrowserClient;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const ids = useId();
  const passwordId = `${ids}-password`;
  const confirmId = `${ids}-confirm`;
  const passwordMsgId = `${ids}-password-msg`;
  const confirmMsgId = `${ids}-confirm-msg`;
  const rulesId = `${ids}-rules`;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [banner, setBanner] = useState('');
  const [pending, setPending] = useState(false);
  // Bumped on every failed submit so the shake replays and focus moves.
  const [attempt, setAttempt] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const met = rulesMet(password);
  const metCount = RULES.filter((r) => met[r.id]).length;
  const mismatch = confirm.length > 0 && confirm !== password;
  const shownConfirmError = confirmError || (confirmTouched && mismatch ? 'These passwords don’t match.' : '');

  const fail = (field: 'password' | 'confirm' | null) => {
    setAttempt((n) => n + 1);
    if (field === 'password') passwordRef.current?.focus();
    if (field === 'confirm') confirmRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setBanner('');
    setPasswordError('');
    setConfirmError('');

    if (!password) {
      setPasswordError('Enter a new password.');
      return fail('password');
    }
    const missing = RULES.filter((r) => !met[r.id]).map((r) => r.need);
    if (missing.length > 0) {
      setPasswordError(`Your password needs ${joinNeeds(missing)}.`);
      return fail('password');
    }
    if (!validatePassword(password).requirements.notCommon) {
      setPasswordError('That password is too common. Pick something less guessable.');
      return fail('password');
    }
    if (!confirm) {
      setConfirmError('Enter your new password again.');
      return fail('confirm');
    }
    if (confirm !== password) {
      setConfirmTouched(true);
      setConfirmError('These passwords don’t match.');
      return fail('confirm');
    }

    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const failure = describeResetFailure(error);
        setPending(false);
        if (failure.kind === 'expired') return onExpired();
        if (failure.kind === 'field') {
          setPasswordError(failure.message);
          return fail('password');
        }
        setBanner(failure.message);
        return fail(null);
      }
    } catch {
      setPending(false);
      setBanner('Couldn’t save. Check your connection and try again.');
      return fail(null);
    }

    // Owner decision (2026-10-18): a reset signs out every OTHER session, so
    // whoever prompted the reset loses access. This device stays signed in.
    try {
      await supabase.auth.signOut({ scope: 'others' });
    } catch {
      // The password is already changed; a failed revoke must not strand the
      // user on the form. Other sessions still expire on refresh.
    }
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Choose a new password">
      <h1 className={styles.title}>Choose a new password</h1>
      {email ? (
        <p className={styles.lede}>
          For <strong>{email}</strong>
        </p>
      ) : null}

      {/* Lets iCloud Keychain and other password managers file the new
          password under the right account. */}
      {email ? (
        // eslint-disable-next-line helm/no-raw-input -- invisible username hint for password managers, never shown
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className={styles.srOnly}
        />
      ) : null}

      <div className={styles.field}>
        <label htmlFor={passwordId} className={styles.label}>
          New password
        </label>
        <div
          className={styles.inputWrap}
          data-invalid={passwordError ? 'true' : undefined}
        >
          {/* eslint-disable-next-line helm/no-raw-input -- this page's own field treatment, matched to the reset email */}
          <input
            ref={passwordRef}
            id={passwordId}
            name="new-password"
            className={styles.input}
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="At least 8 characters"
            required
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? `${rulesId} ${passwordMsgId}` : rulesId}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the one task on this page
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError('');
              if (confirmError) setConfirmError('');
              if (banner) setBanner('');
            }}
          />
          {/* eslint-disable-next-line helm/no-raw-button -- inline Show/Hide accessory inside the field */}
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={reveal}
            aria-controls={passwordId}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>
        {passwordError ? (
          <p key={attempt} id={passwordMsgId} role="alert" className={cn(styles.message, styles.shake)}>
            {passwordError}
          </p>
        ) : null}
      </div>

      <ul id={rulesId} className={styles.rules} aria-label="Password requirements">
        {RULES.map((rule) => (
          <li key={rule.id} className={styles.rule} data-met={met[rule.id] ? 'true' : 'false'}>
            <span className={styles.dot} aria-hidden="true">
              <svg width="8" height="8" viewBox="0 0 10 10">
                <path d={CHECK_PATH} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--rp-card)' }} />
              </svg>
            </span>
            {rule.label}
            <span className={styles.srOnly}>{met[rule.id] ? ', done' : ', not yet'}</span>
          </li>
        ))}
      </ul>
      {/* One short live summary instead of announcing every keystroke. */}
      <p className={styles.srOnly} aria-live="polite">
        {password ? `${metCount} of ${RULES.length} requirements met` : ''}
      </p>

      <div className={styles.field}>
        <label htmlFor={confirmId} className={styles.label}>
          Confirm new password
        </label>
        <div
          className={styles.inputWrap}
          data-invalid={shownConfirmError ? 'true' : undefined}
        >
          {/* eslint-disable-next-line helm/no-raw-input -- this page's own field treatment, matched to the reset email */}
          <input
            ref={confirmRef}
            id={confirmId}
            name="confirm-password"
            className={styles.input}
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            aria-invalid={shownConfirmError ? true : undefined}
            aria-describedby={shownConfirmError ? confirmMsgId : undefined}
            value={confirm}
            onBlur={() => setConfirmTouched(true)}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (confirmError) setConfirmError('');
              if (banner) setBanner('');
            }}
          />
        </div>
        {shownConfirmError ? (
          <p key={confirmError ? attempt : 'live'} id={confirmMsgId} role="alert" className={cn(styles.message, confirmError && styles.shake)}>
            {shownConfirmError}
          </p>
        ) : null}
      </div>

      {banner ? (
        <p key={attempt} role="alert" className={cn(styles.banner, styles.swap)}>
          {banner}
        </p>
      ) : null}

      {/* Never greyed out: pressing it with something missing points at the
          field that needs it. */}
      {/* eslint-disable-next-line helm/no-raw-button -- this page's primary action, matched to the reset email */}
      <button type="submit" className={styles.button} aria-busy={pending || undefined}>
        {pending ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Saving…
          </>
        ) : (
          'Save password'
        )}
      </button>
    </form>
  );
}

/* ── Expired or already used ────────────────────────────────────────────── */

function ExpiredCard({ onSent }: { onSent: (email: string) => void }) {
  const ids = useId();
  const emailId = `${ids}-email`;
  const msgId = `${ids}-email-msg`;
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_FORMAT.test(normalized)) {
      setError(normalized ? 'Enter a valid email address.' : 'Enter your email address.');
      setAttempt((n) => n + 1);
      emailRef.current?.focus();
      return;
    }
    setError('');
    setPending(true);
    try {
      // Rate-limited and enumeration-safe: it always answers the same way.
      const result = await requestPasswordResetAction(normalized);
      if (!result.success) {
        setError(result.error ?? 'Couldn’t send a link. Try again.');
        setAttempt((n) => n + 1);
        setPending(false);
        return;
      }
      onSent(normalized);
    } catch {
      setError('Couldn’t send a link. Check your connection and try again.');
      setAttempt((n) => n + 1);
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Send a new reset link">
      <h1 className={styles.title}>This link has expired</h1>
      <p className={styles.lede}>
        Reset links work once and expire after 1&nbsp;hour. Enter your email and we’ll send a new one.
      </p>
      <div className={styles.field}>
        <label htmlFor={emailId} className={styles.label}>
          Email
        </label>
        <div
          className={styles.inputWrap}
          data-invalid={error ? 'true' : undefined}
        >
          {/* eslint-disable-next-line helm/no-raw-input -- this page's own field treatment, matched to the reset email */}
          <input
            ref={emailRef}
            id={emailId}
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="you@school.edu"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? msgId : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
          />
        </div>
        {error ? (
          <p key={attempt} id={msgId} role="alert" className={cn(styles.message, styles.shake)}>
            {error}
          </p>
        ) : null}
      </div>
      {/* eslint-disable-next-line helm/no-raw-button -- this page's primary action, matched to the reset email */}
      <button type="submit" className={styles.button} aria-busy={pending || undefined}>
        {pending ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Sending…
          </>
        ) : (
          'Send a new link'
        )}
      </button>
    </form>
  );
}

/* ── A new link is on its way ───────────────────────────────────────────── */

function SentCard({ email }: { email: string }) {
  return (
    <div role="status">
      <SuccessBadge icon="mail" />
      <h1 className={styles.title}>Check your email</h1>
      <p className={styles.lede}>
        We sent a new reset link to <strong>{email}</strong>. It expires in 1&nbsp;hour. If it doesn’t arrive, check
        your spam folder.
      </p>
      <Link href="/golf/login" className={styles.button}>
        Back to sign in
      </Link>
    </div>
  );
}

/* ── Saved ──────────────────────────────────────────────────────────────── */

function SavedCard({ email, onContinue }: { email: string; onContinue: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div role="status">
      <SuccessBadge icon="check" />
      <h1 className={styles.title}>Password updated</h1>
      <p className={styles.lede}>
        {email ? (
          <>
            You’re signed in as <strong>{email}</strong>.
          </>
        ) : (
          'You’re signed in.'
        )}
      </p>
      {/* eslint-disable-next-line helm/no-raw-button -- this page's primary action, matched to the reset email */}
      <button ref={buttonRef} type="button" className={styles.button} onClick={onContinue}>
        Continue to GolfHelm
      </button>
      <p className={styles.fine}>For your security, other devices were signed out.</p>
    </div>
  );
}

function SuccessBadge({ icon }: { icon: 'check' | 'mail' }) {
  return (
    <div className={styles.badge} aria-hidden="true">
      {icon === 'check' ? (
        <svg width="22" height="22" viewBox="0 0 20 20">
          <path pathLength={1} d="M4.5 10.5 8.2 14 15.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path pathLength={1} d="m4 7.5 8 5.5 8-5.5" />
        </svg>
      )}
    </div>
  );
}

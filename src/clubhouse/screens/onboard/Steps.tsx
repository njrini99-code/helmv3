'use client';

import {
  ArrowRight,
  BookOpen,
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Circle,
  ClipboardList,
  Eye,
  EyeOff,
  Flag,
  ImagePlus,
  KeyRound,
  Landmark,
  Mail,
  Minus,
  Plus,
  Send,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { AuthNotice } from '../auth/AuthNotice';
import { greetingWord } from '../auth/scene-sky';
import { saveDraftNow, type Draft } from './flow';
import {
  CODE_SLOTS,
  EMAIL_RE,
  HCP_MAX,
  HCP_MIN,
  REQUEST_TITLE,
  accountErrorFor,
  clampHcp,
  classOf,
  cleanCity,
  cleanCode,
  cleanState,
  codeAutoChecks,
  codeCanSubmit,
  fmtHcp,
  gradYears,
  hcpWords,
  hometownProblem,
  needsGuardianConsent,
  passwordProblem,
  passwordRules,
  passwordScore,
  photoProblem,
  requestProblem,
  slotCount,
  type AccountError,
  type OnboardPath,
  type OnboardStep,
  type RequestWho,
} from './logic';
import { useOnboardWrites } from './writes-context';

export interface StepProps {
  d: Draft;
  hist: OnboardStep[];
  up: (patch: Partial<Draft>) => void;
  next: (patch?: Partial<Draft>, to?: OnboardStep) => void;
  back: (() => void) | null;
  dir: 'fwd' | 'back';
  path: OnboardPath;
  /** The viewer's hour, or null on the server and during hydration. */
  hour: number | null;
  now: Date;
  phone: boolean;
  /** The hand-off into the app: the card lifts, the course folds, then the route changes. */
  finish: (href: string) => void;
  /** The sign-in link, carrying the invite back if there was one. */
  signInHref: string;
}

/** The pause after the eighth character before the code checks itself (design: 800ms). */
const CODE_PAUSE_MS = 800;
/** A choice advances after its tick has been seen (design: 260 to 280ms). */
const CHOICE_MS = 270;

function Q({
  eyebrow,
  title,
  sub,
  children,
  onSubmit,
  back,
  dir,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  onSubmit?: () => void;
  back?: (() => void) | null;
  dir: 'fwd' | 'back';
}) {
  const id = useId();
  return (
    <form
      className="ch-ox-q"
      data-dir={dir}
      aria-labelledby={`${id}-h`}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      {back && (
        <button type="button" className="ch-ox-back" onClick={back}>
          <Icon icon={ChevronLeft} size={16} />
          Back
        </button>
      )}
      {eyebrow && <div className="ch-ox-eyebrow">{eyebrow}</div>}
      <h1 className="ch-ox-h1" id={`${id}-h`} tabIndex={-1}>
        {title}
      </h1>
      {sub && <p className="ch-ox-sub">{sub}</p>}
      {children}
    </form>
  );
}

function Act({ label = 'Continue', disabled, busy, busyLabel, icon = ArrowRight, children, phone }: { label?: string; disabled?: boolean; busy?: boolean; busyLabel?: string; icon?: typeof ArrowRight; children?: ReactNode; phone: boolean }) {
  return (
    <div className="ch-ox-act">
      <Button type="submit" variant="primary" size="lg" rightIcon={busy ? undefined : icon} disabled={disabled || busy}>
        {busy ? busyLabel ?? label : label}
      </Button>
      {!disabled && !busy && !phone && (
        <span className="ch-ox-enter" aria-hidden="true">
          or press <kbd>Return</kbd>
        </span>
      )}
      {children}
    </div>
  );
}

const Tick = () => (
  <span className="ch-ox-tick" aria-hidden="true">
    <Icon icon={Check} size={12} />
  </span>
);

const crestOf = (team: string | null): string =>
  (team ?? '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'GH';

function Who({ d, path }: { d: Draft; path: OnboardPath }) {
  const name = `${d.first} ${d.last}`.trim();
  const role = path === 'staff' ? 'Assistant coach' : path === 'player' ? 'Player' : 'New member';
  const team = d.teamName ?? (path === 'staff' ? 'Coaching staff' : 'GolfHelm');
  return (
    <>
      {name ? <Avatar name={name} size={22} /> : null}
      <span>
        {role} · {team}
      </span>
    </>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────────

export function Intro({ d, next, hour, dir }: StepProps) {
  // Arrived from an invite link: the code is already here, so the first screen is the invitation.
  if (d.code && d.intent !== 'request') {
    return (
      <Q dir={dir} eyebrow={hour === null ? undefined : greetingWord(hour)} title="You’ve been invited to a team." sub="Your coach sent you a team code. Set up your account and you’ll be with the team in about two minutes." onSubmit={() => next({ intent: 'code' })}>
        <div className="ch-ox-act">
          <Button type="submit" variant="primary" size="lg" rightIcon={ArrowRight}>
            Accept invite
          </Button>
        </div>
      </Q>
    );
  }
  return (
    <Q dir={dir} eyebrow={hour === null ? undefined : greetingWord(hour)} title="Welcome to the clubhouse." sub="GolfHelm keeps your team’s rounds, stats, travel and qualifiers in one place. Let’s get you in.">
      <div className="ch-ox-body">
        <div className="ch-ox-choice" role="group" aria-label="How are you joining">
          <button type="button" className="ch-ox-card" onClick={() => next({ intent: 'code' })}>
            <span className="ch-ox-art">
              <Icon icon={KeyRound} size={24} />
            </span>
            <div>
              <b>I have a team code</b>
              <p>From your coach. Setup takes about two minutes.</p>
            </div>
            <span className="ch-ox-card__go">
              Enter code
              <Icon icon={ArrowRight} size={14} />
            </span>
          </button>
          <button type="button" className="ch-ox-card" onClick={() => next({ intent: 'request' })}>
            <span className="ch-ox-art">
              <Icon icon={Mail} size={24} />
            </span>
            <div>
              <b>I need access</b>
              <p>For coaches, athletic directors, and players whose coach isn’t here yet.</p>
            </div>
            <span className="ch-ox-card__go">
              Request access
              <Icon icon={ArrowRight} size={14} />
            </span>
          </button>
        </div>
      </div>
    </Q>
  );
}

// ── Team code ────────────────────────────────────────────────────────────────

type CodeState = 'idle' | 'checking' | 'ok' | 'error' | 'net';

export function Code({ d, up, next, back, dir, phone }: StepProps) {
  const { checkCode } = useOnboardWrites();
  const [focus, setFocus] = useState(false);
  const [st, setSt] = useState<CodeState>(d.kind ? 'ok' : 'idle');
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const run = async (code: string) => {
    const mine = ++seq.current;
    setSt('checking');
    const r = await checkCode(code);
    if (mine !== seq.current) return;
    if (r.kind === 'ok') {
      setSt('ok');
      up({ kind: r.code, teamName: r.teamName, code });
      haptic('success');
    } else if (r.kind === 'bad') {
      setSt('error');
      haptic('error');
    } else {
      setSt('net');
      haptic('error');
    }
  };

  // Eight characters and a pause: check it. Any other length waits for Continue, so a 9-character code is not checked at 8.
  useEffect(() => {
    if (d.kind || !codeAutoChecks(d.code) || st !== 'idle') return;
    const t = setTimeout(() => void run(d.code), CODE_PAUSE_MS);
    return () => clearTimeout(t);
    // run is stable for this purpose; re-arm only when the code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.code, d.kind, st]);

  useEffect(() => {
    if (!phone && !d.kind) input.current?.focus();
  }, [phone, d.kind]);

  const set = (v: string) => {
    seq.current++;
    up({ code: cleanCode(v), kind: null, teamName: null });
    setSt('idle');
  };
  const submit = () => {
    if (d.kind) {
      next();
      return;
    }
    if (codeCanSubmit(d.code) && st !== 'checking') void run(d.code);
  };

  const n = slotCount(d.code);
  const chars = d.code.split('');
  const slots: Array<number | 'dash'> = [0, 1, 2, 3, 'dash', ...Array.from({ length: n - 4 }, (_, i) => i + 4)];
  const staff = d.kind === 'staff';
  const title = !d.kind ? 'Enter your team code.' : staff ? 'You’re invited to the coaching staff.' : `Welcome to ${d.teamName ?? 'your team'}.`;
  const sub = !d.kind
    ? 'Letters and numbers from your coach. Case doesn’t matter.'
    : staff
      ? 'Your head coach invited you as an assistant coach. You’ll have full access to the team when you finish.'
      : 'You’ll join the roster when you finish setting up.';

  return (
    <Q dir={dir} back={back} title={title} sub={sub} onSubmit={submit}>
      <div className="ch-ox-body">
        <label className="ch-ox-code" data-focus={focus ? '' : undefined} data-st={st}>
          <input
            ref={input}
            value={d.code}
            onChange={(e) => set(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            aria-label="Team code"
            aria-describedby="ch-ox-code-foot"
            aria-invalid={st === 'error' ? true : undefined}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            inputMode="text"
            maxLength={14}
          />
          <div className="ch-ox-slots" aria-hidden="true" style={{ ['--ch-ox-rest' as string]: String(n - 4) }}>
            {slots.map((i) =>
              i === 'dash' ? (
                <b key="dash" />
              ) : (
                <span
                  key={`${i}${chars[i] ?? ''}`}
                  className="ch-ox-slot"
                  style={{ ['--ch-ox-i' as string]: String(i) }}
                  data-filled={chars[i] ? '' : undefined}
                  data-cur={i === chars.length && st === 'idle' ? '' : undefined}
                >
                  {chars[i] ?? ''}
                </span>
              ),
            )}
          </div>
        </label>
        <div className="ch-ox-code__foot" id="ch-ox-code-foot" aria-live="polite">
          {st === 'checking' ? (
            <span className="ch-ox-check">
              <i className="ch-ox-spin" aria-hidden="true" />
              Checking your code…
            </span>
          ) : st === 'ok' ? (
            <span className="ch-ox-check" data-tone="ok">
              <Icon icon={CircleCheck} size={15} />
              Code matched
            </span>
          ) : st === 'error' ? (
            <span className="ch-ox-check" data-tone="error">
              <Icon icon={CircleAlert} size={15} />
              That code didn’t match a team
            </span>
          ) : st === 'net' ? (
            <span className="ch-ox-check" data-tone="warn">
              <Icon icon={WifiOff} size={15} />
              We couldn’t check your code
            </span>
          ) : (
            <span className="ch-ox-hint">{d.code.length > 0 && d.code.length !== CODE_SLOTS ? 'Press Continue to check it.' : 'Paste it or type it. We check as you go.'}</span>
          )}
          {d.code && st !== 'checking' && (
            <button
              type="button"
              className="ch-ox-link"
              onClick={() => {
                set('');
                input.current?.focus();
              }}
            >
              Clear
            </button>
          )}
        </div>
        {st === 'error' && (
          <div className="ch-ox-err">
            <AuthNotice tone="danger" code="CH-15110">
              Check the code with your coach and try again. Assistant coaches use the staff code from their head coach.
            </AuthNotice>
          </div>
        )}
        {st === 'net' && (
          <div className="ch-ox-err">
            <AuthNotice
              tone="warning"
              code="CH-15010"
              action={
                <Button size="sm" onClick={() => void run(d.code)}>
                  Try again
                </Button>
              }
            >
              Unable to reach the server. Please check your internet connection and try again.
            </AuthNotice>
          </div>
        )}
        {d.kind && (
          <div className="ch-ox-team">
            <span className="ch-ox-crest">{staff ? <Icon icon={ClipboardList} size={22} /> : crestOf(d.teamName)}</span>
            <div>
              <div className="ch-ox-team__n">{staff ? 'Coaching staff' : d.teamName ?? 'Your team'}</div>
              <div className="ch-ox-team__m">{staff ? 'Staff invite · assistant coach' : 'Team code · player'}</div>
            </div>
          </div>
        )}
      </div>
      {d.kind ? (
        <Act phone={phone} label={staff ? 'Join the staff' : 'Continue'} />
      ) : (
        <div className="ch-ox-act">
          <Button type="submit" variant="primary" size="lg" rightIcon={ArrowRight} disabled={!codeCanSubmit(d.code) || st === 'checking'}>
            Continue
          </Button>
          <button type="button" className="ch-ox-link" onClick={() => next({ intent: 'request', code: '', kind: null, teamName: null }, 'rwho')}>
            I don’t have a code
          </button>
        </div>
      )}
    </Q>
  );
}

// ── Name ─────────────────────────────────────────────────────────────────────

export function Name({ d, up, next, path, back, dir, phone }: StepProps) {
  const [bad, setBad] = useState<'first' | 'last' | null>(null);
  const go = () => {
    if (!d.first.trim()) {
      setBad('first');
      haptic('warning');
      return;
    }
    if (!d.last.trim()) {
      setBad('last');
      haptic('warning');
      return;
    }
    next();
  };
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={{ ...d, first: '', last: '' }} path={path} />} title="First, what should we call you?" sub="This is how you’ll appear on the roster and in messages." onSubmit={go}>
      <div className="ch-ox-body">
        <div className="ch-ox-names">
          <label className="ch-ox-big" data-invalid={bad === 'first' ? '' : undefined}>
            <span>First name</span>
            <input
              value={d.first}
              onChange={(e) => {
                up({ first: e.target.value.slice(0, 100) });
                setBad(null);
              }}
              placeholder="First"
              autoComplete="given-name"
              aria-invalid={bad === 'first' ? true : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the one question on this screen
              autoFocus={!phone}
            />
          </label>
          <label className="ch-ox-big" data-invalid={bad === 'last' ? '' : undefined}>
            <span>Last name</span>
            <input
              value={d.last}
              onChange={(e) => {
                up({ last: e.target.value.slice(0, 100) });
                setBad(null);
              }}
              placeholder="Last"
              autoComplete="family-name"
              aria-invalid={bad === 'last' ? true : undefined}
            />
          </label>
        </div>
        <div className="ch-ox-hello" aria-live="polite" data-error={bad ? '' : undefined}>
          {bad ? <span>Add your {bad} name to continue.</span> : d.first.trim() ? <span key={d.first.trim().length > 1 ? 'y' : 'n'}>Nice to meet you, {d.first.trim()}.</span> : null}
        </div>
      </div>
      <Act phone={phone} disabled={!d.first.trim() || !d.last.trim()} />
    </Q>
  );
}

// ── Graduation year ──────────────────────────────────────────────────────────

export function Grad({ d, next, path, back, dir, now }: StepProps) {
  const years = gradYears(now);
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`When do you graduate, ${d.first.trim() || 'there'}?`} sub="Sets your class on the roster. Coaches use it for eligibility.">
      <div className="ch-ox-body">
        <div className="ch-ox-tiles" role="radiogroup" aria-label="Graduation year">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              role="radio"
              aria-checked={d.grad === y}
              className="ch-ox-tile"
              onClick={() => {
                haptic('select');
                setTimeout(() => next({ grad: y }), CHOICE_MS);
              }}
            >
              <b>{y}</b>
              <span>{classOf(y, now)}</span>
              <Tick />
            </button>
          ))}
        </div>
      </div>
    </Q>
  );
}

// ── Account ──────────────────────────────────────────────────────────────────

export function Account({ d, hist, up, next, path, back, dir, phone, now, signInHref }: StepProps) {
  const router = useRouter();
  const { createAccount } = useOnboardWrites();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AccountError | null>(null);
  const player = path === 'player';

  const submit = async () => {
    if (busy || !d.kind) return;
    const email = d.email.trim();
    if (!EMAIL_RE.test(email)) {
      setErr({ field: 'email', message: email ? 'Please enter a valid email address.' : 'Enter your email.' });
      haptic('warning');
      return;
    }
    const p = passwordProblem(pw);
    if (p) {
      setErr({ field: 'pw', message: p });
      haptic('warning');
      return;
    }
    setErr(null);
    setBusy(true);
    haptic('press');
    const r = await createAccount({ kind: d.kind, email, password: pw, first: d.first, last: d.last });
    if (!r.ok) {
      setBusy(false);
      setErr(accountErrorFor(r.error));
      haptic('error');
      return;
    }
    haptic('success');
    const made: Partial<Draft> = { accountMade: true, email };
    if (r.staffJoined) {
      next(made, 'staffdone');
      return;
    }
    // A player finishes on /golf/player, where these screens pick up at "Your game". Save first: the route is about to change.
    const d2 = { ...d, ...made };
    saveDraftNow({ d: d2, hist: [...hist, 'game'] });
    // The session cookies are new; refresh the router's cache before moving (as today's sign-up does).
    router.refresh();
    router.push(r.redirectTo);
  };

  const rules = passwordRules(pw);
  const emailErr = err?.field === 'email' ? err.message : null;
  const pwErr = err?.field === 'pw' ? err.message : null;
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`Create your account, ${d.first.trim() || 'there'}.`} sub="You’ll use this email and password to sign in." onSubmit={() => void submit()}>
      <div className="ch-ox-body">
        <div className="ch-ox-fields">
          <div className="ch-ox-field">
            <label htmlFor="ch-ox-email">Email</label>
            <div className="ch-ox-input" data-invalid={emailErr ? '' : undefined}>
              <input
                id="ch-ox-email"
                type="email"
                value={d.email}
                onChange={(e) => {
                  up({ email: e.target.value });
                  if (err?.field === 'email') setErr(null);
                }}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@school.edu"
                aria-invalid={emailErr ? true : undefined}
                aria-describedby={emailErr ? 'ch-ox-email-e' : player ? undefined : 'ch-ox-email-h'}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the first field on this screen
                autoFocus={!phone}
              />
            </div>
            {emailErr ? (
              <span className="ch-ox-error" id="ch-ox-email-e">
                {emailErr}
              </span>
            ) : !player ? (
              <span className="ch-ox-help" id="ch-ox-email-h">
                Your school email helps your head coach find you.
              </span>
            ) : null}
          </div>
          <div className="ch-ox-field">
            <label htmlFor="ch-ox-pw">Password</label>
            <div className="ch-ox-input" data-invalid={pwErr ? '' : undefined}>
              <input
                id="ch-ox-pw"
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  if (err?.field === 'pw') setErr(null);
                }}
                autoComplete="new-password"
                aria-invalid={pwErr ? true : undefined}
                aria-describedby={pwErr ? 'ch-ox-pw-e ch-ox-pw-r' : 'ch-ox-pw-r'}
              />
              <button type="button" className="ch-ox-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}>
                <Icon icon={show ? EyeOff : Eye} size={16} />
              </button>
            </div>
            {pwErr && (
              <span className="ch-ox-error" id="ch-ox-pw-e">
                {pwErr}
              </span>
            )}
            <div className="ch-ox-meter" data-s={passwordScore(pw)} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <ul className="ch-ox-rules" id="ch-ox-pw-r" aria-label="Password needs">
              {rules.map((r) => (
                <li key={r.label} data-ok={r.ok ? '' : undefined}>
                  <Icon icon={r.ok ? CircleCheck : Circle} size={13} />
                  {r.label}
                  <span className="ch-au-sr">{r.ok ? ', done' : ', not yet'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {err?.signIn && (
        <div className="ch-ox-err">
          <AuthNotice
            tone="danger"
            code="CH-15011"
            action={
              <Button size="sm" href={signInHref}>
                Go to sign in
              </Button>
            }
          >
            This email already has a GolfHelm account.
          </AuthNotice>
        </div>
      )}
      {err && !err.field && (
        <div className="ch-ox-err">
          <AuthNotice tone="danger" code="CH-15012">
            {err.message}
          </AuthNotice>
        </div>
      )}
      <Act phone={phone} label="Create account" busy={busy} busyLabel="Creating your account…" />
      <p className="ch-ox-legal">
        By creating an account you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        {player && d.grad != null && needsGuardianConsent(d.grad, now) ? ' If you’re under 18, a parent or guardian acknowledges and consents to the collection of information described in our Privacy Policy.' : ''}
      </p>
    </Q>
  );
}

// ── Your game ────────────────────────────────────────────────────────────────

const MARKS: Array<[number, string]> = [
  [-6, '+6'],
  [0, 'Scratch'],
  [10, '10'],
  [20, '20'],
  [36, '36'],
];

export function Game({ d, up, next, path, back, dir, phone }: StepProps) {
  const [stErr, setStErr] = useState<string | null>(null);
  const none = d.hcp == null;
  const n = none ? 8 : d.hcp!;
  const pct = ((n - HCP_MIN) / (HCP_MAX - HCP_MIN)) * 100;
  const set = (v: number) => up({ hcp: clampHcp(v) });
  const go = () => {
    const p = hometownProblem(d.city, d.state);
    if (p) {
      setStErr(p);
      haptic('warning');
      return;
    }
    next();
  };
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title="Tell us about your game." sub="Your coach sees this on your profile. You can change it anytime." onSubmit={go}>
      <div className="ch-ox-body">
        <div className="ch-ox-hcp">
          <div className="ch-ox-hcp__top">
            <span className="ch-ox-hcp__k" id="ch-ox-hcp-k">
              Handicap index
            </span>
            <button type="button" className="ch-ox-link" onClick={() => up({ hcp: none ? 8 : null })}>
              {none ? 'I have one' : 'I don’t have one yet'}
            </button>
          </div>
          <div className="ch-ox-hcp__row">
            <span className="ch-ox-hcp__val" data-none={none ? '' : undefined} data-plus={!none && n < 0 ? '' : undefined} aria-live="polite">
              {none ? '—' : fmtHcp(n)}
            </span>
            <span className="ch-ox-hcp__desc">{hcpWords(none ? null : n)}</span>
            {!none && (
              <span className="ch-ox-steps">
                <button type="button" className="ch-ox-step" aria-label="Lower" onClick={() => set(n - 0.1)}>
                  <Icon icon={Minus} size={16} />
                </button>
                <button type="button" className="ch-ox-step" aria-label="Higher" onClick={() => set(n + 0.1)}>
                  <Icon icon={Plus} size={16} />
                </button>
              </span>
            )}
          </div>
          {!none && (
            <>
              <input
                className="ch-ox-range"
                type="range"
                min={HCP_MIN}
                max={HCP_MAX}
                step={0.1}
                value={n}
                style={{ ['--ch-ox-p' as string]: `${pct}%` }}
                onChange={(e) => set(Number(e.target.value))}
                aria-labelledby="ch-ox-hcp-k"
                aria-valuetext={fmtHcp(n)}
              />
              <div className="ch-ox-scale" aria-hidden="true">
                {MARKS.map(([v, l]) => (
                  <span key={v} data-mark={v === 0 ? '' : undefined} style={{ left: `${((v - HCP_MIN) / (HCP_MAX - HCP_MIN)) * 100}%` }}>
                    {l}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <div>
          <div className="ch-ox-lbl">
            Hometown <span className="ch-ox-opt">· optional</span>
          </div>
          <div className="ch-ox-city">
            <div className="ch-ox-field">
              <label htmlFor="ch-ox-city">City</label>
              <div className="ch-ox-input">
                <input id="ch-ox-city" value={d.city} onChange={(e) => up({ city: cleanCity(e.target.value) })} placeholder="Austin" autoComplete="address-level2" />
              </div>
            </div>
            <div className="ch-ox-field ch-ox-state">
              <label htmlFor="ch-ox-state">State</label>
              <div className="ch-ox-input" data-invalid={stErr ? '' : undefined}>
                <input
                  id="ch-ox-state"
                  value={d.state}
                  onChange={(e) => {
                    up({ state: cleanState(e.target.value) });
                    setStErr(null);
                  }}
                  maxLength={2}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="address-level1"
                  pattern="[A-Za-z]{2}"
                  placeholder="TX"
                  aria-invalid={stErr ? true : undefined}
                  aria-describedby={stErr ? 'ch-ox-state-e' : undefined}
                />
              </div>
            </div>
          </div>
          {stErr && (
            <span className="ch-ox-error" id="ch-ox-state-e">
              {stErr}
            </span>
          )}
        </div>
      </div>
      <Act phone={phone} />
    </Q>
  );
}

// ── Photo, and finishing a player ────────────────────────────────────────────

export function Photo({ d, up, next, path, back, dir, phone, now }: StepProps) {
  const { uploadPhoto, finishPlayer } = useOnboardWrites();
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const take = async (f: File | undefined) => {
    if (!f || uploading) return;
    const p = photoProblem(f);
    if (p) {
      setErr(p);
      haptic('error');
      return;
    }
    setErr(null);
    setUploading(true);
    const r = await uploadPhoto(f);
    setUploading(false);
    if (!r.ok) {
      setErr(r.error);
      haptic('error');
      return;
    }
    up({ photoUrl: r.url });
    haptic('success');
  };

  const finish = async () => {
    if (busy || uploading) return;
    setBusy(true);
    setErr(null);
    const r = await finishPlayer({ first: d.first, last: d.last, grad: d.grad, hcp: d.hcp, city: d.city, state: d.state, avatarUrl: d.photoUrl }, d.code || null);
    if (!r.ok) {
      setBusy(false);
      setErr(r.error);
      haptic('error');
      return;
    }
    haptic('success');
    next({ joinedTeam: r.joinedTeam }, 'done');
  };

  const name = `${d.first} ${d.last}`.trim() || 'You';
  const meta = [d.grad ? classOf(d.grad, now) : null, d.hcp != null ? `${fmtHcp(d.hcp)} index` : null, [d.city.trim(), d.state].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ') || 'Player';
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title="Put a face to the name." sub="Teammates see this on the roster and in messages." onSubmit={() => void finish()}>
      <div className="ch-ox-body">
        <div className="ch-ox-photo">
          <button
            type="button"
            className="ch-ox-drop"
            data-over={over ? '' : undefined}
            onClick={() => file.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void take(e.dataTransfer.files[0]);
            }}
            aria-label={d.photoUrl ? 'Replace photo' : 'Choose a photo'}
            aria-busy={uploading || undefined}
          >
            <span className="ch-ox-drop__in">
              {d.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the player's own upload, a public avatar URL
                <img src={d.photoUrl} alt="" />
              ) : (
                <span className="ch-ox-drop__ph">
                  <Icon icon={ImagePlus} size={26} />
                  {over ? (
                    'Drop it here'
                  ) : phone ? (
                    'Tap to choose'
                  ) : (
                    <>
                      Drop a photo
                      <br />
                      or click to choose
                    </>
                  )}
                </span>
              )}
              {uploading && (
                <span className="ch-ox-drop__busy">
                  <i className="ch-ox-spin" aria-hidden="true" />
                  <span className="ch-au-sr">Uploading your photo</span>
                </span>
              )}
            </span>
            <span className="ch-ox-drop__cam" aria-hidden="true">
              <Icon icon={Camera} size={16} />
            </span>
          </button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(e) => void take(e.target.files?.[0])} />
          <div className="ch-ox-preview">
            <span className="ch-ox-preview__k">How you’ll look on the roster</span>
            <div className="ch-ox-prow">
              {d.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the player's own upload
                <img className="ch-ox-av" src={d.photoUrl} alt="" />
              ) : (
                <Avatar name={name} size={40} />
              )}
              <span style={{ minWidth: 0 }}>
                <b>{name}</b>
                <em>{meta}</em>
              </span>
              <span className="ch-ox-prow__n">{d.hcp != null ? fmtHcp(d.hcp) : '—'}</span>
            </div>
          </div>
        </div>
      </div>
      {err && (
        <div className="ch-ox-err">
          <AuthNotice tone="danger" code="CH-15013">
            {err}
          </AuthNotice>
        </div>
      )}
      <Act phone={phone} label="Finish setup" busy={busy} busyLabel="Finishing…" icon={Check} disabled={uploading}>
        {!d.photoUrl && !busy && (
          <button type="submit" className="ch-ox-link">
            Skip for now
          </button>
        )}
      </Act>
    </Q>
  );
}

// ── Finished ─────────────────────────────────────────────────────────────────

const NEXT_STEPS: Array<[typeof Flag, string, string, string]> = [
  [Flag, 'Post your first round', 'Scores feed your stats and CoachHelm', '/golf/dashboard/rounds/new'],
  [BookOpen, 'Add your class schedule', 'Flags travel conflicts early', '/golf/dashboard/classes'],
  [Bell, 'Turn on notifications', 'Pairings, tee times and team messages', '/golf/dashboard/settings'],
];

export function Done({ d, finish, dir }: StepProps) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch('/golf/dashboard');
  }, [router]);
  const first = d.first.trim() || 'there';
  if (d.joinedTeam === false) {
    return (
      <Q
        dir={dir}
        eyebrow={
          <>
            <Icon icon={CircleAlert} size={15} />
            Almost there
          </>
        }
        title={`Your profile is saved, ${first}.`}
        sub="We couldn’t add you to your coach’s team with that code. Ask your coach to re-send it, or enter the team code again."
      >
        <div className="ch-ox-act">
          <Button variant="primary" size="lg" rightIcon={ArrowRight} href="/golf/join">
            Enter a team code
          </Button>
          <Button variant="ghost" size="lg" onClick={() => finish('/golf/dashboard')}>
            Go to your dashboard
          </Button>
        </div>
      </Q>
    );
  }
  return (
    <Q
      dir={dir}
      eyebrow={
        <>
          <Icon icon={CircleCheck} size={15} />
          {d.teamName ? `Welcome to ${d.teamName}` : 'Welcome to GolfHelm'}
        </>
      }
      title={d.joinedTeam ? `You’re on the roster, ${first}.` : `You’re all set, ${first}.`}
      sub="Your member card is ready."
    >
      <div className="ch-ox-act">
        <Button variant="primary" size="lg" rightIcon={ArrowRight} feel="commit" onClick={() => finish('/golf/dashboard')}>
          Go to your dashboard
        </Button>
      </div>
      <ul className="ch-ox-list" aria-label="Next steps">
        {NEXT_STEPS.map(([ic, t, m, href]) => (
          <li key={t}>
            <span className="ch-ox-list__ic">
              <Icon icon={ic} size={15} />
            </span>
            <button type="button" className="ch-ox-nextstep" onClick={() => finish(href)}>
              <b>{t}</b>
              <em>{m}</em>
              <Icon icon={ChevronRight} size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Q>
  );
}

export function StaffDone({ d, finish, dir }: StepProps) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch('/golf/dashboard');
  }, [router]);
  const last = d.last.trim();
  return (
    <Q
      dir={dir}
      eyebrow={
        <>
          <Icon icon={CircleCheck} size={15} />
          Staff access granted
        </>
      }
      title={last ? `You’re on staff, Coach ${last}.` : 'You’re on staff.'}
      sub="Your head coach added you as an assistant coach. The roster, calendar and stats are ready for you."
    >
      <div className="ch-ox-act">
        <Button variant="primary" size="lg" rightIcon={ArrowRight} feel="commit" onClick={() => finish('/golf/dashboard')}>
          Go to the dashboard
        </Button>
      </div>
    </Q>
  );
}

// ── Request access ───────────────────────────────────────────────────────────

const WHO: Array<[RequestWho, typeof Flag, string, string]> = [
  ['coach', ClipboardList, 'Coach', 'Bring your program onto GolfHelm.'],
  ['ad', Landmark, 'Athletic director', 'Set up golf, or several teams, for your department.'],
  ['player', Flag, 'Player', 'Your coach isn’t on GolfHelm yet. We’ll reach out to them.'],
];

export function RWho({ d, up, next, back, dir }: StepProps) {
  return (
    <Q dir={dir} back={back} eyebrow="Request access" title="Who are we setting up?" sub="We set up every program by hand, so tell us a little about you first.">
      <div className="ch-ox-body">
        <div className="ch-ox-choice" data-n="3" role="radiogroup" aria-label="I am a">
          {WHO.map(([v, ic, t, s]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={d.req.who === v}
              className="ch-ox-card"
              onClick={() => {
                haptic('select');
                up({ req: { ...d.req, who: v } });
                setTimeout(() => next(), CHOICE_MS);
              }}
            >
              <span className="ch-ox-art">
                <Icon icon={ic} size={24} />
              </span>
              <div>
                <b>{t}</b>
                <p>{s}</p>
              </div>
              <Tick />
            </button>
          ))}
        </div>
      </div>
    </Q>
  );
}

function Field({ id, label, optional, error, help, children }: { id: string; label: string; optional?: boolean; error?: string | null; help?: string; children: ReactNode }) {
  return (
    <div className="ch-ox-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="ch-ox-opt"> · optional</span>}
      </label>
      <div className="ch-ox-input" data-invalid={error ? '' : undefined}>
        {children}
      </div>
      {error ? (
        <span className="ch-ox-error" id={`${id}-e`}>
          {error}
        </span>
      ) : help ? (
        <span className="ch-ox-help">{help}</span>
      ) : null}
    </div>
  );
}

export function RDetails({ d, up, next, back, dir, phone }: StepProps) {
  const { sendRequest } = useOnboardWrites();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null);
  const r = d.req;
  const set = (patch: Partial<typeof r>) => {
    up({ req: { ...r, ...patch } });
    if (err?.field && err.field in patch) setErr(null);
  };
  const submit = async () => {
    if (busy) return;
    const p = requestProblem(r);
    if (p) {
      setErr(p);
      haptic('warning');
      return;
    }
    setErr(null);
    setBusy(true);
    haptic('press');
    const res = await sendRequest(r);
    setBusy(false);
    if (!res.ok) {
      setErr({ field: null, message: res.error });
      haptic('error');
      return;
    }
    haptic('success');
    next();
  };
  const P = r.who === 'player';
  const A = r.who === 'ad';
  const fe = (f: string) => (err?.field === f ? err.message : null);
  const inv = (f: string) => (err?.field === f ? { 'aria-invalid': true as const, 'aria-describedby': `ch-ox-r${f}-e` } : {});
  return (
    <Q
      dir={dir}
      back={back}
      eyebrow={
        <>
          <Icon icon={P ? Flag : A ? Landmark : ClipboardList} size={14} />
          {r.who ? REQUEST_TITLE[r.who] : 'Request access'}
        </>
      }
      title={P ? 'Tell us about you and your coach.' : A ? 'Tell us about your department.' : 'Tell us about your program.'}
      sub="We’ll reply by email with next steps."
      onSubmit={() => void submit()}
    >
      <div className="ch-ox-body">
        <div className="ch-ox-fields">
          <div className="ch-ox-2">
            <Field id="ch-ox-rfirst" label="First name" error={fe('first')}>
              <input id="ch-ox-rfirst" value={r.first} onChange={(e) => set({ first: e.target.value.slice(0, 60) })} autoComplete="given-name" {...inv('first')} />
            </Field>
            <Field id="ch-ox-rlast" label="Last name" error={fe('last')}>
              <input id="ch-ox-rlast" value={r.last} onChange={(e) => set({ last: e.target.value.slice(0, 60) })} autoComplete="family-name" {...inv('last')} />
            </Field>
          </div>
          <Field id="ch-ox-rschool" label={A ? 'School or athletic department' : 'School or program'} error={fe('school')}>
            <input id="ch-ox-rschool" value={r.school} onChange={(e) => set({ school: e.target.value.slice(0, 160) })} autoComplete="organization" {...inv('school')} />
          </Field>
          {P && (
            <Field id="ch-ox-rcoach" label="Your coach’s name" optional>
              <input id="ch-ox-rcoach" value={r.coach} onChange={(e) => set({ coach: e.target.value.slice(0, 120) })} />
            </Field>
          )}
          <Field id="ch-ox-remail" label="Email" error={fe('email')} help={P ? undefined : 'Your school email helps us verify you faster.'}>
            <input
              id="ch-ox-remail"
              type="email"
              value={r.email}
              onChange={(e) => set({ email: e.target.value })}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@school.edu"
              {...inv('email')}
            />
          </Field>
          <Field id="ch-ox-rnote" label="Anything we should know?" optional>
            <textarea id="ch-ox-rnote" rows={3} value={r.note} onChange={(e) => set({ note: e.target.value.slice(0, 1500) })} placeholder={A ? 'Which sports, and how many teams' : 'Roster size, season start, or what you’d use first'} />
          </Field>
        </div>
      </div>
      {err && !err.field && (
        <div className="ch-ox-err">
          <AuthNotice tone="danger" code="CH-15014">
            {err.message}
          </AuthNotice>
        </div>
      )}
      <Act phone={phone} label="Send request" busy={busy} busyLabel="Sending…" icon={Send} />
    </Q>
  );
}

export function Sent({ d, dir }: StepProps) {
  const r = d.req;
  return (
    <Q
      dir={dir}
      eyebrow={
        <>
          <Icon icon={CircleCheck} size={15} />
          Request received
        </>
      }
      title={`Thanks, ${r.first.trim() || 'there'}. We’ve got it.`}
      sub={
        <>
          We’ll email <b>{r.email.trim() || 'you'}</b> when your access is ready.
        </>
      }
    >
      <div className="ch-ox-sum">
        {(
          [
            ['Name', `${r.first} ${r.last}`.trim()],
            ['Title', r.who ? REQUEST_TITLE[r.who] : ''],
            ['Program', r.school.trim()],
            ['Email', r.email.trim()],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            {v || '—'}
          </div>
        ))}
      </div>
      <div className="ch-ox-act">
        <Button size="lg" href="/golf/login">
          Back to sign in
        </Button>
      </div>
    </Q>
  );
}

export const STEPS: Record<OnboardStep, (p: StepProps) => ReactNode> = {
  intro: Intro,
  code: Code,
  name: Name,
  grad: Grad,
  account: Account,
  game: Game,
  photo: Photo,
  done: Done,
  staffdone: StaffDone,
  rwho: RWho,
  rdetails: RDetails,
  sent: Sent,
};

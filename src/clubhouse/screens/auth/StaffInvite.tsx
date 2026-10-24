'use client';

import { useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { PreviewStaffInviteResult } from '@/app/golf/actions/teams';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { accountErrorFor } from '../onboard/logic';
import { AuthNotice } from './AuthNotice';
import { OPENING_PUSH_MS } from './auth-motion';
import { GateFrame, useGateView } from './GateFrame';
import { GateChecking, GateInput, GateKey, PasswordInput, PasswordRules } from './gate-fields';
import { gateWrites, type GateWrites } from './gate-writes';
import { roleLabel, roleLine, staffProblem, wrongAccount, type StaffProblem } from './staff-state';

type Stage = 'checking' | 'accept' | 'create' | 'joined';

/** The preview draws a chosen state without a round trip. */
export interface StaffPreview {
  stage?: Stage;
  /** Someone is signed in (the one-button accept) and this is who. */
  email?: string;
  failure?: string;
  problem?: StaffProblem;
}

/**
 * /golf/staff/join/[token] in Clubhouse: a head coach's invitation to coach a team. Today's screen
 * (`staff-join-client.tsx`) with its two paths and the same calls: signed in, one Accept (`redeemStaffInvite`); signed
 * out, make the account here (`signupWithStaffInviteAction`, which only a valid invitation can use, because self-serve
 * sign up is a player's gate) and then redeem. The token, not the page, is the authority: it names the program, the team
 * and the role, and cannot be traded up. An invitation that is not valid says so and offers sign in.
 */
export function StaffInvite({ token, preview, writes = gateWrites, initial, navigate }: { token: string; preview: PreviewStaffInviteResult; writes?: GateWrites; initial?: StaffPreview; navigate?: (href: string) => void }) {
  const router = useRouter();
  const reduced = useChReducedMotion();
  const first: Stage = preview.valid ? (initial?.stage ?? 'checking') : 'accept';
  const { view, dir, moved, go, stageRef } = useGateView<Stage>(first);
  const [signedIn, setSignedIn] = useState<string | null>(initial?.email ?? null);
  const [leaving, setLeaving] = useState(false);
  // Why the accept was refused: kept here because a sign-up that made the account but not the staff row lands on Accept with it.
  const [failure, setFailure] = useState<string | null>(initial?.failure ?? null);
  const returnTo = `/golf/staff/join/${token}`;
  const program = preview.organizationName ?? 'this program';
  const to = (href: string) => (navigate ? navigate(href) : router.push(href));

  // Who is here: signed in is one button, signed out is an account. Read once, by the browser's own session.
  useEffect(() => {
    if (!preview.valid || initial?.stage) return;
    let live = true;
    void writes.signedIn().then((who) => {
      if (!live) return;
      setSignedIn(who ? (who.email ?? '') : null);
      go(who ? 'accept' : 'create');
    });
    return () => {
      live = false;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same ordering the sign-up form uses: refresh so server components re-read the new session and staff row before
  // the dashboard, or it renders against a cache that predates the row just written.
  const finish = () => {
    haptic('success');
    go('joined');
    router.refresh();
    window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => to('/golf/dashboard'), reduced ? 100 : Math.max(100, OPENING_PUSH_MS));
    }, reduced ? 600 : 1400);
  };

  const label = preview.valid ? `Staff invitation to ${program}` : 'This invitation isn’t valid';
  return (
    <GateFrame
      label={label}
      say={{ title: preview.valid ? program : 'GolfHelm for college golf.', line: preview.valid ? `Invited as ${roleLabel(preview.role).toLowerCase()}` : 'Rounds, stats, travel and qualifiers in one place' }}
      back={{ href: '/golf/login', label: 'Sign in' }}
      phase={leaving ? 'opening' : 'login'}
      viewKey={preview.valid ? view : 'invalid'}
      dir={dir}
      stageRef={stageRef}
    >
      {!preview.valid ? (
        <Invalid message={preview.error} />
      ) : view === 'checking' ? (
        <GateChecking title={`Join ${program}`} line="Checking your session…" code="CH-15433" />
      ) : view === 'accept' ? (
        <Accept
          preview={preview}
          program={program}
          email={signedIn}
          token={token}
          writes={writes}
          returnTo={returnTo}
          focusOnMount={moved}
          failure={failure}
          setFailure={setFailure}
          onJoined={finish}
        />
      ) : view === 'create' ? (
        <Create
          preview={preview}
          program={program}
          token={token}
          writes={writes}
          returnTo={returnTo}
          focusOnMount={moved}
          problem={initial?.problem}
          onJoined={finish}
          onSignedUp={(email, reason) => {
            // The account exists but the staff row did not land: the one-button accept, with the reason, to try again.
            setSignedIn(email);
            setFailure(reason);
            go('accept');
          }}
        />
      ) : (
        <Joined program={program} role={preview.role} focusOnMount={moved} onContinue={() => to('/golf/dashboard')} />
      )}
    </GateFrame>
  );
}

function Invalid({ message }: { message?: string }) {
  return (
    <div className="ch-au-form" role="alert" data-ch-code="CH-15940">
      <h1>This invitation isn’t valid</h1>
      <p className="ch-au-sub">{message ?? 'That invitation link is not valid.'}</p>
      {!/head coach/i.test(message ?? '') && <p className="ch-au-body">Ask your head coach to send a new one.</p>}
      <div className="ch-au-submit">
        <Button href="/golf/login" variant="primary" size="lg">
          Go to sign in
        </Button>
      </div>
    </div>
  );
}

/** What is being offered: the program and team, and the role with what it allows. */
function Offer({ preview, program, compact = false }: { preview: PreviewStaffInviteResult; program: string; compact?: boolean }) {
  // The account form is long on a phone: there the offer is one line, the role and where.
  if (compact) {
    return (
      <div className="ch-au-plate">
        <div className="ch-au-plate__row">
          <Avatar name={program} size="lg" />
          <div>
            <b>{roleLabel(preview.role)}</b>
            <span className="ch-au-plate__s">{[program, preview.teamName].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ch-au-plate">
      <div className="ch-au-plate__row">
        <Avatar name={program} size="lg" />
        <div>
          <span className="ch-au-plate__k">{preview.teamName ? 'Program and team' : 'Program'}</span>
          <b>{program}</b>
          {preview.teamName && <span className="ch-au-plate__s">{preview.teamName}</span>}
        </div>
      </div>
      <div className="ch-au-plate__row">
        <div>
          <span className="ch-au-plate__k">Your role</span>
          <b>{roleLabel(preview.role)}</b>
          <span className="ch-au-plate__s">{roleLine(preview.role)}</span>
        </div>
      </div>
    </div>
  );
}

function Accept({ preview, program, email, token, writes, returnTo, focusOnMount, failure, setFailure, onJoined }: { preview: PreviewStaffInviteResult; program: string; email: string | null; token: string; writes: GateWrites; returnTo: string; focusOnMount: boolean; failure: string | null; setFailure: (f: string | null) => void; onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  async function accept() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    haptic('press');
    try {
      const result = await writes.redeemStaff(token);
      if (!result.success) {
        haptic(wrongAccount(result.error) ? 'warning' : 'error');
        setFailure(result.error ?? 'Could not join the team. Please try again.');
        inFlight.current = false;
        setBusy(false);
        return;
      }
      onJoined();
    } catch {
      haptic('error');
      setFailure('Couldn’t join the team. Try again.');
      inFlight.current = false;
      setBusy(false);
    }
  }

  const wrong = wrongAccount(failure);
  const switchAccount = () => void writes.switchAccount(returnTo);
  return (
    <div className="ch-au-form" data-ch-code="CH-15941">
      <h1 ref={titleRef} tabIndex={-1}>
        Join {program}
      </h1>
      <p className="ch-au-sub">You’ve been invited to coach. Accept to get access.</p>
      <Offer preview={preview} program={program} />
      {email !== null && (
        <p className="ch-au-body ch-au-whoami">
          Signed in as <b className="ch-au-who">{email || 'your account'}</b>.{' '}
          <button type="button" className="ch-au-linkbtn" onClick={switchAccount} data-ch-code="CH-15943">
            Not you?
          </button>
        </p>
      )}
      {failure && (
        <div className="ch-au-err" key={failure}>
          <AuthNotice
            tone={wrong ? 'warning' : 'danger'}
            code={wrong ? 'CH-15944' : 'CH-15034'}
            action={
              wrong ? (
                <Button size="sm" onClick={switchAccount}>
                  Switch account
                </Button>
              ) : undefined
            }
          >
            {failure}
          </AuthNotice>
        </div>
      )}
      <GateKey idle="Accept invitation" working="Joining…" busy={busy} type="button" onClick={() => void accept()} code="CH-15433" />
    </div>
  );
}

function Create({ preview, program, token, writes, returnTo, focusOnMount, problem: seeded, onJoined, onSignedUp }: { preview: PreviewStaffInviteResult; program: string; token: string; writes: GateWrites; returnTo: string; focusOnMount: boolean; problem?: StaffProblem; onJoined: () => void; onSignedUp: (email: string, reason: string) => void }) {
  const ids = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [problem, setProblem] = useState<{ field: 'name' | 'email' | 'password' | null; message: string; code: string; signIn?: boolean } | null>(seeded ?? null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) refs.name.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, focusOnMount]);
  useEffect(() => {
    if (nonce > 0 && problem?.field) refs[problem.field].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const refuse = (p: NonNullable<typeof problem>, kind: 'warning' | 'error') => {
    haptic(kind);
    setProblem(p);
    setNonce((n) => n + 1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const found = staffProblem({ name, email, password });
    if (found) return refuse(found, 'warning');
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    haptic('press');
    try {
      const signup = await writes.signUpStaff(token, email.trim(), password, name.trim());
      if (!signup.success) {
        const e = accountErrorFor(signup.error ?? 'Could not create your account.');
        inFlight.current = false;
        setBusy(false);
        // CH-15034: the server's refusal, on the field it names when it names one.
        return refuse({ field: e.field === 'pw' ? 'password' : e.field, message: e.message, code: 'CH-15034', signIn: e.signIn }, 'error');
      }
      const redeemed = await writes.redeemStaff(token, name.trim());
      if (!redeemed.success) {
        // The account exists and this browser is signed in as it: carry on at the one-button accept, with the reason.
        haptic('error');
        onSignedUp(email.trim(), redeemed.error ?? 'Could not join the team. Please try again.');
        return;
      }
      onJoined();
    } catch {
      inFlight.current = false;
      setBusy(false);
      refuse({ field: null, message: 'Couldn’t join the team. Try again.', code: 'CH-15034' }, 'error');
    }
  }

  const shake = nonce > 0 && problem?.field ? (nonce % 2 ? 'a' : 'b') : undefined;
  const clear = () => problem && setProblem(null);
  return (
    <form className="ch-au-form" onSubmit={submit} noValidate aria-label="Create your account and join" data-ch-code="CH-15945">
      <h1>Join {program}</h1>
      <p className="ch-au-sub">You’ve been invited to coach. Make your account to get access.</p>
      <Offer preview={preview} program={program} compact />
      <div className="ch-au-fields" data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
        <GateInput id={`${ids}-name`} label="Full name" inputRef={refs.name} autoComplete="name" autoCapitalize="words" enterKeyHint="next" invalid={problem?.field === 'name'} aria-describedby={problem ? `${ids}-err` : undefined} value={name} onChange={(e) => (setName(e.target.value), clear())} />
        <GateInput id={`${ids}-email`} label="Email" inputRef={refs.email} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="you@school.edu" invalid={problem?.field === 'email'} aria-describedby={problem ? `${ids}-err` : undefined} value={email} onChange={(e) => (setEmail(e.target.value), clear())} />
        <PasswordInput id={`${ids}-pw`} label="Password" inputRef={refs.password} autoComplete="new-password" enterKeyHint="go" show={show} onToggle={() => setShow((v) => !v)} invalid={problem?.field === 'password'} aria-describedby={`${ids}-rules${problem ? ` ${ids}-err` : ''}`} value={password} onChange={(e) => (setPassword(e.target.value), clear())} />
        <PasswordRules id={`${ids}-rules`} password={password} />
      </div>
      {problem && (
        <div className="ch-au-err" key={nonce}>
          <AuthNotice
            tone="danger"
            id={`${ids}-err`}
            code={problem.code}
            action={
              problem.signIn ? (
                <Button size="sm" href={`/golf/login?returnTo=${encodeURIComponent(returnTo)}`}>
                  Go to sign in
                </Button>
              ) : undefined
            }
          >
            {problem.message}
          </AuthNotice>
        </div>
      )}
      <GateKey idle="Create account and join" working="Creating your account…" busy={busy} code="CH-15433" />
      <p className="ch-au-alt">
        Already have an account? <Link href={`/golf/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link> and open this link again.
      </p>
    </form>
  );
}

function Joined({ program, role, focusOnMount, onContinue }: { program: string; role: PreviewStaffInviteResult['role']; focusOnMount: boolean; onContinue: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  return (
    <div className="ch-au-form ch-au-sent" role="status" data-ch-code="CH-15946">
      <h1 ref={titleRef} tabIndex={-1}>
        You’re on the staff
      </h1>
      <p className="ch-au-sub">
        {roleLabel(role)} at <b className="ch-au-who">{program}</b>.
      </p>
      <p className="ch-au-body">The team is in your dashboard now.</p>
      <GateKey idle="Go to your dashboard" working="Opening…" type="button" onClick={onContinue} />
    </div>
  );
}

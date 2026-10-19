'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { enterDemo } from '@/app/golf/actions/demo-access';
import { DEMO_COACHHELM_LANDING_PATH, DEMO_LANDING_PATH } from '@/lib/demo/config';
import { probeSignedIn } from '@/lib/demo/gate-probe';
import { logError } from '@/lib/error-logging';
import { createClient } from '@/lib/supabase/client';
import { haptic } from '../../lib/haptics';
import { AuthNotice } from './AuthNotice';
import { demoProblem, DEMO_EXPIRED_NOTICE, refEmail, type DemoField } from './demo-state';
import { GateFrame, useGateView } from './GateFrame';
import { GateChecking, GateInput, GateKey } from './gate-fields';
import { useQueryParam } from './use-query-param';

export interface DemoWrites {
  enter: typeof enterDemo;
  /** Whether someone is already signed in on this browser. */
  signedIn: () => Promise<boolean>;
}

const defaultWrites: DemoWrites = {
  enter: enterDemo,
  async signedIn() {
    // A hard deadline, and any failure reads as signed out, so a stale cookie can never leave this on "checking".
    return (await probeSignedIn(createClient())) !== null;
  },
};

type Stage = 'checking' | 'signedin' | 'form';

/**
 * /golf/demo in Clubhouse: three questions and a live team to look around, no password. Today's page, with the same
 * `enterDemo` (which signs into the shared demo account and redirects to where the demo lands) and the same ways in:
 * `?ref=` fills the address a demo-invite email was sent to, `?destination=coachhelm` lands on CoachHelm, and
 * `?message=demo_session_expired` explains a timed-out session. Someone already signed in goes straight on.
 */
export function DemoEntry({ writes = defaultWrites, initial, navigate }: { writes?: DemoWrites; initial?: { stage?: Stage; email?: string; error?: string; problem?: DemoField; expired?: boolean; coachhelm?: boolean }; navigate?: (href: string) => void } = {}) {
  const router = useRouter();
  const ids = useId();
  const { view, dir, go, stageRef } = useGateView<Stage>(initial?.stage ?? 'checking');
  const expiredParam = useQueryParam('message') === 'demo_session_expired';
  const refParam = useQueryParam('ref');
  const coachhelm = (useQueryParam('destination') === 'coachhelm') || !!initial?.coachhelm;
  const expired = expiredParam || !!initial?.expired;
  const landing = coachhelm ? DEMO_COACHHELM_LANDING_PATH : DEMO_LANDING_PATH;
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [school, setSchool] = useState('');
  const [problem, setProblem] = useState<{ field: DemoField | null; message: string; server: boolean } | null>(
    initial?.problem ? { field: initial.problem, message: 'Name is required.', server: false } : initial?.error ? { field: null, message: initial.error, server: true } : null,
  );
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), school: useRef<HTMLInputElement>(null) };

  // The invite's address, once the URL is read (after hydration), unless something is already typed.
  useEffect(() => {
    const e = refEmail(refParam);
    if (e) setEmail((cur) => cur || e);
  }, [refParam]);

  useEffect(() => {
    if (initial?.stage) return;
    let live = true;
    void writes.signedIn().then((yes) => live && go(yes ? 'signedin' : 'form'));
    return () => {
      live = false;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nonce > 0 && problem?.field) refs[problem.field].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const refuse = (p: NonNullable<typeof problem>) => {
    haptic(p.server ? 'error' : 'warning');
    setProblem(p);
    setNonce((n) => n + 1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const found = demoProblem({ name, email, school });
    if (found) return refuse({ ...found, server: false });
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    haptic('press');
    try {
      // `enterDemo` redirects on success (the navigation is the answer); it returns only when it refuses.
      const result = await writes.enter({ name, email, school, ...(coachhelm ? { destination: 'coachhelm' as const } : {}) });
      if (result && !result.success) {
        inFlight.current = false;
        setBusy(false);
        refuse({ field: null, message: result.error, server: true });
        return;
      }
      haptic('success');
    } catch (err) {
      // A redirect arrives as a thrown NEXT_REDIRECT only where the framework does not handle it; anything else is a failure.
      if (err instanceof Error && /NEXT_REDIRECT/.test(err.message)) return;
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'ClubhouseDemoEntry', action: 'enterDemo', sport: 'golf' });
      inFlight.current = false;
      setBusy(false);
      refuse({ field: null, message: 'Something went wrong. Please try again.', server: true });
    }
  }

  const shake = nonce > 0 && problem?.field ? (nonce % 2 ? 'a' : 'b') : undefined;
  const clear = () => problem && setProblem(null);
  const errId = `${ids}-err`;
  return (
    <GateFrame
      label="Try the live demo"
      say={{ title: 'Step inside a live team.', line: 'A full roster, real strokes-gained stats and CoachHelm' }}
      back={{ href: '/', label: 'Home', hideInApp: true }}
      foot={
        <span>
          Already have an account? <Link href="/golf/login">Sign in</Link>
        </span>
      }
      viewKey={view}
      dir={dir}
      stageRef={stageRef}
    >
      {view === 'checking' ? (
        <GateChecking title="Try the live demo" line="Checking your sign-in…" rows={3} code="CH-15435" />
      ) : view === 'signedin' ? (
        <div className="ch-au-form" data-ch-code="CH-15971">
          <h1>Try the live demo</h1>
          <p className="ch-au-sub">You’re already signed in. Continue where you left off.</p>
          <GateKey idle="Continue to dashboard" working="Opening…" type="button" onClick={() => (navigate ? navigate(landing) : router.push(landing))} />
        </div>
      ) : (
        <form className="ch-au-form" onSubmit={submit} noValidate aria-label="Demo access form" data-ch-code="CH-15970">
          <h1>Try the live demo</h1>
          <p className="ch-au-sub">Tell us a bit about yourself to get instant access.</p>
          {expired && (
            <div className="ch-au-notice-top">
              <AuthNotice tone="info" code="CH-15972">
                {DEMO_EXPIRED_NOTICE}
              </AuthNotice>
            </div>
          )}
          <div className="ch-au-fields" data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
            <GateInput id={`${ids}-name`} label="Your name" inputRef={refs.name} autoComplete="name" autoCapitalize="words" enterKeyHint="next" placeholder="Coach Alex Rivera" invalid={problem?.field === 'name'} aria-describedby={problem ? errId : undefined} value={name} onChange={(e) => (setName(e.target.value), clear())} />
            <GateInput id={`${ids}-email`} label="Work email" inputRef={refs.email} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="coach@university.edu" invalid={problem?.field === 'email'} aria-describedby={problem ? errId : undefined} value={email} onChange={(e) => (setEmail(e.target.value), clear())} />
            <GateInput id={`${ids}-school`} label="School / Program" inputRef={refs.school} autoComplete="organization" autoCapitalize="words" enterKeyHint="go" placeholder="State University Golf" invalid={problem?.field === 'school'} aria-describedby={problem ? errId : undefined} value={school} onChange={(e) => (setSchool(e.target.value), clear())} />
          </div>
          {problem && (
            <div className="ch-au-err" key={nonce}>
              <AuthNotice tone="danger" id={errId} code={problem.server ? 'CH-15036' : 'CH-15143'}>
                {problem.message}
              </AuthNotice>
            </div>
          )}
          <GateKey idle="Enter the live demo" working="Setting up your demo…" busy={busy} code="CH-15435" />
          <p className="ch-au-body ch-au-fine">You’ll be signed into a shared demo account instantly. No password needed.</p>
        </form>
      )}
    </GateFrame>
  );
}

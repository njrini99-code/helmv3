'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Brain, ClipboardList, Clock, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { BASEBALL_DEMO_LANDING_PATH } from '@/lib/demo/baseball-config';
import {
  enterBaseballDemo,
  isBaseballDemoAvailable,
  isBaseballDemoSession,
} from '@/app/baseball/actions/demo-access';
import { probeSignedIn, raceWithTimeout } from '@/lib/demo/gate-probe';
import {
  AuthBezel,
  AuthCard,
  AuthFooterLinks,
  AuthPendingDots,
  BaseballAuthShell,
} from '@/components/auth/baseball-auth-shell';
import { EditorsLetter, InkNotice } from '@/components/baseball/living-annual';

// ---------------------------------------------------------------------------
// Value-prop pills shown below the headline (the "why bother" scan).
// ---------------------------------------------------------------------------

const VALUE_PROPS = [
  { icon: Users, text: 'Full live roster' },
  { icon: ClipboardList, text: 'Practice & lifting plans' },
  { icon: Brain, text: 'CoachHelm AI insights' },
] as const;

// ---------------------------------------------------------------------------
// Inline field-level validation (mirrors the server action so errors are fast).
// ---------------------------------------------------------------------------

function validateName(v: string): string | undefined {
  if (!v.trim()) return 'Name is required.';
  if (v.trim().length > 120) return 'Must be 120 characters or fewer.';
  return undefined;
}

function validateEmail(v: string): string | undefined {
  if (!v.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
  if (v.trim().length > 254) return 'Email is too long.';
  return undefined;
}

function validateProgram(v: string): string | undefined {
  if (!v.trim()) return 'Program / Organization is required.';
  if (v.trim().length > 160) return 'Must be 160 characters or fewer.';
  return undefined;
}

// ---------------------------------------------------------------------------
// Demo gate form (interactive island)
// ---------------------------------------------------------------------------

function DemoGateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('message') === 'demo_session_expired';

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [program, setProgram] = useState('');

  // Touched tracks blur so inline errors only appear after interaction.
  const [touched, setTouched] = useState({ name: false, email: false, program: false });

  // Submission state
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Already-signed-in shortcut — server-verified against the actual demo
  // coach identity (not a bare client-side getUser() truthiness check), so a
  // real coach/player who happens to have a session open elsewhere in this
  // browser sees the normal gate form instead of a misleading "continue".
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Kill-switch — checked up front so a disabled demo shows a clear message
  // instead of only failing after the visitor fills out the whole form.
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    async function checkAuth() {
      // probeSignedIn races supabase.auth.getUser() against a hard 4s
      // deadline and treats ANY failure — timeout, thrown error, or a
      // refresh-token error surfaced through getUser()'s own `error` field —
      // as signed out. Without this, a stale/expired httpOnly Supabase
      // cookie can leave getUser()'s internal refresh hanging forever, and
      // "Checking sign-in status" never resolves (#918).
      const user = await probeSignedIn(supabase);
      if (!active || !user) return;
      try {
        // The client can't detect the shared demo account itself (its email
        // is a server-only secret) — verify it server-side. Same hard
        // timeout applied here: a stuck server action must not hang this
        // check either.
        const { isDemo } = await raceWithTimeout(isBaseballDemoSession());
        if (active && isDemo) setIsDemoSession(true);
      } catch {
        // Timeout or thrown error — fall through to the form below.
      }
    }
    void checkAuth().finally(() => {
      if (active) setCheckingAuth(false);
    });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function checkAvailability() {
      try {
        // Same hard-timeout guard as the auth check above — a stuck
        // kill-switch read must not leave the spinner up forever. Fails
        // open (demo treated as enabled) so a slow read shows the form
        // instead of a permanent spinner; the real kill-switch is still
        // enforced server-side on submit.
        const { enabled } = await raceWithTimeout(isBaseballDemoAvailable());
        if (active) setDemoEnabled(enabled);
      } catch {
        if (active) setDemoEnabled(true);
      } finally {
        if (active) setCheckingAvailability(false);
      }
    }
    void checkAvailability();
    return () => { active = false; };
  }, []);

  const nameError = touched.name ? validateName(name) : undefined;
  const emailError = touched.email ? validateEmail(email) : undefined;
  const programError = touched.program ? validateProgram(program) : undefined;

  const isFormValid =
    !validateName(name) && !validateEmail(email) && !validateProgram(program);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, program: true });
    if (!isFormValid) return;

    if (!demoEnabled) {
      setServerError('The demo is not available right now. Please check back later.');
      return;
    }

    setIsLoading(true);
    setServerError(null);
    void triggerHaptic('light');

    try {
      // enterBaseballDemo either redirects (success) or returns an error result.
      const result = await enterBaseballDemo({ name, email, program });
      if (!result.success) {
        void triggerHaptic('error');
        setServerError(result.error);
        setIsLoading(false);
      }
    } catch {
      // next/navigation redirect() throws a special NEXT_REDIRECT — treat
      // anything else as an unexpected failure.
      setServerError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <BaseballAuthShell
      skipTargetId="demo-form"
      skipLabel="Skip to demo form"
      sceneIdSuffix="demo"
      ink="pursuit"
      welcomeLine="Step into the Yard."
      footer={
        <AuthFooterLinks
          switchLabel="Already have an account?"
          switchHref="/baseball/login"
          switchCta="Sign in"
        />
      }
    >
      {/* Page-specific headline + explanation + value pills, sitting under
          the shared BaseballHelm masthead. */}
      <div className="-mt-2 mb-6 flex flex-col items-center text-center">
        <h2 className="font-annual text-h2 font-semibold tracking-tight text-text-primary">
          Step inside a live program
        </h2>
        <p className="mt-2 max-w-[360px] text-sm leading-relaxed text-warm-600 sm:text-base">
          Explore a fully-populated BaseballHelm team — live roster, practice
          &amp; lifting plans, and CoachHelm AI insights. No setup, no credit card.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {VALUE_PROPS.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex items-center gap-1.5 rounded-full border border-pursuit/25 bg-pursuit/10 px-3 py-1.5 text-xs font-medium text-pursuit-deep"
            >
              <Icon className="h-3.5 w-3.5 text-pursuit" aria-hidden />
              {text}
            </span>
          ))}
        </div>
      </div>

      {!checkingAuth && !checkingAvailability && !isDemoSession && !demoEnabled ? (
        // EditorsLetter is already a complete Paper surface — sits directly
        // in the outer bezel so we never nest PaperCard inside PaperCard.
        <AuthBezel ariaLabel="Demo access form" role="region">
          <EditorsLetter
            ink="pursuit"
            title="The live demo is resting"
            body="It's temporarily unavailable — check back shortly, or sign in if you already have an account."
            action={
              <Link
                href="/baseball/login"
                className="inline-flex min-h-[44px] items-center rounded-lg text-sm font-semibold text-pursuit underline underline-offset-2 hover:text-pursuit-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
              >
                Sign in instead →
              </Link>
            }
          />
        </AuthBezel>
      ) : (
      <AuthCard ariaLabel="Demo access form" role="region" registrationTick>
        <div className="mb-6 text-center">
          <h3 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">
            Try the live demo
          </h3>
          <p className="mt-1 text-sm text-warm-500">
            Tell us a bit about yourself to get instant access.
          </p>
        </div>

        {/* Friendly notice when bounced here after a demo session timed out (#918) */}
        {sessionExpired && (
          <InkNotice ink="team" icon={Clock} role="status" className="mb-4">
            Your demo session timed out. Enter your info again to jump right back in.
          </InkNotice>
        )}

        {checkingAuth || checkingAvailability ? (
          <div className="flex justify-center py-6">
            <AuthPendingDots label="Checking sign-in status" ink="pursuit" />
          </div>
        ) : isDemoSession ? (
          <div className="animate-fade-in space-y-3">
            <div className="rounded-xl border border-pursuit/25 bg-pursuit/10 px-4 py-3 text-center text-sm text-pursuit">
              You&apos;re already in the live demo — continue where you left off.
            </div>
            <Button
              variant="primary"
              onClick={() => router.push(BASEBALL_DEMO_LANDING_PATH)}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
              className="min-h-[50px] w-full py-3 text-body font-semibold tracking-[-0.01em]"
            >
              Continue to dashboard
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-label="Demo access form">
            {serverError && <InkNotice>{serverError}</InkNotice>}

            <Input
              id="demo-name"
              name="name"
              label="Your name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setServerError(null); }}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="Coach Alex Rivera"
              required
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              error={nameError}
            />

            <Input
              id="demo-email"
              name="email"
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setServerError(null); }}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="coach@university.edu"
              required
              autoComplete="email"
              enterKeyHint="next"
              error={emailError}
            />

            <Input
              id="demo-program"
              name="program"
              label="Program / Organization"
              type="text"
              value={program}
              onChange={(e) => { setProgram(e.target.value); setServerError(null); }}
              onBlur={() => setTouched((t) => ({ ...t, program: true }))}
              placeholder="State University Baseball"
              required
              autoCapitalize="words"
              enterKeyHint="go"
              error={programError}
            />

            <Button
              variant="primary"
              type="submit"
              isLoading={isLoading}
              rightIcon={!isLoading ? <ArrowRight className="h-4 w-4" aria-hidden /> : undefined}
              className="min-h-[50px] w-full bg-pursuit py-3 text-body font-semibold tracking-[-0.01em] shadow-pursuit/25 hover:bg-pursuit-deep"
            >
              {isLoading ? 'Setting up your demo…' : 'Enter the live demo'}
            </Button>

            <p className="pt-1 text-center text-xs leading-relaxed text-warm-500">
              You&apos;ll get instant, read-only access to a live demo
              program. No password, no setup — and nothing you do affects
              other visitors.
            </p>
          </form>
        )}
      </AuthCard>
      )}
    </BaseballAuthShell>
  );
}

// ---------------------------------------------------------------------------
// Page export (Suspense boundary for parity with the login route).
// ---------------------------------------------------------------------------

export default function BaseballDemoGatePage() {
  return (
    <Suspense
      fallback={
        <div className="baseball-auth-field flex min-h-[100dvh] items-center justify-center">
          <AuthPendingDots label="Loading demo" ink="pursuit" />
        </div>
      }
    >
      <DemoGateContent />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  completeCoachOnboarding,
  signupAndCompleteCoachOnboarding,
} from '@/app/baseball/actions/onboarding';
import { setLiftingMode } from '@/app/lifting/actions/onboarding';
import type { LiftingMode } from '@/app/lifting/actions/onboarding';
import { validatePassword } from '@/lib/auth/password-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconUser,
  IconBuilding,
  IconGraduationCap,
  IconSchool,
  IconBaseball,
} from '@/components/icons';
import { Eyebrow, Reveal, CommitSeal, LiveDot, DUR, EASE_GLIDE, EASE_PRESS } from '@/components/baseball/living-annual';
import { EntryField, type SceneStage } from '@/components/baseball/scenes/EntryField';
import { resolveSceneVariant, type SceneVariant } from '@/lib/entry/greeting';
import { flFraunces } from '@/components/marketing/first-light/fonts';
import { EditorialFrame } from './_components/EditorialFrame';
import { StepProgress } from './_components/StepProgress';
import { OptionCard } from './_components/OptionCard';
import '@/components/marketing/first-light/first-light.css';
import './onboarding-entry.css';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'type' | 'program' | 'account' | 'lifting' | 'complete';

// Step order + eyebrow labels for <StepProgress> — the editorial "numbered
// eyebrow + thin progress rule" replacement for a generic wizard dot-bar.
// Two sequences because an already-authenticated coach skips 'account'.
const STEP_SEQUENCE_FULL: Step[] = ['program', 'account', 'lifting', 'complete'];
const STEP_SEQUENCE_AUTH: Step[] = ['program', 'lifting', 'complete'];
const STEP_LABELS: Record<Step, string> = {
  type: 'COACH TYPE',
  program: 'PROGRAM',
  account: 'ACCOUNT',
  lifting: 'LIFTING',
  complete: 'DONE',
};

const COACH_TYPES = [
  { value: 'college' as const, label: 'College Coach', desc: 'NCAA D1, D2, D3, or NAIA program', Icon: IconBuilding },
  { value: 'juco' as const, label: 'JUCO Coach', desc: 'Junior college / community college', Icon: IconGraduationCap },
  { value: 'high_school' as const, label: 'High School Coach', desc: 'High school varsity or JV program', Icon: IconSchool },
  { value: 'showcase' as const, label: 'Showcase Coach', desc: 'Travel ball or showcase organization', Icon: IconBaseball },
] as const;

type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA'];

const STORAGE_KEY = 'baseballhelm_coach_onboarding';

// ─── Motion (local — the Living Annual "page turn": ink settles up/down,
// never a horizontal slide-carousel; EASE_GLIDE/EASE_PRESS from the kit) ────

const STEP_TRANSITION = {
  initial: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 14 : -14,
    filter: 'blur(2px)',
  }),
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: DUR.ink, ease: EASE_GLIDE },
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -10 : 10,
    filter: 'blur(2px)',
    transition: { duration: 0.18, ease: EASE_PRESS },
  }),
};

/** ~2.5% fractal-noise page grain (inline data-uri, no network) — mirrors PaperCard/EditorialFrame. */
const PAGE_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// ─── The onboarding arc: "the field gets chalked" ──────────────────────────
// docs/baseball/ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT stage contract (0–4):
// 0 bare morning air -> 1 first foul line -> 2 second foul line -> 3
// base-path arc -> 4 batter's boxes + bloom warms. This wizard has 5 steps
// (type/program/account/lifting/complete) mapped 1:1 across those 5 stages.
// An already-authenticated coach skips 'account' (goes program -> lifting
// directly), so the field jumps from stage 1 to stage 3 in one crossfade
// for that lane — both foul lines + the base-path arc draw in together
// rather than in three separate beats. Documented in the PR; still one
// continuous 1.2s stroke-draw/crossfade, never a hard swap.
const STEP_SCENE_STAGE: Record<Step, SceneStage> = {
  type: 0,
  program: 1,
  account: 2,
  lifting: 3,
  complete: 4,
};

/** Last "word" of a full name, for the finish-step serif line ("Coach {lastName}"). */
function extractLastName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BaseballCoachOnboarding() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  const [step, setStep] = useState<Step>('type');
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auth state - tracks if user is already signed up
  // authChecked: true once checkAuth() resolves. Final-step Continue buttons are disabled
  // until this is true to prevent race conditions where handleSubmit() runs before
  // existingUser is set.
  const [authChecked, setAuthChecked] = useState(false);
  const [existingUser, setExistingUser] = useState<{ id: string; email: string; fullName: string } | null>(null);

  // Coach type
  const [coachType, setCoachType] = useState<CoachType | ''>('');

  // Program data
  const [division, setDivision] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Account data (only used when user is NOT already authenticated)
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordCheck = validatePassword(password);

  // Lifting step data
  const [liftingInviteEmail, setLiftingInviteEmail] = useState('');
  const liftingEmailInputRef = useRef<HTMLInputElement>(null);
  // Stored after account/program submission so the lifting step can call setLiftingMode
  const [pendingRedirect, setPendingRedirect] = useState('');

  // Entry-world scene — dawn/dusk resolved client-side from the local clock
  // (server + first client render agree on the neutral 'dawn' default; the
  // effect swaps in the real value right after mount, mirroring
  // BaseballAuthShell's identical pattern).
  const [sceneVariant, setSceneVariant] = useState<SceneVariant>('dawn');
  useEffect(() => {
    setSceneVariant(resolveSceneVariant());
  }, []);

  // ─── Detect Existing Auth Session ─────────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabaseRef.current.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || '';
        setExistingUser({ id: user.id, email: user.email || '', fullName: name });
        // Pre-fill form fields from auth metadata
        if (name) setFullName(name);
        if (user.email) setEmail(user.email);
        // If user restored to the account step from localStorage but is already authenticated, skip back to program
        setStep((prev) => prev === 'account' ? 'program' : prev);
      }
      // Mark auth check complete — final Continue buttons are gated on this to prevent race conditions
      setAuthChecked(true);
    }
    checkAuth();
  }, []);

  // ─── LocalStorage Persistence ─────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Guard against a stale persisted step from a prior build (e.g. the
        // removed 'plan' step, #471): only restore a step that is still valid,
        // otherwise the wizard would render into a nonexistent state.
        const VALID_STEPS: readonly Step[] = ['type', 'program', 'account', 'lifting', 'complete'];
        if (parsed.step && (VALID_STEPS as readonly string[]).includes(parsed.step)) {
          setStep(parsed.step as Step);
        }
        if (parsed.coachType) setCoachType(parsed.coachType);
        if (parsed.division) setDivision(parsed.division);
        if (parsed.schoolName) setSchoolName(parsed.schoolName);
        if (parsed.city) setCity(parsed.city);
        if (parsed.state) setState(parsed.state);
        if (parsed.fullName) setFullName(parsed.fullName);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.email) setEmail(parsed.email);
        // Never restore password from localStorage
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const persistState = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, coachType, division, schoolName, city, state, fullName, title,
        // email intentionally excluded — PII should not persist in localStorage
      }));
    } catch {
      // Ignore storage errors
    }
  }, [step, coachType, division, schoolName, city, state, fullName, title]);

  useEffect(() => {
    persistState();
  }, [persistState]);

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  function goForward(to: Step) {
    setDirection(1);
    setStep(to);
  }

  function goBack(to: Step) {
    setDirection(-1);
    setStep(to);
  }

  // ─── Return-to Validation ────────────────────────────────────────────

  function isValidReturnTo(path: string): boolean {
    return (path.startsWith('/baseball/') || path.startsWith('/golf/')) && !path.includes('//');
  }

  function navigateAfterOnboarding(defaultRedirect: string) {
    clearStorage();
    const storedReturnTo = sessionStorage.getItem('baseball_signup_returnTo');
    if (storedReturnTo && isValidReturnTo(storedReturnTo)) {
      sessionStorage.removeItem('baseball_signup_returnTo');
      router.push(storedReturnTo);
    } else {
      if (storedReturnTo) sessionStorage.removeItem('baseball_signup_returnTo');
      router.push(defaultRedirect);
    }
    router.refresh();
  }

  // ─── Submit (via server actions) ───────────────────────────────────────

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const finalCoachType = coachType as CoachType;
      const resolvedName = fullName || existingUser?.fullName || '';

      let result;

      if (existingUser) {
        // Authenticated user — server action creates org/coach/team
        result = await completeCoachOnboarding({
          coachType: finalCoachType,
          schoolName,
          division: division || undefined,
          city: city || undefined,
          state: state || undefined,
          fullName: resolvedName,
          title: title || undefined,
        });
      } else {
        // New user — server action handles signup + onboarding
        result = await signupAndCompleteCoachOnboarding({
          email: email.trim(),
          password,
          fullName: resolvedName,
          coachType: finalCoachType,
          schoolName,
          division: division || undefined,
          city: city || undefined,
          state: state || undefined,
          title: title || undefined,
        });
      }

      if (!result.success) {
        setError(result.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      setLoading(false);
      // Store where to go after the lifting step, then show it
      setPendingRedirect(result.redirectTo || '/baseball/dashboard/command-center');
      goForward('lifting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  }

  function handleFinalContinue() {
    // Guard: don't allow submission until checkAuth() has resolved.
    // Without this, a user who submits quickly could hit handleSubmit() before
    // existingUser is set, causing signupAndCompleteCoachOnboarding() to be called
    // for an already-authenticated email → "already registered" error → coach record never created.
    if (loading || !authChecked) return;
    // handleSubmit navigates to 'lifting' on success (or stays on the current step with an error).
    handleSubmit();
  }

  // ─── Lifting Step Handler ────────────────────────────────────────────────

  async function handleLiftingAnswer(mode: LiftingMode) {
    if (loading) return;

    // Block the invite path until a valid email is provided — don't silently
    // call setLiftingMode('yes') without one (it will fail server-side and,
    // previously, that failure was swallowed and onboarding completed anyway).
    if (mode === 'yes' && !liftingInviteEmail.trim()) {
      setError("Enter the lifting coach's email address.");
      liftingEmailInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Resolve orgId + teamId from the coach profile created during onboarding
        const { data: coach } = await supabase
          .from('baseball_coaches')
          .select('organization_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (coach?.organization_id) {
          const { data: team } = await supabase
            .from('baseball_teams')
            .select('id')
            .eq('organization_id', coach.organization_id)
            .maybeSingle();

          const result = await setLiftingMode({
            mode,
            orgId: coach.organization_id,
            sport: 'baseball',
            teamId: team?.id ?? '',
            inviteEmail: mode === 'yes' ? liftingInviteEmail.trim() : undefined,
          });

          if (!result.success && mode === 'yes') {
            // Surface the failure inline; the user can retry or still "Skip for now".
            setError(result.error || 'Could not send the invite. Please try again or skip for now.');
            return;
          }
        }
        // Non-fatal: if the coach/team lookup fails we still advance.
      }
    } catch {
      // Non-fatal: lifting setup errors do not block onboarding completion.
    } finally {
      setLoading(false);
    }

    goForward('complete');
    navigateAfterOnboarding(pendingRedirect || '/baseball/dashboard');
  }

  function handleGoToDashboard() {
    router.push('/baseball/dashboard/command-center');
    router.refresh();
  }

  // ─── Derived progress ───────────────────────────────────────────────────

  const stepSequence = existingUser ? STEP_SEQUENCE_AUTH : STEP_SEQUENCE_FULL;
  const stepIndexInSequence = stepSequence.indexOf(step);
  const sceneStage = STEP_SCENE_STAGE[step];
  const finishLastName = extractLastName(fullName || existingUser?.fullName || '');

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="living-annual entry-onboarding-scope relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {/* Full-bleed field scene — "the field gets chalked" as the wizard
          advances (docs/baseball/ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT). Fixed
          so it holds steady behind the panel regardless of content height. */}
      <div aria-hidden className="fixed inset-0 z-0">
        <EntryField idSuffix="coach-onboarding-field" stage={sceneStage} variant={sceneVariant} />
      </div>

      {/* Full-bleed newsprint grain */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.025] mix-blend-multiply"
        style={{ backgroundImage: PAGE_GRAIN, backgroundSize: '220px 220px' }}
      />
      {/* One restrained editorial wash behind the panel — never an "orb cluster" */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: 'var(--grade-plus)' }}
      />

      <div className="relative z-10 flex w-full flex-col items-center pb-[env(safe-area-inset-bottom)]">
        <LazyMotion features={domAnimation}>
          {/* Masthead */}
          <m.div
            initial={prefersReducedMotion ? false : ({ opacity: 0, y: -10 })}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.1 })}
            className="mb-7 flex flex-col items-center gap-2 sm:mb-9"
          >
            <div className="relative h-10 w-10 sm:h-12 sm:w-12">
              <Image
                src="/helm-baseball-logo.png"
                alt="BaseballHelm Logo"
                width={48}
                height={48}
                className="h-10 w-10 object-contain sm:h-12 sm:w-12"
                priority
                unoptimized
              />
            </div>
            <Eyebrow ink="team">BaseballHelm · Coach Onboarding</Eyebrow>
          </m.div>

          {/* Progress — numbered eyebrow + thin draw-on rule, not a wizard dot-bar */}
          {step !== 'type' && stepIndexInSequence >= 0 && (
            <div className="w-full max-w-[460px]">
              <StepProgress
                current={stepIndexInSequence + 1}
                total={stepSequence.length}
                label={STEP_LABELS[step]}
              />
            </div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Pre-Step: Coach Type Selection ─────────────────────── */}
            {step === 'type' && (
              <m.div
                key="type"
                custom={direction}
                variants={STEP_TRANSITION}
                initial={prefersReducedMotion ? false : 'initial'}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <Reveal>
                  <div className="mb-6 text-center">
                    <Eyebrow ink="muted">Getting Started</Eyebrow>
                    <h1 className="mt-2 font-annual text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
                      What type of coach are you?
                    </h1>
                    <p className="mt-2 text-sm text-text-tertiary sm:text-base">
                      This determines your dashboard experience.
                    </p>
                  </div>
                </Reveal>

                <div className="space-y-3">
                  {COACH_TYPES.map((opt, i) => (
                    <OptionCard
                      key={opt.value}
                      icon={opt.Icon}
                      title={opt.label}
                      description={opt.desc}
                      staggerIndex={i + 1}
                      onClick={() => { setCoachType(opt.value); goForward('program'); }}
                    />
                  ))}
                </div>
              </m.div>
            )}

            {/* ─── Step 1: Program ────────────────────────────────────── */}
            {step === 'program' && (
              <m.div
                key="program"
                custom={direction}
                variants={STEP_TRANSITION}
                initial={prefersReducedMotion ? false : 'initial'}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <Reveal>
                  <Button
                    variant="ghost"
                    onClick={() => goBack('type')}
                    className="-ml-2 mb-2 flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary active:bg-[var(--fw-color-surface-sunken)]"
                  >
                    <IconArrowLeft size={16} />
                    Back
                  </Button>
                </Reveal>

                <Reveal staggerIndex={1}>
                  <div className="mb-6 text-center">
                    <h1 className="font-annual text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
                      Set up your program
                    </h1>
                    <p className="mt-2 text-sm text-text-tertiary sm:text-base">
                      Tell us about your school and team
                    </p>
                  </div>
                </Reveal>

                <EditorialFrame>
                  <div className="space-y-5">
                    {coachType === 'college' && (
                      <Reveal staggerIndex={2}>
                        <NativeSelect
                          label="Division"
                          value={division}
                          onChange={(e) => setDivision(e.target.value)}
                        >
                          <option value="">Select division</option>
                          {DIVISIONS.map((div) => (
                            <option key={div} value={div}>{div}</option>
                          ))}
                        </NativeSelect>
                      </Reveal>
                    )}

                    {/* Coaching title - shown here when user is already authenticated (skips Account step) */}
                    {existingUser && (
                      <Reveal staggerIndex={3}>
                        <Input
                          label="Coaching Title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Head Coach"
                          required
                        />
                      </Reveal>
                    )}

                    <Reveal staggerIndex={4}>
                      <Input
                        label="School / Organization"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="Texas A&M University"
                        required
                      />
                    </Reveal>

                    <Reveal staggerIndex={5}>
                      <div>
                        <p className="mb-3 text-eyebrow font-semibold uppercase tracking-wider text-text-tertiary">
                          Location
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <Input
                              label="City"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="College Station"
                            />
                          </div>
                          <Input
                            label="State"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="TX"
                            maxLength={2}
                          />
                        </div>
                      </div>
                    </Reveal>
                  </div>

                  <Reveal staggerIndex={6}>
                    <div className="mt-8">
                      <Button
                        onClick={() => (existingUser ? handleFinalContinue() : goForward('account'))}
                        disabled={!schoolName.trim() || (!!existingUser && (!title.trim() || loading || !authChecked))}
                        isLoading={!!existingUser && loading}
                        className="w-full shadow-lg shadow-primary-900/10 transition-colors hover:shadow-xl hover:shadow-primary-900/15"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </Reveal>

                  {existingUser && error && (
                    <m.p
                      initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-fw-sm border border-red-200/70 bg-red-50/60 px-4 py-3 text-center text-sm text-red-700"
                    >
                      {error}
                    </m.p>
                  )}
                </EditorialFrame>
              </m.div>
            )}

            {/* ─── Step 2: Account (only shown if user is NOT already authenticated) ── */}
            {step === 'account' && !existingUser && (
              <m.div
                key="account"
                custom={direction}
                variants={STEP_TRANSITION}
                initial={prefersReducedMotion ? false : 'initial'}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <Reveal>
                  <Button
                    variant="ghost"
                    onClick={() => goBack('program')}
                    className="-ml-2 mb-2 flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary active:bg-[var(--fw-color-surface-sunken)]"
                  >
                    <IconArrowLeft size={16} />
                    Back
                  </Button>
                </Reveal>

                <Reveal staggerIndex={1}>
                  <div className="mb-6 text-center">
                    <h1 className="font-annual text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
                      Create your account
                    </h1>
                    <p className="mt-2 text-sm text-text-tertiary sm:text-base">
                      Your coaching profile and login credentials
                    </p>
                  </div>
                </Reveal>

                <EditorialFrame>
                  <div className="space-y-5">
                    <Reveal staggerIndex={2}>
                      <Input
                        label="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Smith"
                        required
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in onboarding wizard step
                        autoFocus
                      />
                    </Reveal>
                    <Reveal staggerIndex={3}>
                      <Input
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Head Coach"
                        required
                      />
                    </Reveal>
                    <Reveal staggerIndex={4}>
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </Reveal>
                    <Reveal staggerIndex={5}>
                      <div>
                        <Input
                          label="Password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a password"
                          required
                        />
                        <p className={cn(
                          'mt-1.5 text-xs',
                          password && !passwordCheck.valid ? 'text-red-600' : 'text-text-tertiary'
                        )}>
                          {password && !passwordCheck.valid
                            ? passwordCheck.feedback[0]
                            : 'At least 8 characters with uppercase, lowercase, number, and special character'}
                        </p>
                      </div>
                    </Reveal>
                  </div>

                  <Reveal staggerIndex={6}>
                    <div className="mt-8">
                      <Button
                        onClick={handleFinalContinue}
                        disabled={!fullName.trim() || !title.trim() || !email.trim() || !passwordCheck.valid || loading || !authChecked}
                        isLoading={loading}
                        className="w-full shadow-lg shadow-primary-900/10 transition-colors hover:shadow-xl hover:shadow-primary-900/15"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </Reveal>

                  {error && (
                    <m.p
                      initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-fw-sm border border-red-200/70 bg-red-50/60 px-4 py-3 text-center text-sm text-red-700"
                    >
                      {error}
                    </m.p>
                  )}
                </EditorialFrame>
              </m.div>
            )}

            {/* ─── Step 3: Lifting Coach Question ─────────────────────── */}
            {step === 'lifting' && (
              <m.div
                key="lifting"
                custom={direction}
                variants={STEP_TRANSITION}
                initial={prefersReducedMotion ? false : 'initial'}
                animate="animate"
                exit="exit"
                className="w-full max-w-[480px]"
              >
                <Reveal>
                  <div className="mb-6 text-center">
                    <h1 className="font-annual text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
                      Do you have a strength &amp; conditioning coach?
                    </h1>
                    <p className="mt-2 text-sm text-text-tertiary sm:text-base">
                      Helm Lifting Lab connects your coaching staff for integrated player development.
                    </p>
                  </div>
                </Reveal>

                <EditorialFrame>
                  <div className="space-y-3">
                    <OptionCard
                      icon={IconCheck}
                      title="Yes — invite them"
                      description="Send an invite to your S&C coach"
                      disabled={loading}
                      staggerIndex={1}
                      onClick={() => handleLiftingAnswer('yes')}
                    />
                    <OptionCard
                      icon={IconUser}
                      title="No — I manage lifting myself"
                      description="You'll have full access to Lifting Lab"
                      disabled={loading}
                      staggerIndex={2}
                      onClick={() => handleLiftingAnswer('no')}
                    />
                  </div>

                  {/* Invite email — an inset sunken panel, distinct from the two primary choices above */}
                  <Reveal staggerIndex={3}>
                    <div className="mt-5 space-y-4 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--fw-color-surface-sunken)] p-5">
                      <p className="text-sm font-medium text-text-secondary">
                        Invite by email (optional — you can do this later from settings)
                      </p>
                      <Input
                        ref={liftingEmailInputRef}
                        label="S&C Coach Email"
                        type="email"
                        value={liftingInviteEmail}
                        onChange={(e) => setLiftingInviteEmail(e.target.value)}
                        placeholder="coach@university.edu"
                      />
                      <Button
                        disabled={loading || !liftingInviteEmail.trim()}
                        isLoading={loading}
                        onClick={() => handleLiftingAnswer('yes')}
                        className="w-full shadow-lg shadow-primary-900/10 transition-colors hover:shadow-xl hover:shadow-primary-900/15"
                        size="lg"
                      >
                        Send Invite &amp; Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </Reveal>

                  <Reveal staggerIndex={4}>
                    <div className="mt-5 text-center">
                      <Button
                        variant="ghost"
                        disabled={loading}
                        onClick={() => handleLiftingAnswer('later')}
                        className="text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
                      >
                        Skip for now — set up later
                      </Button>
                    </div>
                  </Reveal>

                  {error && (
                    <m.p
                      initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-fw-sm border border-red-200/70 bg-red-50/60 px-4 py-3 text-center text-sm text-red-700"
                    >
                      {error}
                    </m.p>
                  )}
                </EditorialFrame>
              </m.div>
            )}

            {/* ─── Step 4: Complete ────────────────────────────────────── */}
            {step === 'complete' && (
              <m.div
                key="complete"
                custom={direction}
                variants={STEP_TRANSITION}
                initial={prefersReducedMotion ? false : 'initial'}
                animate="animate"
                exit="exit"
                className="w-full max-w-[480px]"
              >
                <EditorialFrame>
                  {loading ? (
                    <div className="flex flex-col items-center gap-6 py-2 text-center">
                      {/* Skeleton placeholder for the CommitSeal ceremony below */}
                      <div
                        aria-hidden
                        className="h-24 w-24 animate-pulse rounded-full border border-dashed border-[color:var(--hairline)] bg-[var(--fw-color-surface-sunken)]"
                      />
                      <LiveDot label="Setting up your program" />
                      <p className="text-sm text-text-tertiary">This will only take a moment.</p>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-5 py-2 text-center">
                      <Eyebrow ink="pursuit">Something Went Wrong</Eyebrow>
                      <h1 className="font-annual text-2xl font-medium text-text-primary sm:text-3xl">
                        We hit a snag
                      </h1>
                      <p className="rounded-fw-sm border border-red-200/70 bg-red-50/60 px-4 py-3 text-sm text-red-700">
                        {error}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => { setError(''); goBack(existingUser ? 'program' : 'account'); }}
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-6 py-2 text-center">
                      <Reveal>
                        <CommitSeal label="WELCOME" size="lg" />
                      </Reveal>
                      <Reveal staggerIndex={1}>
                        <div>
                          {/* The serif finish moment (docs/baseball/ENTRY_SCENES_DESIGN.md
                              ⚠ AMENDMENT) — stage 4: batter's boxes whisper in + the
                              bloom warms one step behind this line. */}
                          <h1 className={cn(
                            flFraunces.className,
                            'text-2xl font-medium leading-tight text-[color:var(--fl-sage-ink)] sm:text-3xl',
                          )}>
                            {finishLastName
                              ? `Your program is on the board, Coach ${finishLastName}.`
                              : 'Your program is on the board.'}
                          </h1>
                          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-tertiary sm:text-base">
                            {schoolName ? `${schoolName} Baseball is ready. ` : ''}
                            Head to your dashboard to start managing your team.
                          </p>
                        </div>
                      </Reveal>
                      <Reveal staggerIndex={2}>
                        <Button
                          size="lg"
                          onClick={handleGoToDashboard}
                          className="w-full px-10 shadow-lg shadow-primary-900/10 transition-colors hover:shadow-xl hover:shadow-primary-900/15 sm:w-auto"
                        >
                          Go to Dashboard
                          <IconArrowRight size={16} className="ml-2" />
                        </Button>
                      </Reveal>
                    </div>
                  )}
                </EditorialFrame>
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </div>
    </div>
  );
}

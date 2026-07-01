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
import {
  StepIndicator,
  slideVariants,
  staggerContainer,
  staggerItem,
} from '@/components/baseball/onboarding/StepIndicator';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'type' | 'program' | 'account' | 'lifting' | 'complete';

const STEPS_CONFIG_FULL = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'account' as const, label: 'Account', Icon: IconUser },
  { id: 'lifting' as const, label: 'Lifting', Icon: IconCheck },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const STEPS_CONFIG_AUTH = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'lifting' as const, label: 'Lifting', Icon: IconCheck },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const COACH_TYPES = [
  { value: 'college' as const, label: 'College Coach', desc: 'NCAA D1, D2, D3, or NAIA program', Icon: IconBuilding },
  { value: 'juco' as const, label: 'JUCO Coach', desc: 'Junior college / community college', Icon: IconGraduationCap },
  { value: 'high_school' as const, label: 'High School Coach', desc: 'High school varsity or JV program', Icon: IconSchool },
  { value: 'showcase' as const, label: 'Showcase Coach', desc: 'Travel ball or showcase organization', Icon: IconBaseball },
] as const;

type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA'];

const STORAGE_KEY = 'baseballhelm_coach_onboarding';

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
        if (parsed.step) setStep(parsed.step);
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-auth-baseball relative">
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-amber-400/40 to-helm-amber-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-amber-400/25 to-helm-amber-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-amber-300/20 to-helm-amber-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LazyMotion features={domAnimation}>
          {/* Logo */}
          <m.div
            initial={prefersReducedMotion ? false : ({ opacity: 0, y: -10 })}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.1 })}
            className="mb-6 sm:mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-amber-500/25 rounded-full blur-xl scale-150" />
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                <Image
                  src="/helm-baseball-logo.png"
                  alt="BaseballHelm Logo"
                  width={48}
                  height={48}
                  className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>
          </m.div>

          {/* Step Indicator - only after type selection */}
          {step !== 'type' && (
            <m.div
              initial={prefersReducedMotion ? false : ({ opacity: 0, y: -10 })}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.2 })}
            >
              <StepIndicator currentStep={step} steps={existingUser ? STEPS_CONFIG_AUTH : STEPS_CONFIG_FULL} />
            </m.div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Pre-Step: Coach Type Selection ─────────────────────── */}
            {step === 'type' && (
              <m.div
                key="type"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-5">
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      What type of coach are you?
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      This determines your dashboard experience
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="space-y-3">
                    {COACH_TYPES.map((opt) => (
                      <Button variant="ghost"
                        key={opt.value}
                        onClick={() => { setCoachType(opt.value); goForward('program'); }}
                        className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary-100 transition-[transform,background-color]">
                            <opt.Icon size={24} className="text-primary-600" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-warm-900">{opt.label}</p>
                            <p className="text-sm text-warm-500">{opt.desc}</p>
                          </div>
                          <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
                        </div>
                      </Button>
                    ))}
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 1: Program ────────────────────────────────────── */}
            {step === 'program' && (
              <m.div
                key="program"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <Button variant="ghost"
                      onClick={() => goBack('type')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Set up your program
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Tell us about your school and team
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8">
                    <div className="space-y-5">
                      {coachType === 'college' && (
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
                      )}

                      {/* Coaching title - shown here when user is already authenticated (skips Account step) */}
                      {existingUser && (
                        <Input
                          label="Coaching Title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Head Coach"
                          required
                        />
                      )}

                      <Input
                        label="School / Organization"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="Texas A&M University"
                        required
                      />

                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
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
                    </div>

                    <div className="mt-8">
                      <Button
                        onClick={() => (existingUser ? handleFinalContinue() : goForward('account'))}
                        disabled={!schoolName.trim() || (!!existingUser && (!title.trim() || loading || !authChecked))}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>

                    {existingUser && error && (
                      <m.p
                        initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center"
                      >
                        {error}
                      </m.p>
                    )}
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 2: Account (only shown if user is NOT already authenticated) ── */}
            {step === 'account' && !existingUser && (
              <m.div
                key="account"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <Button variant="ghost"
                      onClick={() => goBack('program')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Create your account
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Your coaching profile and login credentials
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8">
                    <div className="space-y-5">
                      <Input
                        label="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Smith"
                        required
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in onboarding wizard step
                        autoFocus
                      />
                      <Input
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Head Coach"
                        required
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
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
                          'text-xs mt-1.5',
                          password && !passwordCheck.valid ? 'text-red-600' : 'text-warm-400'
                        )}>
                          {password && !passwordCheck.valid
                            ? passwordCheck.feedback[0]
                            : 'At least 8 characters with uppercase, lowercase, number, and special character'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <Button
                        onClick={handleFinalContinue}
                        disabled={!fullName.trim() || !title.trim() || !email.trim() || !passwordCheck.valid || loading || !authChecked}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>

                    {error && (
                      <m.p
                        initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center"
                      >
                        {error}
                      </m.p>
                    )}
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 3: Lifting Coach Question ─────────────────────── */}
            {step === 'lifting' && (
              <m.div
                key="lifting"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[480px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-5">
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Do you have a strength &amp; conditioning coach?
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Helm Lifting Lab connects your coaching staff for integrated player development.
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="space-y-3">
                    <Button
                      variant="ghost"
                      disabled={loading}
                      onClick={() => handleLiftingAnswer('yes')}
                      className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary-100 transition-[transform,background-color]">
                          <IconCheck size={24} className="text-primary-600" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-warm-900">Yes — invite them</p>
                          <p className="text-sm text-warm-500">Send an invite to your S&amp;C coach</p>
                        </div>
                        <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
                      </div>
                    </Button>

                    <Button
                      variant="ghost"
                      disabled={loading}
                      onClick={() => handleLiftingAnswer('no')}
                      className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary-100 transition-[transform,background-color]">
                          <IconUser size={24} className="text-primary-600" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-warm-900">No — I manage lifting myself</p>
                          <p className="text-sm text-warm-500">You&apos;ll have full access to Lifting Lab</p>
                        </div>
                        <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
                      </div>
                    </Button>
                  </m.div>

                  {/* Invite email — shown when user intends to invite an S&C coach */}
                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8 space-y-4">
                    <p className="text-sm font-medium text-warm-700">
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
                      onClick={() => handleLiftingAnswer('yes')}
                      className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                      size="lg"
                    >
                      Send Invite &amp; Continue
                      <IconArrowRight size={16} className="ml-2" />
                    </Button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <Button
                      variant="ghost"
                      disabled={loading}
                      onClick={() => handleLiftingAnswer('later')}
                      className="text-sm text-warm-500 hover:text-warm-700 font-medium transition-colors"
                    >
                      Skip for now — set up later
                    </Button>
                  </m.div>

                  {error && (
                    <m.p
                      initial={prefersReducedMotion ? false : ({ opacity: 0, y: -8 })}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center"
                    >
                      {error}
                    </m.p>
                  )}
                </m.div>
              </m.div>
            )}

            {/* ─── Step 4: Complete ────────────────────────────────────── */}
            {step === 'complete' && (
              <m.div
                key="complete"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[480px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-6">
                  <m.div variants={staggerItem} className="flex justify-center">
                    <div className="relative">
                      {[...Array(8)].map((_, i) => (
                        <m.div
                          key={i}
                          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                          style={{
                            background: i % 2 === 0 ? 'rgb(22, 163, 74)' : 'rgb(74, 222, 128)',
                          }}
                          initial={prefersReducedMotion ? false : ({ scale: 0, opacity: 1, x: 0, y: 0 })}
                          animate={{
                            scale: [0, 1.2, 0],
                            opacity: [0, 1, 0],
                            x: Math.cos((i / 8) * Math.PI * 2) * 50,
                            y: Math.sin((i / 8) * Math.PI * 2) * 50,
                          }}
                          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, delay: 0.3 + i * 0.04, ease: 'easeOut' })}
                        />
                      ))}
                      <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full scale-[2]" />
                      <m.div
                        initial={prefersReducedMotion ? false : ({ scale: 0, rotate: -20 })}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 })}
                        className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-900/20"
                      >
                        <m.div
                          initial={prefersReducedMotion ? false : ({ scale: 0, opacity: 0 })}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, type: 'spring', stiffness: 300 })}
                        >
                          <IconCheck size={40} className="text-white" />
                        </m.div>
                      </m.div>
                    </div>
                  </m.div>

                  {loading ? (
                    <m.div variants={staggerItem} className="text-center">
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                        Setting up your program...
                      </h1>
                      <p className="text-warm-500 text-sm sm:text-base">
                        This will only take a moment.
                      </p>
                    </m.div>
                  ) : error ? (
                    <>
                      <m.div variants={staggerItem} className="text-center">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                          Something went wrong
                        </h1>
                        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                          {error}
                        </p>
                      </m.div>
                      <m.div variants={staggerItem} className="text-center">
                        <Button
                          variant="secondary"
                          onClick={() => { setError(''); goBack(existingUser ? 'program' : 'account'); }}
                        >
                          Try Again
                        </Button>
                      </m.div>
                    </>
                  ) : (
                    <>
                      <m.div variants={staggerItem} className="text-center">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                          {schoolName ? `${schoolName} Baseball is ready!` : 'Your program is ready!'}
                        </h1>
                        <p className="text-warm-500 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                          Welcome to BaseballHelm. Head to your dashboard to start managing your team.
                        </p>
                      </m.div>

                      <m.div variants={staggerItem} className="text-center">
                        <Button
                          size="lg"
                          onClick={handleGoToDashboard}
                          className="w-full sm:w-auto px-10 bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                        >
                          Go to Dashboard
                          <IconArrowRight size={16} className="ml-2" />
                        </Button>
                      </m.div>
                    </>
                  )}
                </m.div>
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </div>
    </div>
  );
}

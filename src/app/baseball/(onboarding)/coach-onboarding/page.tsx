'use client';

import { useState, useEffect, useRef, Fragment, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  completeCoachOnboarding,
  signupAndCompleteCoachOnboarding,
} from '@/app/baseball/actions/onboarding';
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
import { Check } from 'lucide-react';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'type' | 'program' | 'account' | 'plan' | 'complete';

const STEPS_CONFIG_FULL = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'account' as const, label: 'Account', Icon: IconUser },
  { id: 'plan' as const, label: 'Plan', Icon: IconCheck },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const STEPS_CONFIG_AUTH = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'plan' as const, label: 'Plan', Icon: IconCheck },
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

// ─── Animation Variants ─────────────────────────────────────────────────────

const slideVariants = {
  initial: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

// ─── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({ currentStep, steps }: { currentStep: Step; steps: typeof STEPS_CONFIG_FULL }) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-0 mb-8 sm:mb-10">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <Fragment key={step.id}>
            {index > 0 && (
              <div
                aria-hidden="true"
                className={cn(
                  'h-[2px] w-8 sm:w-12 transition-colors duration-500',
                  isCompleted ? 'bg-primary-500' : 'bg-warm-200'
                )}
              />
            )}
            <div
              className="flex flex-col items-center gap-1.5"
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-500 text-sm font-semibold',
                  isCompleted && 'bg-primary-600 text-white shadow-sm shadow-primary-600/30',
                  isCurrent && 'bg-white border-2 border-primary-600 text-primary-600 shadow-sm',
                  !isCompleted && !isCurrent && 'bg-warm-100 text-warm-400'
                )}
                aria-hidden="true"
              >
                {isCompleted ? <IconCheck size={14} /> : index + 1}
              </div>
              <span
                className={cn(
                  'text-label font-medium transition-colors duration-500',
                  isCurrent ? 'text-warm-900' : isCompleted ? 'text-primary-600' : 'text-warm-400'
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">
                {isCompleted ? '(completed)' : isCurrent ? '(current step)' : '(upcoming)'}
              </span>
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}

// ─── Plan Comparison Modal ──────────────────────────────────────────────────

function PlanComparisonModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const features = [
    {
      category: 'Recruiting',
      items: [
        { name: 'Player discovery & search', free: true, elite: true },
        { name: 'View player profiles', free: true, elite: true },
        { name: 'Save to watchlist', free: true, elite: true },
        { name: 'Basic messaging', free: true, elite: false },
        { name: 'Unlimited messaging', free: false, elite: true },
      ],
    },
    {
      category: 'Team Management',
      items: [
        { name: 'Full roster management', free: false, elite: true },
        { name: 'Attendance tracking', free: false, elite: true },
        { name: 'Player development tracking', free: false, elite: true },
      ],
    },
    {
      category: 'Analytics & Admin',
      items: [
        { name: 'Team statistics', free: false, elite: true },
        { name: 'Compliance calendar', free: false, elite: true },
        { name: 'Priority support', free: false, elite: true },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.div
            initial={prefersReducedMotion ? false : ({ opacity: 0 })}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <m.div
              initial={prefersReducedMotion ? false : ({ opacity: 0, scale: 0.95, y: 20 })}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="auth-glass-card rounded-2xl shadow-2xl max-w-[768px] w-full max-h-[85vh] overflow-clip"
            >
              <div className="flex items-center justify-between p-6 border-b border-warm-200">
                <h2 className="text-xl font-bold text-warm-900">Compare Plans</h2>
                <Button variant="ghost" onClick={onClose} className="p-2 hover:bg-warm-100 rounded-lg transition-colors" aria-label="Close">
                  <span className="text-warm-500 text-lg">&times;</span>
                </Button>
              </div>
              <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4 sticky top-0 bg-white/90 backdrop-blur-sm pb-4">
                  <div />
                  <div className="text-center">
                    <h3 className="font-semibold text-warm-900">Free</h3>
                    <p className="text-sm text-warm-500">$0/mo</p>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-warm-900">Elite</h3>
                    <p className="text-sm text-warm-500">$200/mo</p>
                  </div>
                </div>
                {features.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">{cat.category}</p>
                    <div className="space-y-2">
                      {cat.items.map((item) => (
                        <div key={item.name} className="grid grid-cols-3 gap-4 items-center py-2">
                          <span className="text-sm text-warm-700">{item.name}</span>
                          <div className="flex justify-center">
                            {item.free ? <Check size={18} className="text-primary-600" /> : <span className="text-warm-300">&mdash;</span>}
                          </div>
                          <div className="flex justify-center">
                            {item.elite ? <Check size={18} className="text-primary-600" /> : <span className="text-warm-300">&mdash;</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
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
  const [showComparison, setShowComparison] = useState(false);

  // Auth state - tracks if user is already signed up
  // authChecked: true once checkAuth() resolves. Plan buttons are disabled until this is true
  // to prevent race conditions where handleSubmit() runs before existingUser is set.
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

  // Plan data
  const [plan, setPlan] = useState<'free' | 'elite' | ''>('');

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
        // If user restored to the account step from localStorage but is already authenticated, skip forward
        setStep((prev) => prev === 'account' ? 'plan' : prev);
      }
      // Mark auth check complete — plan buttons are gated on this to prevent race conditions
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
      navigateAfterOnboarding(result.redirectTo || `/baseball/coach/${finalCoachType.replace('_', '-')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  }

  function handlePlanSelectAndSubmit(selectedPlan: 'free' | 'elite') {
    // Guard: don't allow submission until checkAuth() has resolved.
    // Without this, a user who submits quickly could hit handleSubmit() before
    // existingUser is set, causing signupAndCompleteCoachOnboarding() to be called
    // for an already-authenticated email → "already registered" error → coach record never created.
    if (loading || !authChecked) return;
    setPlan(selectedPlan);
    goForward('complete');
    handleSubmit();
  }

  function handleGoToDashboard() {
    const dashboardPath = coachType ? `/baseball/coach/${coachType.replace('_', '-')}` : '/baseball/dashboard';
    router.push(dashboardPath);
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
                        onClick={() => goForward(existingUser ? 'plan' : 'account')}
                        disabled={!schoolName.trim() || (!!existingUser && !title.trim())}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
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
                        <p className="text-xs text-warm-400 mt-1.5">At least 8 characters with uppercase, lowercase, number, and special character</p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('plan')}
                        disabled={!fullName.trim() || !title.trim() || !email.trim() || password.length < 8}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-colors"
                        size="lg"
                      >
                        Continue
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 3: Plan Selection ─────────────────────────────── */}
            {step === 'plan' && (
              <m.div
                key="plan"
                custom={direction}
                variants={slideVariants}
                initial={prefersReducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                className="w-full max-w-[560px]"
              >
                <m.div variants={staggerContainer} initial={prefersReducedMotion ? false : "initial"} animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <Button variant="ghost"
                      onClick={() => goBack(existingUser ? 'program' : 'account')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Choose your plan
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      You can change plans anytime from settings
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="grid sm:grid-cols-2 gap-4">
                    <Button variant="ghost"
                      onClick={() => handlePlanSelectAndSubmit('free')}
                      disabled={loading || !authChecked}
                      className={cn(
                        'auth-glass-card rounded-2xl p-6 text-left transition-colors hover:bg-white/90',
                        plan === 'free' && 'ring-2 ring-primary-500',
                        !authChecked && 'opacity-60 cursor-wait'
                      )}
                    >
                      <h3 className="text-lg font-bold text-warm-900 mb-1">Free</h3>
                      <p className="text-2xl font-bold text-warm-900 mb-4">$0<span className="text-sm font-normal text-warm-500">/mo</span></p>
                      <div className="space-y-2">
                        {['Player discovery', 'View profiles', 'Save to watchlist', 'Basic messaging'].map((f) => (
                          <div key={f} className="flex items-center gap-2">
                            <Check size={14} className="text-primary-600 flex-shrink-0" />
                            <span className="text-sm text-warm-600">{f}</span>
                          </div>
                        ))}
                      </div>
                    </Button>

                    <Button variant="ghost"
                      onClick={() => handlePlanSelectAndSubmit('elite')}
                      disabled={loading || !authChecked}
                      className={cn(
                        'auth-glass-card rounded-2xl p-6 text-left transition-colors hover:bg-white/90 relative',
                        plan === 'elite' ? 'ring-2 ring-primary-500' : 'ring-1 ring-primary-200',
                        !authChecked && 'opacity-60 cursor-wait'
                      )}
                    >
                      <div className="absolute -top-2.5 left-4">
                        <span className="bg-primary-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          Recommended
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-warm-900 mb-1">Elite</h3>
                      <p className="text-2xl font-bold text-warm-900 mb-4">$200<span className="text-sm font-normal text-warm-500">/mo</span></p>
                      <div className="space-y-2">
                        {['Everything in Free', 'Full roster management', 'Team analytics', 'Player development', 'Priority support'].map((f) => (
                          <div key={f} className="flex items-center gap-2">
                            <Check size={14} className="text-primary-600 flex-shrink-0" />
                            <span className="text-sm text-warm-600">{f}</span>
                          </div>
                        ))}
                      </div>
                    </Button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <Button variant="ghost"
                      onClick={() => setShowComparison(true)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      Compare all features
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
                          onClick={() => { setError(''); goBack('plan'); }}
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

      <PlanComparisonModal isOpen={showComparison} onClose={() => setShowComparison(false)} />
    </div>
  );
}

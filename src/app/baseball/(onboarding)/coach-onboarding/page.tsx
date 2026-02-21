'use client';

import { useState, useEffect, Fragment, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconUser,
  IconBuilding,
} from '@/components/icons';
import { Check } from 'lucide-react';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'role' | 'program' | 'account' | 'plan' | 'complete';

const STEPS_CONFIG = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'account' as const, label: 'Account', Icon: IconUser },
  { id: 'plan' as const, label: 'Plan', Icon: IconCheck },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const TEAM_LEVELS = [
  { value: 'college' as const, label: 'College' },
  { value: 'high-school' as const, label: 'High School' },
  { value: 'showcase' as const, label: 'Showcase' },
];

const DIVISIONS = ['D1', 'D2', 'D3', 'JUCO', 'NAIA'];

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

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS_CONFIG.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-0 mb-8 sm:mb-10">
      {STEPS_CONFIG.map((step, index) => {
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
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 text-sm font-semibold',
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="auth-glass-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-warm-200">
                <h2 className="text-xl font-bold text-warm-900">Compare Plans</h2>
                <button onClick={onClose} className="p-2 hover:bg-warm-100 rounded-lg transition-colors" aria-label="Close">
                  <span className="text-warm-500 text-lg">&times;</span>
                </button>
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
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('role');
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showComparison, setShowComparison] = useState(false);

  // Program data
  const [teamLevel, setTeamLevel] = useState<'college' | 'high-school' | 'showcase' | ''>('');
  const [division, setDivision] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Account data
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Plan data
  const [plan, setPlan] = useState<'free' | 'elite' | ''>('');

  // ─── LocalStorage Persistence ─────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.step) setStep(parsed.step);
        if (parsed.teamLevel) setTeamLevel(parsed.teamLevel);
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
        step, teamLevel, division, schoolName, city, state, fullName, title, email,
      }));
    } catch {
      // Ignore storage errors
    }
  }, [step, teamLevel, division, schoolName, city, state, fullName, title, email]);

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

  function handleRoleSelect(role: 'coach' | 'player') {
    if (role === 'player') {
      router.push('/baseball/player');
    } else {
      goForward('program');
    }
  }

  // ─── Create Coach Records ─────────────────────────────────────────────

  async function createCoachRecords(userId: string, userEmail: string, coachType: 'college' | 'juco' | 'high_school' | 'showcase') {
    await supabase
      .from('users')
      .upsert({ id: userId, email: userEmail, role: 'coach' }, { onConflict: 'id' });

    const orgType = coachType === 'college' ? 'college'
      : coachType === 'juco' ? 'juco'
      : coachType === 'high_school' ? 'high_school'
      : 'showcase';

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: schoolName,
        type: orgType,
        division: division || null,
        location_city: city || null,
        location_state: state || null,
      })
      .select()
      .single();

    if (orgError) {
      setError(`Failed to create organization: ${orgError.message}`);
      setLoading(false);
      return;
    }

    const { error: coachError } = await supabase
      .from('baseball_coaches')
      .insert({
        user_id: userId,
        coach_type: coachType,
        organization_id: org.id,
        full_name: fullName,
        coach_title: title,
        school_name: schoolName,
        school_city: city || null,
        school_state: state || null,
        program_division: division || null,
        onboarding_completed: true,
      });

    if (coachError) {
      setError(`Failed to create coach profile: ${coachError.message}`);
      setLoading(false);
      return;
    }

    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const teamType = coachType === 'college' ? 'college'
      : coachType === 'juco' ? 'juco'
      : coachType === 'high_school' ? 'high_school'
      : 'showcase';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_teams')
      .insert({
        name: `${schoolName} Baseball`,
        team_type: teamType,
        organization_id: org.id,
        join_code: joinCode,
        created_by: userId,
      });

    clearStorage();
    setLoading(false);

    const storedReturnTo = sessionStorage.getItem('baseball_signup_returnTo');
    if (storedReturnTo) {
      sessionStorage.removeItem('baseball_signup_returnTo');
      router.push(storedReturnTo);
    } else {
      router.push('/baseball/dashboard');
    }
    router.refresh();
  }

  // ─── Submit ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      let coachType: 'college' | 'juco' | 'high_school' | 'showcase' = 'college';
      if (teamLevel === 'high-school') coachType = 'high_school';
      else if (teamLevel === 'showcase') coachType = 'showcase';
      else if (division === 'JUCO') coachType = 'juco';

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'coach',
            sport: 'baseball',
            coach_type: coachType,
            first_name: fullName.split(' ')[0] || '',
            last_name: fullName.split(' ').slice(1).join(' ') || '',
          },
        },
      });

      if (authError) {
        if (authError.status === 422 || authError.message?.includes('already registered') || (authError as { code?: string }).code === 'user_already_exists') {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (signInError) {
            setError('An account with this email already exists. Please sign in instead.');
            setLoading(false);
            return;
          }

          if (signInData.user) {
            const { data: existingCoach } = await supabase
              .from('baseball_coaches')
              .select('id')
              .eq('user_id', signInData.user.id)
              .single();

            if (existingCoach) {
              clearStorage();
              router.push('/baseball/dashboard');
              router.refresh();
              return;
            }

            await createCoachRecords(signInData.user.id, signInData.user.email || email, coachType);
            return;
          }
        }

        setError(`Failed to create account: ${authError.message}`);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert({ id: authData.user.id, email: authData.user.email || email, role: 'coach' }, { onConflict: 'id' });

      if (userError) {
        setError(`Failed to set user role: ${userError.message}`);
        setLoading(false);
        return;
      }

      await createCoachRecords(authData.user.id, authData.user.email || email, coachType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  }

  function handlePlanSelectAndSubmit(selectedPlan: 'free' | 'elite') {
    setPlan(selectedPlan);
    goForward('complete');
    setTimeout(() => handleSubmit(), 300);
  }

  function handleGoToDashboard() {
    router.refresh();
    setTimeout(() => router.push('/baseball/dashboard'), 150);
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
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 sm:mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-amber-500/25 rounded-full blur-xl scale-150" />
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden">
                <Image
                  src="/helm-baseball-logo.png"
                  alt="BaseballHelm"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  priority
                  unoptimized
                />
              </div>
            </div>
          </m.div>

          {/* Step Indicator - only after role selection */}
          {step !== 'role' && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <StepIndicator currentStep={step} />
            </m.div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Pre-Step: Role Selection ───────────────────────────── */}
            {step === 'role' && (
              <m.div
                key="role"
                custom={direction}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Sign up as
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Choose your role to get started
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="space-y-3">
                    <button
                      onClick={() => handleRoleSelect('coach')}
                      className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                          🎓
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-warm-900">Coach</p>
                          <p className="text-sm text-warm-500">Manage your program and recruit players</p>
                        </div>
                        <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
                      </div>
                    </button>

                    <button
                      onClick={() => handleRoleSelect('player')}
                      className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                          ⚾
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-warm-900">Player</p>
                          <p className="text-sm text-warm-500">Build your profile and connect with coaches</p>
                        </div>
                        <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
                      </div>
                    </button>
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
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <button
                      onClick={() => goBack('role')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </button>
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
                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Team Level
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {TEAM_LEVELS.map((level) => (
                            <button
                              key={level.value}
                              type="button"
                              onClick={() => {
                                setTeamLevel(level.value);
                                if (level.value !== 'college') setDivision('');
                              }}
                              className={cn(
                                'px-3 py-2.5 rounded-xl text-sm font-medium transition-all border',
                                teamLevel === level.value
                                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                  : 'bg-white/50 text-warm-700 border-warm-200 hover:border-primary-300 hover:bg-white/80'
                              )}
                            >
                              {level.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {teamLevel === 'college' && (
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
                        onClick={() => goForward('account')}
                        disabled={!teamLevel || !schoolName.trim()}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-all"
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

            {/* ─── Step 2: Account ────────────────────────────────────── */}
            {step === 'account' && (
              <m.div
                key="account"
                custom={direction}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <button
                      onClick={() => goBack('program')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </button>
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
                        <p className="text-xs text-warm-400 mt-1.5">At least 6 characters</p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('plan')}
                        disabled={!fullName.trim() || !title.trim() || !email.trim() || password.length < 6}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-all"
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
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[560px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                  <m.div variants={staggerItem}>
                    <button
                      onClick={() => goBack('account')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </button>
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
                    <button
                      onClick={() => handlePlanSelectAndSubmit('free')}
                      disabled={loading}
                      className={cn(
                        'auth-glass-card rounded-2xl p-6 text-left transition-all hover:bg-white/90',
                        plan === 'free' && 'ring-2 ring-primary-500'
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
                    </button>

                    <button
                      onClick={() => handlePlanSelectAndSubmit('elite')}
                      disabled={loading}
                      className={cn(
                        'auth-glass-card rounded-2xl p-6 text-left transition-all hover:bg-white/90 relative',
                        plan === 'elite' ? 'ring-2 ring-primary-500' : 'ring-1 ring-primary-200'
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
                    </button>
                  </m.div>

                  <m.div variants={staggerItem} className="text-center">
                    <button
                      onClick={() => setShowComparison(true)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      Compare all features
                    </button>
                  </m.div>

                  {error && (
                    <m.p
                      initial={{ opacity: 0, y: -8 }}
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
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[480px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                  <m.div variants={staggerItem} className="flex justify-center">
                    <div className="relative">
                      {[...Array(8)].map((_, i) => (
                        <m.div
                          key={i}
                          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                          style={{
                            background: i % 2 === 0 ? 'rgb(22, 163, 74)' : 'rgb(74, 222, 128)',
                          }}
                          initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
                          animate={{
                            scale: [0, 1.2, 0],
                            opacity: [0, 1, 0],
                            x: Math.cos((i / 8) * Math.PI * 2) * 50,
                            y: Math.sin((i / 8) * Math.PI * 2) * 50,
                          }}
                          transition={{ duration: 0.8, delay: 0.3 + i * 0.04, ease: 'easeOut' }}
                        />
                      ))}
                      <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full scale-[2]" />
                      <m.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
                        className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-900/20"
                      >
                        <m.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
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
                          className="w-full sm:w-auto px-10 bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-all"
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

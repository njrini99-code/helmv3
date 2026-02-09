'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoading } from '@/components/ui/loading';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconUser,
  IconBuilding,
  IconCopy,
} from '@/components/icons';
import { completeCoachOnboarding } from '@/app/golf/actions/onboarding';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'program' | 'profile' | 'complete';

const STEPS_CONFIG = [
  { id: 'program' as const, label: 'Program', Icon: IconBuilding },
  { id: 'profile' as const, label: 'Profile', Icon: IconUser },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'NJCAA', 'Club'];

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
    <div className="flex items-center justify-center gap-0 mb-8 sm:mb-10">
      {STEPS_CONFIG.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <Fragment key={step.id}>
            {index > 0 && (
              <div
                className={cn(
                  'h-[2px] w-8 sm:w-12 transition-colors duration-500',
                  isCompleted ? 'bg-primary-500' : 'bg-warm-200'
                )}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 text-sm font-semibold',
                  isCompleted && 'bg-primary-600 text-white shadow-sm shadow-primary-600/30',
                  isCurrent && 'bg-white border-2 border-primary-600 text-primary-600 shadow-sm',
                  !isCompleted && !isCurrent && 'bg-warm-100 text-warm-400'
                )}
              >
                {isCompleted ? <IconCheck size={14} /> : index + 1}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium transition-colors duration-500',
                  isCurrent ? 'text-warm-900' : isCompleted ? 'text-primary-600' : 'text-warm-400'
                )}
              >
                {step.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GolfCoachOnboarding() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('program');
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState('');

  // Program data
  const [orgName, setOrgName] = useState('');
  const [division, setDivision] = useState('');
  const [conference, setConference] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [teamName, setTeamName] = useState('');

  // Profile data
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Completion data
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Auth Check ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      let user = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          user = data.user;
          break;
        }
        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!user) {
        router.push('/golf/login');
        return;
      }

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (coach?.onboarding_completed) {
        router.push('/golf/dashboard');
        return;
      }

      // Pre-fill name from auth metadata if available
      const meta = user.user_metadata;
      if (meta?.first_name && meta?.last_name) {
        setFullName(`${meta.first_name} ${meta.last_name}`);
      }

      setAuthLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  // ─── Navigation ─────────────────────────────────────────────────────────

  function goForward(to: Step) {
    setDirection(1);
    setStep(to);
  }

  function goBack(to: Step) {
    setDirection(-1);
    setStep(to);
  }

  // ─── Submit Onboarding ──────────────────────────────────────────────────

  async function handleSubmitOnboarding() {
    setLoading(true);
    setError('');

    try {
      const result = await completeCoachOnboarding({
        orgName,
        division: division || undefined,
        conference: conference || undefined,
        city: city || undefined,
        state: state || undefined,
        teamName: teamName || undefined,
        fullName,
        title: title || undefined,
      });

      if (!result.success) {
        setError(result.error || 'Failed to complete setup. Please try again.');
        setLoading(false);
        return;
      }

      setJoinCode(result.data?.joinCode || null);
      setLoading(false);
      goForward('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  }

  function handleGoToDashboard() {
    router.refresh();
    setTimeout(() => router.push('/golf/dashboard'), 150);
  }

  async function handleCopyCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  if (authLoading) return <PageLoading />;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-auth-golf relative">
      {/* Floating Orbs (CSS-driven, matches login/signup) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-green-400/40 to-helm-green-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-green-400/25 to-helm-green-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-green-300/20 to-helm-green-400/15" />
      </div>

      <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6 sm:mb-8"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-helm-green-500/25 rounded-full blur-xl scale-150" />
            <Image
              src="/helm-golf-logo-transparent.png"
              alt="GolfHelm"
              width={48}
              height={48}
              className="relative w-10 h-10 sm:w-12 sm:h-12 object-contain"
              priority
              unoptimized
            />
          </div>
        </m.div>

        <LazyMotion features={domAnimation}>
          {/* Step Indicator */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <StepIndicator currentStep={step} />
          </m.div>

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Step 1: Your Program ─────────────────────────────────── */}
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
                  {/* Header */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Set up your program
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Tell us about your school and team
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div
                    variants={staggerItem}
                    className="auth-glass-card rounded-3xl p-6 sm:p-8"
                  >
                    <div className="space-y-5">
                      {/* Program Details */}
                      <div className="space-y-4">
                        <Input
                          label="School / Organization"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="Texas A&M University"
                          required
                          autoFocus
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <NativeSelect
                            label="Division"
                            value={division}
                            onChange={(e) => setDivision(e.target.value)}
                          >
                            <option value="">Select</option>
                            {DIVISIONS.map((div) => (
                              <option key={div} value={div}>{div}</option>
                            ))}
                          </NativeSelect>
                          <Input
                            label="Conference"
                            value={conference}
                            onChange={(e) => setConference(e.target.value)}
                            placeholder="SEC"
                          />
                        </div>
                      </div>

                      {/* Location */}
                      <div>
                        <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-3">
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

                      {/* Team */}
                      <div>
                        <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Team
                        </p>
                        <Input
                          label="Team Name"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          placeholder="Men's Golf"
                          hint={orgName ? `Leave blank to default to "${orgName} Golf"` : 'e.g., Men\'s Golf, Women\'s Golf'}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('profile')}
                        disabled={!orgName.trim()}
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

            {/* ─── Step 2: Your Profile ─────────────────────────────────── */}
            {step === 'profile' && (
              <m.div
                key="profile"
                custom={direction}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-[460px]"
              >
                <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                  {/* Back Button */}
                  <m.div variants={staggerItem}>
                    <button
                      onClick={() => goBack('program')}
                      className="flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-700 transition-colors"
                    >
                      <IconArrowLeft size={14} />
                      Back
                    </button>
                  </m.div>

                  {/* Header */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Your profile
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      How your players will see you
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div
                    variants={staggerItem}
                    className="auth-glass-card rounded-3xl p-6 sm:p-8"
                  >
                    <div className="space-y-6">
                      {/* Avatar Upload - Centered */}
                      <div className="flex flex-col items-center pb-2">
                        <AvatarUpload
                          currentAvatarUrl={avatarUrl}
                          name={fullName || 'Coach'}
                          onUploadComplete={(url) => setAvatarUrl(url)}
                          onRemove={() => setAvatarUrl(null)}
                        />
                      </div>

                      <Input
                        label="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Smith"
                        required
                      />

                      <Input
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Head Coach"
                      />
                    </div>

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={handleSubmitOnboarding}
                        disabled={!fullName.trim()}
                        isLoading={loading}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-all"
                        size="lg"
                      >
                        Complete Setup
                        <IconCheck size={16} className="ml-2" />
                      </Button>
                      {error && (
                        <m.p
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-600 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center"
                        >
                          {error}
                        </m.p>
                      )}
                    </div>
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 3: Complete ─────────────────────────────────────── */}
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
                  {/* Success Icon with Celebration */}
                  <m.div variants={staggerItem} className="flex justify-center">
                    <div className="relative">
                      {/* Celebration particles */}
                      {[...Array(8)].map((_, i) => (
                        <m.div
                          key={i}
                          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                          style={{
                            background: i % 2 === 0
                              ? 'rgb(22, 163, 74)'
                              : 'rgb(74, 222, 128)',
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

                      {/* Glow */}
                      <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full scale-[2]" />

                      {/* Check Icon */}
                      <m.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
                        className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-xl shadow-green-900/20"
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

                  {/* Personalized Heading */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                      {orgName ? `${orgName} Golf is ready on GolfHelm` : 'Your team is ready!'}
                    </h1>
                    <p className="text-warm-500 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                      Share your team code with players to get them on board.
                    </p>
                  </m.div>

                  {/* Join Code Card */}
                  {joinCode && (
                    <m.div variants={staggerItem}>
                      <GlassCard glow="green" hover={false} padding="lg" className="rounded-2xl">
                        <div className="text-center">
                          <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-3">
                            Team Join Code
                          </p>
                          <p className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.25em] text-warm-900 mb-4">
                            {joinCode}
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCopyCode}
                            className="gap-2"
                          >
                            {copied ? (
                              <>
                                <IconCheck size={14} />
                                Copied!
                              </>
                            ) : (
                              <>
                                <IconCopy size={14} />
                                Copy Code
                              </>
                            )}
                          </Button>
                        </div>
                      </GlassCard>
                    </m.div>
                  )}

                  {/* Dashboard CTA */}
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
                </m.div>
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </div>
    </div>
  );
}

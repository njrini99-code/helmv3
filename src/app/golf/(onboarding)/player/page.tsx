'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { PageLoading } from '@/components/ui/loading';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
} from '@/components/icons';
import { StepIndicator, slideVariants, staggerContainer, staggerItem } from '@/components/golf/onboarding/StepIndicator';
import { ensurePlayerRecord, completePlayerOnboarding } from '@/app/golf/actions/onboarding';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'about' | 'profile' | 'complete';

const STEPS_CONFIG = [
  { id: 'about' as const, label: 'About You' },
  { id: 'profile' as const, label: 'Profile' },
  { id: 'complete' as const, label: 'Done' },
] as const;

const graduationYears = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + i);

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GolfPlayerOnboarding() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('about');
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // About You data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [graduationYear, setGraduationYear] = useState<number>(
    graduationYears[3] || new Date().getFullYear() + 3
  );
  const [handicap, setHandicap] = useState('');
  const [hometown, setHometown] = useState('');
  const [state, setState] = useState('');

  // Profile data
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [gpa, setGpa] = useState('');

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

      setUserId(user.id);

      // Ensure a golf_players record exists early
      await ensurePlayerRecord();

      // Check for existing player record
      const { data: player } = await supabase
        .from('golf_players')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (player) {
        if (player.onboarding_completed) {
          router.push('/golf/dashboard');
          return;
        }
        // Pre-fill existing data
        setFirstName(player.first_name || '');
        setLastName(player.last_name || '');
        setGraduationYear(
          player.graduation_year || graduationYears[3] || new Date().getFullYear() + 3
        );
        setHandicap(player.handicap?.toString() || '');
        setHometown(player.hometown || '');
        setState(player.state || '');
        setGpa(player.gpa?.toString() || '');
      }

      setAuthLoading(false);
    }

    checkAuth();
  }, [router, supabase, searchParams]);

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
    if (!userId) {
      setError('Your session timed out. Log back in to pick up where you left off.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Carried through from the invite link (signup → onboarding) so the
      // player auto-joins the inviting team on completion.
      const joinCode = searchParams.get('joinCode') ?? undefined;
      const result = await completePlayerOnboarding({
        firstName,
        lastName,
        gradYear: graduationYear,
        handicap: handicap ? parseFloat(handicap) : undefined,
        hometown: hometown || undefined,
        state: state || undefined,
        gpa: gpa ? parseFloat(gpa) : undefined,
      }, joinCode);

      if (!result.success) {
        setError(result.error || "Couldn't finish setting up your profile. Give it another go.");
        setLoading(false);
        return;
      }

      setLoading(false);
      goForward('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something threw us off. Give it another go.');
      setLoading(false);
    }
  }

  function handleGoToDashboard() {
    router.refresh();
    setTimeout(() => router.push('/golf/dashboard'), 150);
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  if (authLoading) return <PageLoading />;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-auth-golf relative">
      {/* Floating Orbs (CSS-driven, matches login/signup) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-primary-400/40 to-helm-primary-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-primary-400/25 to-helm-primary-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-primary-300/20 to-helm-primary-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LazyMotion features={domAnimation}>
          {/* Logo */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.1 })}
            className="mb-6 sm:mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-primary-500/25 rounded-full blur-xl scale-150" />
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

          {/* Step Indicator */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.2 })}
          >
            <StepIndicator currentStep={step} steps={STEPS_CONFIG} />
          </m.div>

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Step 1: About You ───────────────────────────────────── */}
            {step === 'about' && (
              <m.div
                key="about"
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
                      About you
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Help your coach get to know you
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div
                    variants={staggerItem}
                    className="auth-glass-card rounded-3xl p-6 sm:p-8"
                  >
                    <div className="space-y-5">
                      {/* Name */}
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="First Name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                          required
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in onboarding wizard step
                          autoFocus
                        />
                        <Input
                          label="Last Name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Smith"
                          required
                        />
                      </div>

                      {/* Golf Details */}
                      <div className="grid grid-cols-2 gap-3">
                        <NativeSelect
                          label="Graduation Year"
                          value={graduationYear.toString()}
                          onChange={(e) => setGraduationYear(parseInt(e.target.value))}
                        >
                          {graduationYears.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </NativeSelect>
                        <Input
                          label="Handicap Index"
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9+\-\.]*"
                          value={handicap}
                          onChange={(e) => setHandicap(e.target.value)}
                          placeholder="+2.4"
                          hint="USGA Handicap"
                        />
                      </div>

                      {/* Hometown */}
                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Hometown
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <Input
                              label="City"
                              value={hometown}
                              onChange={(e) => setHometown(e.target.value)}
                              placeholder="Austin"
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

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('profile')}
                        disabled={!firstName.trim() || !lastName.trim()}
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
                    <Button variant="ghost"
                      onClick={() => goBack('about')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  {/* Header */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Your profile
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Add a photo so your coach and teammates can recognize you
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
                          name={`${firstName} ${lastName}`.trim() || 'Player'}
                          onUploadComplete={(url) => setAvatarUrl(url)}
                          onRemove={() => setAvatarUrl(null)}
                        />
                      </div>

                      {/* GPA */}
                      <Input
                        label="GPA (optional)"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9\.]*"
                        value={gpa}
                        onChange={(e) => setGpa(e.target.value)}
                        placeholder="3.50"
                        hint="Helps your coach with eligibility tracking"
                      />
                    </div>

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={handleSubmitOnboarding}
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
                          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, delay: 0.3 + i * 0.04, ease: 'easeOut' })}
                        />
                      ))}

                      {/* Glow */}
                      <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full scale-[2]" />

                      {/* Check Icon */}
                      <m.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 })}
                        className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-900/20"
                      >
                        <m.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, type: 'spring', stiffness: 300 })}
                        >
                          <IconCheck size={40} className="text-white" />
                        </m.div>
                      </m.div>
                    </div>
                  </m.div>

                  {/* Personalized Heading */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                      Welcome, {firstName || 'Player'}!
                    </h1>
                    <p className="text-warm-500 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                      Your profile is ready. Head to your dashboard to see your team, track rounds, and connect with your coach.
                    </p>
                  </m.div>

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

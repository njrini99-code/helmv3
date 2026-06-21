'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Card } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconCopy,
} from '@/components/icons';
import { StepIndicator, slideVariants, staggerContainer, staggerItem } from '@/components/golf/onboarding/StepIndicator';
import { completeCoachOnboarding } from '@/app/golf/actions/onboarding';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'program' | 'profile' | 'complete';

const STEPS_CONFIG = [
  { id: 'program' as const, label: 'Program' },
  { id: 'profile' as const, label: 'Profile' },
  { id: 'complete' as const, label: 'Done' },
] as const;

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'NJCAA', 'Club'];

// Draft is kept in sessionStorage (per-tab, cleared on tab close) so an
// accidental refresh mid-wizard doesn't wipe entered program/profile data —
// including an uploaded avatar URL. Nothing hits the DB until final submit, and
// the draft is cleared once onboarding completes.
const COACH_DRAFT_KEY = 'golf-coach-onboarding-draft';

type CoachOnboardingDraft = {
  step: Step;
  orgName: string;
  division: string;
  conference: string;
  city: string;
  state: string;
  teamName: string;
  gender: 'mens' | 'womens';
  fullName: string;
  title: string;
  avatarUrl: string | null;
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GolfCoachOnboarding() {
  const prefersReducedMotion = useReducedMotion();
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
  const [gender, setGender] = useState<'mens' | 'womens'>('mens');

  // Profile data
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Completion data
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resume support: gates the persistence effect so we don't overwrite a saved
  // draft with empty initial state before hydration has run.
  const [draftHydrated, setDraftHydrated] = useState(false);

  // ─── Draft Resume (sessionStorage) ────────────────────────────────────────

  // Hydrate any in-progress draft once on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(COACH_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<CoachOnboardingDraft>;
        // Never resume onto the completion screen — that step owns a join code
        // produced by the server, which a draft can't reconstruct.
        if (d.step && d.step !== 'complete') setStep(d.step);
        if (typeof d.orgName === 'string') setOrgName(d.orgName);
        if (typeof d.division === 'string') setDivision(d.division);
        if (typeof d.conference === 'string') setConference(d.conference);
        if (typeof d.city === 'string') setCity(d.city);
        if (typeof d.state === 'string') setState(d.state);
        if (typeof d.teamName === 'string') setTeamName(d.teamName);
        if (d.gender === 'mens' || d.gender === 'womens') setGender(d.gender);
        if (typeof d.fullName === 'string' && d.fullName) setFullName(d.fullName);
        if (typeof d.title === 'string') setTitle(d.title);
        if (typeof d.avatarUrl === 'string') setAvatarUrl(d.avatarUrl);
      }
    } catch {
      // Corrupt/unavailable storage — start fresh, never block onboarding.
    }
    setDraftHydrated(true);
  }, []);

  // Persist the draft on any field change (skipped on the completion screen).
  useEffect(() => {
    if (!draftHydrated || step === 'complete') return;
    try {
      const draft: CoachOnboardingDraft = {
        step,
        orgName,
        division,
        conference,
        city,
        state,
        teamName,
        gender,
        fullName,
        title,
        avatarUrl,
      };
      sessionStorage.setItem(COACH_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full/unavailable — non-fatal; the wizard still works in-memory.
    }
  }, [draftHydrated, step, orgName, division, conference, city, state, teamName, gender, fullName, title, avatarUrl]);

  // ─── Auth Check ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      let user = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);

        if (!result) {
          router.replace('/golf/login');
          return;
        }

        const { data, error: authError } = result;
        if (authError) {
          router.replace('/golf/login');
          return;
        }

        if (data.user) {
          user = data.user;
          break;
        }
        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!user) {
        router.replace('/golf/login');
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

      // F024: a logged-in player must not be funnelled through the coach wizard.
      // Completing it would insert a stray golf_coaches row for a player account
      // (the users upsert uses ignoreDuplicates so role stays 'player'), leaving
      // the account half-coach/half-player. If this user is already a player,
      // send them to their dashboard instead of showing the coach onboarding.
      if (!coach) {
        const { data: existingPlayer } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingPlayer) {
          router.replace('/golf/dashboard');
          return;
        }
      }

      // Pre-fill name from auth metadata if available — but never clobber a
      // value the user already typed (and which a resumed draft restored).
      const meta = user.user_metadata;
      if (meta?.first_name && meta?.last_name) {
        setFullName((prev) => prev || `${meta.first_name} ${meta.last_name}`);
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
        gender,
        fullName,
        title: title || undefined,
        avatarUrl: avatarUrl || undefined,
      });

      if (!result.success) {
        setError(result.error || "Couldn't finish setting up your program. Give it another go.");
        setLoading(false);
        return;
      }

      // Onboarding succeeded — the program is persisted, so drop the draft.
      try {
        sessionStorage.removeItem(COACH_DRAFT_KEY);
      } catch {
        // Ignore — clearing the draft is best-effort.
      }

      setJoinCode(result.data?.joinCode || null);
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
                      A few details about your school and squad
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
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in onboarding wizard step
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

                      {/* Team */}
                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Team
                        </p>
                        <div className="space-y-3">
                          {/* Gender selector — pill toggle */}
                          <div>
                            <p className="text-xs font-medium text-warm-500 mb-2">Team Gender</p>
                            <div className="flex gap-2">
                              {(['mens', 'womens'] as const).map((g) => (
                                <Button
                                  key={g}
                                  type="button"
                                  onClick={() => setGender(g)}
                                  variant={gender === g ? 'primary' : 'secondary'}
                                  size="sm"
                                  className="flex-1"
                                >
                                  {g === 'mens' ? "Men's" : "Women's"}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <Input
                            label="Team Name (optional)"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder={gender === 'mens' ? "Men's Golf" : "Women's Golf"}
                            hint={orgName ? `Leave blank to default to "${orgName} Golf"` : "e.g., Men's Golf, Women's Golf"}
                          />
                        </div>
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
                    <Button variant="ghost"
                      onClick={() => goBack('program')}
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
                      {orgName ? `${orgName} Golf is ready on GolfHelm` : 'Your team is ready!'}
                    </h1>
                    <p className="text-warm-500 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                      Share your team code with players to get them on board.
                    </p>
                  </m.div>

                  {/* Join Code Card */}
                  {joinCode && (
                    <m.div variants={staggerItem}>
                      <Card variant="overlay" glow="green" hover={false} padding="lg" className="rounded-2xl">
                        <div className="text-center">
                          <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
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
                      </Card>
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

'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconUser,
  IconFlag,
  IconUsers,
} from '@/components/icons';
import { processTeamInvitation } from '@/app/baseball/actions/teams';

// ─── Types & Constants ──────────────────────────────────────────────────────

type Step = 'type' | 'about' | 'measurables' | 'team' | 'complete';

type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';

const PLAYER_TYPES = [
  { value: 'high_school' as const, label: 'High School Player', desc: 'Currently playing high school baseball', emoji: '🏫' },
  { value: 'showcase' as const, label: 'Showcase / Travel Ball', desc: 'Playing on a showcase or travel team', emoji: '⚾' },
  { value: 'juco' as const, label: 'JUCO Player', desc: 'Playing at a junior college', emoji: '🎓' },
  { value: 'college' as const, label: 'College Player', desc: 'Playing at a 4-year college', emoji: '🏟️' },
] as const;

const STEPS_CONFIG = [
  { id: 'about' as const, label: 'About You', Icon: IconFlag },
  { id: 'measurables' as const, label: 'Measurables', Icon: IconUser },
  { id: 'team' as const, label: 'Team', Icon: IconUsers },
  { id: 'complete' as const, label: 'Done', Icon: IconCheck },
];

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'INF', 'UTIL'];
const HANDEDNESS = ['R', 'L', 'S'];
const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

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
                  'w-8 h-8 rounded-full flex items-center justify-center transition-[color,background-color,border-color,box-shadow] duration-500 text-sm font-semibold',
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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BaseballPlayerOnboarding() {
  const router = useRouter();
  const supabase = createClient();
  const { user, player, loading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>('type');
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Player type
  const [playerType, setPlayerType] = useState<PlayerType | ''>('');

  // About You data
  const [firstName, setFirstName] = useState(player?.first_name || '');
  const [lastName, setLastName] = useState(player?.last_name || '');
  const [gradYear, setGradYear] = useState<number>(player?.grad_year ?? GRAD_YEARS[4] ?? new Date().getFullYear() + 4);
  const [city, setCity] = useState(player?.city || '');
  const [state, setState] = useState(player?.state || '');
  const [primaryPosition, setPrimaryPosition] = useState(player?.primary_position || '');
  const [secondaryPosition, setSecondaryPosition] = useState(player?.secondary_position || '');
  const [bats, setBats] = useState(player?.bats || '');
  const [throws_, setThrows] = useState(player?.throws || '');

  // Measurables data
  const [heightFeet, setHeightFeet] = useState<number>(player?.height_feet || 5);
  const [heightInches, setHeightInches] = useState<number>(player?.height_inches || 10);
  const [weight, setWeight] = useState<string>(player?.weight_lbs?.toString() || '');
  const [pitchVelo, setPitchVelo] = useState<string>(player?.pitch_velo?.toString() || '');
  const [exitVelo, setExitVelo] = useState<string>(player?.exit_velo?.toString() || '');
  const [sixtyTime, setSixtyTime] = useState<string>(player?.sixty_time?.toString() || '');

  // Team join state
  const [inviteCode, setInviteCode] = useState('');
  const [joiningTeam, setJoiningTeam] = useState(false);
  const [teamJoinError, setTeamJoinError] = useState('');
  const [teamJoined, setTeamJoined] = useState(false);
  const [teamName, setTeamName] = useState('');

  // ─── Auth Guard ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'player') {
      router.push('/baseball/login');
    } else if (player?.onboarding_completed) {
      router.push('/baseball/dashboard');
    }
  }, [authLoading, user, player, router]);

  if (authLoading || !user || user.role !== 'player' || player?.onboarding_completed) {
    return <PageLoading />;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  function goForward(to: Step) {
    setDirection(1);
    setStep(to);
  }

  function goBack(to: Step) {
    setDirection(-1);
    setStep(to);
  }

  // ─── Team Join ────────────────────────────────────────────────────────────

  async function handleJoinTeam() {
    if (!inviteCode.trim() || !player?.id) return;

    setJoiningTeam(true);
    setTeamJoinError('');

    try {
      const result = await processTeamInvitation(inviteCode.trim(), player.id);

      if (!result.success) {
        setTeamJoinError(result.error || 'Failed to join team');
        setJoiningTeam(false);
        return;
      }

      type TeamMemberWithTeam = { team_id: string; baseball_teams: { name: string } };
      const { data: teamMember } = await supabase
        .from('baseball_team_members')
        .select(`team_id, baseball_teams!inner (name)`)
        .eq('player_id', player.id)
        .order('joined_at', { ascending: false })
        .limit(1)
        .single() as unknown as { data: TeamMemberWithTeam | null };

      if (teamMember?.baseball_teams) {
        setTeamName(teamMember.baseball_teams.name);
      }

      setTeamJoined(true);
      setJoiningTeam(false);
    } catch (err) {
      setTeamJoinError(err instanceof Error ? err.message : 'Failed to join team');
      setJoiningTeam(false);
    }
  }

  // ─── Submit Onboarding ────────────────────────────────────────────────────

  async function handleComplete() {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      let completionScore = 40;
      if (secondaryPosition) completionScore += 5;
      if (bats && throws_) completionScore += 10;
      if (heightFeet && heightInches && weight) completionScore += 15;
      if (pitchVelo || exitVelo || sixtyTime) completionScore += 20;
      if (pitchVelo && exitVelo && sixtyTime) completionScore += 10;

      const { error: updateError } = await supabase
        .from('baseball_players')
        .update({
          first_name: firstName,
          last_name: lastName,
          grad_year: gradYear,
          city: city || null,
          state: state || null,
          primary_position: primaryPosition,
          secondary_position: secondaryPosition || null,
          bats: bats || null,
          throws: throws_ || null,
          height_feet: heightFeet,
          height_inches: heightInches,
          weight_lbs: weight ? parseInt(weight) : null,
          pitch_velo: pitchVelo ? parseFloat(pitchVelo) : null,
          exit_velo: exitVelo ? parseFloat(exitVelo) : null,
          sixty_time: sixtyTime ? parseFloat(sixtyTime) : null,
          player_type: playerType || undefined,
          onboarding_completed: true,
          profile_completion_percent: completionScore,
        })
        .eq('user_id', user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      const storedReturnTo = sessionStorage.getItem('baseball_signup_returnTo');
      if (storedReturnTo) {
        sessionStorage.removeItem('baseball_signup_returnTo');
        router.push(storedReturnTo);
      } else {
        const dashboardPath = playerType ? `/baseball/player/${playerType.replace('_', '-')}` : '/baseball/dashboard';
        router.push(dashboardPath);
      }
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-auth-baseball relative">
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-amber-400/40 to-helm-amber-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-amber-400/25 to-helm-amber-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-amber-300/20 to-helm-amber-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
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

        <LazyMotion features={domAnimation}>
          {/* Step Indicator - only after type selection */}
          {step !== 'type' && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <StepIndicator currentStep={step} />
            </m.div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            {/* ─── Pre-Step: Player Type Selection ─────────────────────── */}
            {step === 'type' && (
              <m.div
                key="type"
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
                      What type of player are you?
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      This determines your dashboard experience
                    </p>
                  </m.div>

                  <m.div variants={staggerItem} className="space-y-3">
                    {PLAYER_TYPES.map((opt) => (
                      <Button variant="ghost"
                        key={opt.value}
                        onClick={() => { setPlayerType(opt.value); setDirection(1); setStep('about'); }}
                        className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                            {opt.emoji}
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
                  {/* Back Button */}
                  <m.div variants={staggerItem}>
                    <Button variant="ghost"
                      onClick={() => goBack('type')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  {/* Header */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      About you
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Help coaches get to know you
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8">
                    <div className="space-y-5">
                      {/* Name */}
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="First Name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                          required
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

                      {/* Grad Year & Position */}
                      <div className="grid grid-cols-2 gap-3">
                        <NativeSelect
                          label="Graduation Year"
                          value={gradYear.toString()}
                          onChange={(e) => setGradYear(parseInt(e.target.value))}
                        >
                          {GRAD_YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </NativeSelect>
                        <NativeSelect
                          label="Primary Position"
                          value={primaryPosition}
                          onChange={(e) => setPrimaryPosition(e.target.value)}
                          required
                        >
                          <option value="">Select</option>
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </NativeSelect>
                      </div>

                      {/* Bats/Throws & Secondary Position */}
                      <div className="grid grid-cols-3 gap-3">
                        <NativeSelect
                          label="Bats"
                          value={bats}
                          onChange={(e) => setBats(e.target.value)}
                        >
                          <option value="">—</option>
                          {HANDEDNESS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </NativeSelect>
                        <NativeSelect
                          label="Throws"
                          value={throws_}
                          onChange={(e) => setThrows(e.target.value)}
                        >
                          <option value="">—</option>
                          {HANDEDNESS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </NativeSelect>
                        <NativeSelect
                          label="2nd Pos."
                          value={secondaryPosition}
                          onChange={(e) => setSecondaryPosition(e.target.value)}
                        >
                          <option value="">None</option>
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </NativeSelect>
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
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="Houston"
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
                        onClick={() => goForward('measurables')}
                        disabled={!firstName.trim() || !lastName.trim() || !primaryPosition}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-[background-color,box-shadow]"
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

            {/* ─── Step 2: Measurables ─────────────────────────────────── */}
            {step === 'measurables' && (
              <m.div
                key="measurables"
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
                      Measurables
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      Add your physical stats and metrics
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8">
                    <div className="space-y-5">
                      {/* Height & Weight */}
                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Physical
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <NativeSelect
                            label="Height (ft)"
                            value={heightFeet.toString()}
                            onChange={(e) => setHeightFeet(parseInt(e.target.value))}
                          >
                            {[4, 5, 6, 7].map((ft) => (
                              <option key={ft} value={ft}>{ft} ft</option>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            label="Height (in)"
                            value={heightInches.toString()}
                            onChange={(e) => setHeightInches(parseInt(e.target.value))}
                          >
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i} value={i}>{i} in</option>
                            ))}
                          </NativeSelect>
                          <Input
                            label="Weight (lbs)"
                            type="text"
                            inputMode="numeric"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            placeholder="175"
                          />
                        </div>
                      </div>

                      {/* Metrics */}
                      <div>
                        <p className="text-label font-semibold text-warm-400 uppercase tracking-wider mb-3">
                          Performance Metrics
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <Input
                            label="Pitch Velo"
                            type="text"
                            inputMode="decimal"
                            value={pitchVelo}
                            onChange={(e) => setPitchVelo(e.target.value)}
                            placeholder="85"
                            hint="mph"
                          />
                          <Input
                            label="Exit Velo"
                            type="text"
                            inputMode="decimal"
                            value={exitVelo}
                            onChange={(e) => setExitVelo(e.target.value)}
                            placeholder="90"
                            hint="mph"
                          />
                          <Input
                            label="60-Yard"
                            type="text"
                            inputMode="decimal"
                            value={sixtyTime}
                            onChange={(e) => setSixtyTime(e.target.value)}
                            placeholder="6.90"
                            hint="sec"
                          />
                        </div>
                        <p className="text-xs text-warm-400 mt-2">
                          All metrics are optional — you can add or update them later.
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('team')}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-[background-color,box-shadow]"
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

            {/* ─── Step 3: Join a Team ─────────────────────────────────── */}
            {step === 'team' && (
              <m.div
                key="team"
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
                      onClick={() => goBack('measurables')}
                      className="flex items-center gap-1.5 text-sm font-medium text-warm-600 hover:text-warm-800 transition-colors min-h-[44px] px-2 -ml-2 rounded-lg active:bg-warm-100"
                    >
                      <IconArrowLeft size={16} />
                      Back
                    </Button>
                  </m.div>

                  {/* Header */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                      Join a team
                    </h1>
                    <p className="text-warm-500 mt-2 text-sm sm:text-base">
                      {teamJoined
                        ? "You're on a team!"
                        : 'Have an invite code from your coach? Enter it below.'}
                    </p>
                  </m.div>

                  {/* Form Card */}
                  <m.div variants={staggerItem} className="auth-glass-card rounded-3xl p-6 sm:p-8">
                    {teamJoined ? (
                      <m.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-4"
                      >
                        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <IconCheck size={32} className="text-primary-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-warm-900 mb-1">
                          Team Joined!
                        </h3>
                        <p className="text-warm-600">
                          You are now a member of <span className="font-medium text-primary-600">{teamName}</span>
                        </p>
                      </m.div>
                    ) : (
                      <div className="space-y-5">
                        <div className="flex justify-center mb-2">
                          <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center">
                            <IconUsers size={24} className="text-primary-600" />
                          </div>
                        </div>

                        <Input
                          label="Team Invite Code"
                          value={inviteCode}
                          onChange={(e) => {
                            setInviteCode(e.target.value.toUpperCase());
                            setTeamJoinError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && inviteCode.trim() && !joiningTeam) {
                              e.preventDefault();
                              handleJoinTeam();
                            }
                          }}
                          placeholder="Enter code (e.g. ABC123)"
                          maxLength={20}
                          className="text-center tracking-widest font-mono text-lg"
                        />

                        {teamJoinError && (
                          <m.p
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-sm text-red-600 text-center bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                          >
                            {teamJoinError}
                          </m.p>
                        )}

                        <Button
                          onClick={handleJoinTeam}
                          disabled={!inviteCode.trim() || joiningTeam}
                          isLoading={joiningTeam}
                          className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 transition-[background-color,box-shadow]"
                        >
                          Join Team
                        </Button>

                        <p className="text-xs text-warm-400 text-center">
                          Don't have a code? You can join a team later from your dashboard.
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-8">
                      <Button
                        onClick={() => goForward('complete')}
                        className="w-full bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-[background-color,box-shadow]"
                        size="lg"
                      >
                        {teamJoined ? 'Continue' : 'Skip for Now'}
                        <IconArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </m.div>
                </m.div>
              </m.div>
            )}

            {/* ─── Step 4: Complete ─────────────────────────────────────── */}
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
                      <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full scale-[2]" />

                      {/* Check Icon */}
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

                  {/* Personalized Heading */}
                  <m.div variants={staggerItem} className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900 mb-2">
                      Welcome, {firstName || 'Player'}!
                    </h1>
                    <p className="text-warm-500 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                      Your profile is ready. Head to your dashboard to connect with your team and coaches.
                    </p>
                  </m.div>

                  {/* Dashboard CTA */}
                  <m.div variants={staggerItem} className="text-center">
                    <Button
                      size="lg"
                      onClick={handleComplete}
                      isLoading={loading}
                      className="w-full sm:w-auto px-10 bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15 transition-[background-color,box-shadow]"
                    >
                      Go to Dashboard
                      <IconArrowRight size={16} className="ml-2" />
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

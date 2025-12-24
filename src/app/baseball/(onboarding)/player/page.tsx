'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import { IconArrowRight, IconCheck, IconUser, IconUpload } from '@/components/icons';

type Step = 'welcome' | 'basic' | 'baseball' | 'physical' | 'metrics' | 'photo' | 'complete';

const positions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'INF', 'UTIL'];
const handedness = ['R', 'L', 'S'];
const gradYears = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

const STEPS = ['welcome', 'basic', 'baseball', 'physical', 'metrics', 'photo', 'complete'] as const;

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function PlayerOnboarding() {
  const router = useRouter();
  const supabase = createClient();
  const { user, player, loading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [firstName, setFirstName] = useState(player?.first_name || '');
  const [lastName, setLastName] = useState(player?.last_name || '');
  const [gradYear, setGradYear] = useState<number>(player?.grad_year ?? gradYears[4] ?? new Date().getFullYear() + 4);
  const [city, setCity] = useState(player?.city || '');
  const [state, setState] = useState(player?.state || '');

  const [primaryPosition, setPrimaryPosition] = useState(player?.primary_position || '');
  const [secondaryPosition, setSecondaryPosition] = useState(player?.secondary_position || '');
  const [bats, setBats] = useState(player?.bats || '');
  const [throws, setThrows] = useState(player?.throws || '');

  const [heightFeet, setHeightFeet] = useState<number>(player?.height_feet || 5);
  const [heightInches, setHeightInches] = useState<number>(player?.height_inches || 10);
  const [weight, setWeight] = useState<number>(player?.weight_lbs || 150);

  const [pitchVelo, setPitchVelo] = useState<string>(player?.pitch_velo?.toString() || '');
  const [exitVelo, setExitVelo] = useState<string>(player?.exit_velo?.toString() || '');
  const [sixtyTime, setSixtyTime] = useState<string>(player?.sixty_time?.toString() || '');

  if (authLoading) return <PageLoading />;

  if (!user || user.role !== 'player') {
    router.push('/baseball/login');
    return null;
  }

  if (player?.onboarding_completed) {
    router.push('/baseball/dashboard');
    return null;
  }

  const currentStepIndex = STEPS.indexOf(step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // Calculate profile completion
      let completionScore = 40; // Base score for onboarding
      if (secondaryPosition) completionScore += 5;
      if (bats && throws) completionScore += 10;
      if (heightFeet && heightInches && weight) completionScore += 15;
      if (pitchVelo || exitVelo || sixtyTime) completionScore += 20;
      if (pitchVelo && exitVelo && sixtyTime) completionScore += 10;

      const { error: updateError } = await supabase
        .from('players')
        .update({
          first_name: firstName,
          last_name: lastName,
          grad_year: gradYear,
          city: city || null,
          state: state || null,
          primary_position: primaryPosition,
          secondary_position: secondaryPosition || null,
          bats: bats || null,
          throws: throws || null,
          height_feet: heightFeet,
          height_inches: heightInches,
          weight_lbs: weight,
          pitch_velo: pitchVelo ? parseFloat(pitchVelo) : null,
          exit_velo: exitVelo ? parseFloat(exitVelo) : null,
          sixty_time: sixtyTime ? parseFloat(sixtyTime) : null,
          onboarding_completed: true,
          profile_completion_percent: completionScore,
        })
        .eq('user_id', user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      router.push('/baseball/dashboard');
      router.refresh();
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] via-[#F5F1EC] to-[#EAE6E1] relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-green-100/20 to-transparent rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [90, 0, 90],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-green-50/20 to-transparent rounded-full blur-3xl"
        />
      </div>

      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200/50 backdrop-blur-sm z-50">
        <motion.div
          className="h-full bg-gradient-to-r from-green-500 to-green-600"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-lg"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-8"
              >
                {/* Logo & Header */}
                <motion.div variants={staggerItem} className="text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="mb-6 inline-block"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                      <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-xl shadow-green-900/20">
                        <span className="text-white font-bold text-3xl">H</span>
                      </div>
                    </div>
                  </motion.div>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-3">
                    Let's build your profile
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    We'll help you create a profile that stands out to college coaches. This will take about 3 minutes.
                  </p>
                </motion.div>

                {/* Get Started Button */}
                <motion.div variants={staggerItem} className="text-center">
                  <Button
                    size="lg"
                    onClick={() => setStep('basic')}
                    className="px-8 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 hover:shadow-xl hover:shadow-green-900/30 transition-all"
                  >
                    Get Started
                    <IconArrowRight size={16} className="ml-2" />
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'basic' && (
            <motion.div
              key="basic"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-6"
              >
                <motion.div variants={staggerItem} className="text-center mb-8">
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    Step 1 of 5
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Basic Information</h2>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <div className="space-y-5">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Input
                        label="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                        required
                        autoFocus
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        label="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Smith"
                        required
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <NativeSelect
                        label="Graduation Year"
                        value={gradYear.toString()}
                        onChange={(e) => setGradYear(parseInt(e.target.value))}
                        required
                      >
                        {gradYears.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </NativeSelect>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <Input
                        label="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Houston"
                      />
                      <Input
                        label="State"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="TX"
                        maxLength={2}
                      />
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('welcome')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('baseball')}
                      disabled={!firstName || !lastName}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'baseball' && (
            <motion.div
              key="baseball"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-6"
              >
                <motion.div variants={staggerItem} className="text-center mb-8">
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    Step 2 of 5
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Baseball Info</h2>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <div className="space-y-5">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <NativeSelect
                        label="Primary Position"
                        value={primaryPosition}
                        onChange={(e) => setPrimaryPosition(e.target.value)}
                        required
                      >
                        <option value="">Select position</option>
                        {positions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </NativeSelect>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <NativeSelect
                        label="Secondary Position"
                        value={secondaryPosition}
                        onChange={(e) => setSecondaryPosition(e.target.value)}
                      >
                        <option value="">None</option>
                        {positions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </NativeSelect>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <NativeSelect
                        label="Bats"
                        value={bats}
                        onChange={(e) => setBats(e.target.value)}
                      >
                        <option value="">Select</option>
                        {handedness.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        label="Throws"
                        value={throws}
                        onChange={(e) => setThrows(e.target.value)}
                      >
                        <option value="">Select</option>
                        {handedness.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </NativeSelect>
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('basic')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('physical')}
                      disabled={!primaryPosition}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'physical' && (
            <motion.div
              key="physical"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-6"
              >
                <motion.div variants={staggerItem} className="text-center mb-8">
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    Step 3 of 5
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Physical Measurements</h2>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <div className="space-y-5">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-3">Height</label>
                      <div className="grid grid-cols-2 gap-4">
                        <NativeSelect
                          value={heightFeet.toString()}
                          onChange={(e) => setHeightFeet(parseInt(e.target.value))}
                        >
                          {[4, 5, 6, 7].map((ft) => (
                            <option key={ft} value={ft}>
                              {ft} ft
                            </option>
                          ))}
                        </NativeSelect>
                        <NativeSelect
                          value={heightInches.toString()}
                          onChange={(e) => setHeightInches(parseInt(e.target.value))}
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={i}>
                              {i} in
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        label="Weight (lbs)"
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(parseInt(e.target.value))}
                        placeholder="175"
                      />
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('baseball')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('metrics')}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'metrics' && (
            <motion.div
              key="metrics"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-6"
              >
                <motion.div variants={staggerItem} className="text-center mb-8">
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    Step 4 of 5
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Metrics</h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Add at least one metric. You can add more later.
                  </p>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <div className="space-y-5">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Input
                        label="Pitch Velocity (mph)"
                        type="number"
                        step="0.1"
                        value={pitchVelo}
                        onChange={(e) => setPitchVelo(e.target.value)}
                        placeholder="85.0"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        label="Exit Velocity (mph)"
                        type="number"
                        step="0.1"
                        value={exitVelo}
                        onChange={(e) => setExitVelo(e.target.value)}
                        placeholder="90.0"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Input
                        label="60-Yard Time (sec)"
                        type="number"
                        step="0.01"
                        value={sixtyTime}
                        onChange={(e) => setSixtyTime(e.target.value)}
                        placeholder="6.90"
                      />
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('physical')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('photo')}
                      disabled={!pitchVelo && !exitVelo && !sixtyTime}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'photo' && (
            <motion.div
              key="photo"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-6"
              >
                <motion.div variants={staggerItem} className="text-center mb-8">
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    Step 5 of 5
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Profile Photo</h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Add a profile photo to help coaches recognize you. You can skip this and add one later.
                  </p>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center mb-6"
                  >
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4 shadow-sm">
                      <IconUser size={48} className="text-slate-400" />
                    </div>
                    <Button variant="secondary" size="sm">
                      <IconUpload size={16} className="mr-2" />
                      Upload Photo
                    </Button>
                    <p className="text-xs text-slate-500 mt-2">JPG or PNG, max 5MB</p>
                  </motion.div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('metrics')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setStep('complete')}
                      className="flex-1"
                    >
                      Skip
                    </Button>
                    <Button
                      onClick={() => setStep('complete')}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Complete
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'complete' && (
            <motion.div
              key="complete"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-lg"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-8"
              >
                {/* Success Icon */}
                <motion.div variants={staggerItem} className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                    className="mb-6 inline-block"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                      <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-xl shadow-green-900/20">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.4 }}
                        >
                          <IconCheck size={40} className="text-white" />
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    Your profile is ready!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    You're all set to start connecting with college coaches.
                  </p>
                </motion.div>

                {/* CTA Button */}
                <motion.div variants={staggerItem} className="text-center">
                  <Button
                    size="lg"
                    onClick={handleComplete}
                    loading={loading}
                    className="px-8 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 hover:shadow-xl hover:shadow-green-900/30 transition-all"
                  >
                    Go to Dashboard
                  </Button>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-600 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                    >
                      {error}
                    </motion.p>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

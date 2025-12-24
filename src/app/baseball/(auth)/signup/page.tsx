'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser, IconArrowRight, IconCheck } from '@/components/icons';
import type { CoachType, PlayerType } from '@/lib/types';

type Role = 'coach' | 'player';
type Step = 'role' | 'type' | 'details';

const STEPS = ['role', 'type', 'details'] as const;

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

const progressVariants = {
  initial: { scaleX: 0 },
  animate: { scaleX: 1 },
};

export default function SignupPage() {
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [coachType, setCoachType] = useState<CoachType | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const currentStepIndex = STEPS.indexOf(step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || (role === 'coach' && !coachType) || (role === 'player' && !playerType)) return;

    setLoading(true);
    setError('');

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. No user returned.');
        setLoading(false);
        return;
      }

      // Step 2: Upsert user record with role
      const userEmail = authData.user.email || email;
      if (!userEmail) {
        setError('Email is required');
        setLoading(false);
        return;
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: userEmail,
            role,
          },
          {
            onConflict: 'id',
          }
        );

      if (userError) {
        setError(`Failed to set user role: ${userError.message}`);
        setLoading(false);
        return;
      }

      // Step 3: Create role-specific record
      if (role === 'coach') {
        const { error: coachError } = await supabase.from('coaches').insert({
          user_id: authData.user.id,
          coach_type: coachType!,
          full_name: fullName,
          onboarding_completed: false
        });

        if (coachError) {
          setError(`Failed to create coach profile: ${coachError.message}`);
          setLoading(false);
          return;
        }
      } else {
        const [firstName, ...lastParts] = fullName.split(' ');
        const { error: playerError } = await supabase.from('players').insert({
          user_id: authData.user.id,
          player_type: playerType!,
          first_name: firstName,
          last_name: lastParts.join(' ') || '',
          recruiting_activated: playerType !== 'college',
          onboarding_completed: false,
          profile_completion_percent: 0
        });

        if (playerError) {
          setError(`Failed to create player profile: ${playerError.message}`);
          setLoading(false);
          return;
        }
      }

      // Success - redirect to onboarding
      const onboardingPath = role === 'coach' ? '/baseball/coach' : '/baseball/player';
      router.push(onboardingPath);
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
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
          {step === 'role' && (
            <motion.div
              key="role"
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
                      <img
                        src="/helm-baseball-logo.png"
                        alt="BaseballHelm"
                        className="h-20 w-auto relative z-10"
                      />
                    </div>
                  </motion.div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 bg-clip-text">
                    Welcome to BaseballHelm
                  </h1>
                  <p className="text-slate-600 mt-3 text-lg">Choose your path to get started</p>
                </motion.div>

                {/* Role Cards */}
                <motion.div variants={staggerItem} className="space-y-4">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setRole('coach'); setStep('type'); }}
                    className="group w-full p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 shadow-xl shadow-slate-900/5 text-left transition-all hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-900/10 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-start gap-5">
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ duration: 0.5 }}
                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-900/20"
                      >
                        <IconUsers size={28} className="text-white" />
                      </motion.div>
                      <div className="flex-1">
                        <p className="text-xl font-bold text-slate-900 mb-2 group-hover:text-green-600 transition-colors">Coach</p>
                        <p className="text-slate-600 leading-relaxed">Discover and recruit talented athletes for your program</p>
                      </div>
                      <motion.div
                        initial={{ x: -10, opacity: 0 }}
                        whileHover={{ x: 0, opacity: 1 }}
                        className="text-green-600"
                      >
                        <IconArrowRight size={24} />
                      </motion.div>
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setRole('player'); setStep('type'); }}
                    className="group w-full p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 shadow-xl shadow-slate-900/5 text-left transition-all hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-900/10 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-start gap-5">
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ duration: 0.5 }}
                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-900/20"
                      >
                        <IconUser size={28} className="text-white" />
                      </motion.div>
                      <div className="flex-1">
                        <p className="text-xl font-bold text-slate-900 mb-2 group-hover:text-green-600 transition-colors">Player</p>
                        <p className="text-slate-600 leading-relaxed">Showcase your skills and connect with college programs</p>
                      </div>
                      <motion.div
                        initial={{ x: -10, opacity: 0 }}
                        whileHover={{ x: 0, opacity: 1 }}
                        className="text-green-600"
                      >
                        <IconArrowRight size={24} />
                      </motion.div>
                    </div>
                  </motion.button>
                </motion.div>

                {/* Footer Links */}
                <motion.div variants={staggerItem} className="space-y-4">
                  <p className="text-center text-slate-600">
                    Already have an account?{' '}
                    <Link href="/baseball/login" className="text-green-600 font-semibold hover:text-green-700 transition-colors">
                      Sign in
                    </Link>
                  </p>
                  <p className="text-center">
                    <Link href="/" className="text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-2 text-sm">
                      <span>←</span> Back to HelmLabs
                    </Link>
                  </p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'type' && (
            <motion.div
              key="type"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl"
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-8"
              >
                {/* Header */}
                <motion.div variants={staggerItem} className="text-center">
                  <div className="mb-6 inline-block">
                    <img
                      src="/helm-baseball-logo.png"
                      alt="BaseballHelm"
                      className="h-16 w-auto"
                    />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    {role === 'coach' ? 'Choose your program type' : 'Select your player type'}
                  </h1>
                  <p className="text-slate-600 mt-3 capitalize">
                    Signing up as a {role}
                  </p>
                </motion.div>

                {/* Type Selection */}
                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  {role === 'coach' ? (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { value: 'college', label: 'College', desc: 'Recruit players for your program', emoji: '🎓' },
                        { value: 'high_school', label: 'High School', desc: 'Manage and develop your team', emoji: '🏫' },
                        { value: 'juco', label: 'JUCO', desc: 'Recruit and manage players', emoji: '🏛️' },
                        { value: 'showcase', label: 'Showcase', desc: 'Multi-team organization', emoji: '⭐' },
                      ].map((type, index) => (
                        <motion.button
                          key={type.value}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setCoachType(type.value as CoachType)}
                          className={cn(
                            'relative p-6 border-2 rounded-2xl text-left transition-all group overflow-hidden',
                            coachType === type.value
                              ? 'border-green-500 bg-green-50 shadow-lg shadow-green-900/10'
                              : 'border-slate-200 bg-white hover:border-green-200 hover:shadow-lg'
                          )}
                        >
                          {coachType === type.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-3 right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                            >
                              <IconCheck size={14} className="text-white" />
                            </motion.div>
                          )}
                          <div className="text-3xl mb-3">{type.emoji}</div>
                          <p className="font-bold text-slate-900 mb-2">{type.label}</p>
                          <p className="text-sm text-slate-600 leading-relaxed">{type.desc}</p>
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { value: 'high_school', label: 'High School', desc: 'High school team player', emoji: '🎓' },
                        { value: 'showcase', label: 'Showcase', desc: 'Travel ball player', emoji: '⚾' },
                        { value: 'juco', label: 'JUCO', desc: 'Transfer track player', emoji: '🏛️' },
                        { value: 'college', label: 'College', desc: 'Current college player', emoji: '🏆' },
                      ].map((type, index) => (
                        <motion.button
                          key={type.value}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setPlayerType(type.value as PlayerType)}
                          className={cn(
                            'relative p-6 border-2 rounded-2xl text-left transition-all group overflow-hidden',
                            playerType === type.value
                              ? 'border-green-500 bg-green-50 shadow-lg shadow-green-900/10'
                              : 'border-slate-200 bg-white hover:border-green-200 hover:shadow-lg'
                          )}
                        >
                          {playerType === type.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-3 right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                            >
                              <IconCheck size={14} className="text-white" />
                            </motion.div>
                          )}
                          <div className="text-3xl mb-3">{type.emoji}</div>
                          <p className="font-bold text-slate-900 mb-2">{type.label}</p>
                          <p className="text-sm text-slate-600 leading-relaxed">{type.desc}</p>
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex gap-4 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('role')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('details')}
                      disabled={role === 'coach' ? !coachType : !playerType}
                      className="flex-1"
                    >
                      Continue <IconArrowRight size={18} className="ml-2" />
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              key="details"
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
                className="space-y-8"
              >
                {/* Header */}
                <motion.div variants={staggerItem} className="text-center">
                  <div className="mb-6 inline-block">
                    <img
                      src="/helm-baseball-logo.png"
                      alt="BaseballHelm"
                      className="h-16 w-auto"
                    />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Create your account
                  </h1>
                  <div className="mt-3 flex items-center justify-center gap-2 text-slate-600">
                    <span className="capitalize">{role}</span>
                    <span>•</span>
                    <span className="font-semibold text-green-600">
                      {role === 'coach'
                        ? coachType?.replace('_', ' ')
                        : playerType?.replace('_', ' ')
                      }
                    </span>
                  </div>
                </motion.div>

                {/* Form */}
                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Input
                        label="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Smith"
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
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Input
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        hint="Minimum 6 characters"
                      />
                    </motion.div>

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <Button type="submit" className="w-full" loading={loading}>
                        {loading ? 'Creating your account...' : 'Create account'}
                      </Button>
                    </motion.div>
                  </form>

                  <button
                    onClick={() => setStep('type')}
                    className="w-full text-center text-sm text-slate-500 mt-6 hover:text-slate-700 transition-colors"
                  >
                    ← Change type
                  </button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import { IconArrowRight, IconCheck, IconUser, IconUpload } from '@/components/icons';

// Player year is not stored in DB - just used for UI display
type GolfPlayerYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'fifth_year' | 'graduate';

type Step = 'welcome' | 'basic' | 'golf' | 'academic' | 'photo' | 'complete';

const years: { value: GolfPlayerYear; label: string }[] = [
  { value: 'freshman', label: 'Freshman' },
  { value: 'sophomore', label: 'Sophomore' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
  { value: 'fifth_year', label: 'Fifth Year' },
  { value: 'graduate', label: 'Graduate' },
];

const graduationYears = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + i);

const STEPS = ['welcome', 'basic', 'golf', 'academic', 'photo', 'complete'] as const;

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

export default function GolfPlayerOnboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  // Form data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hometown, setHometown] = useState('');
  const [state, setState] = useState('');

  // Golf info
  const [year, setYear] = useState<GolfPlayerYear>('freshman');
  const [graduationYear, setGraduationYear] = useState<number>(graduationYears[3] || new Date().getFullYear() + 3);
  const [handicap, setHandicap] = useState<string>('');

  // Academic info
  const [major, setMajor] = useState('');
  const [gpa, setGpa] = useState<string>('');

  // Check auth and player data on mount
  useEffect(() => {
    async function checkAuth() {
      // Try multiple times to get the session (handles propagation delays after signup)
      let user = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          user = data.user;
          break;
        }
        // Wait between attempts
        if (attempt < 4) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!user) {
        router.push('/golf/login');
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');

      // Check for existing player record (use maybeSingle since record may not exist yet)
      const { data: player } = await supabase
        .from('golf_players')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (player) {
        setPlayerId(player.id);
        if (player.onboarding_completed) {
          // Player already completed onboarding, redirect to dashboard
          router.push('/golf/dashboard');
          return;
        }
        // Pre-fill existing data (use correct column names from golf_players schema)
        setFirstName(player.first_name || '');
        setLastName(player.last_name || '');
        setPhone(player.phone || '');
        setHometown(player.hometown || '');  // Column is 'hometown', not 'city'
        setState(player.state || '');
        setYear('freshman'); // Year is not stored in DB, use default
        setGraduationYear(player.graduation_year || graduationYears[3] || new Date().getFullYear() + 3);  // Column is 'graduation_year', not 'grad_year'
        setHandicap(player.handicap?.toString() || '');
        setMajor(''); // Major is not stored in golf_players
        setGpa(player.gpa?.toString() || '');
      }

      setAuthLoading(false);
    }

    checkAuth();
  }, [router, supabase, searchParams]);

  if (authLoading) return <PageLoading />;

  const currentStepIndex = STEPS.indexOf(step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  // Calculate profile completion percentage based on filled fields
  const calculateProfileCompletion = (): number => {
    // Define fields and their weights
    const fields = [
      { value: firstName, weight: 15, required: true },
      { value: lastName, weight: 15, required: true },
      { value: email, weight: 10, required: false },
      { value: phone, weight: 5, required: false },
      { value: hometown, weight: 5, required: false },
      { value: state, weight: 5, required: false },
      { value: graduationYear, weight: 15, required: true },
      { value: handicap, weight: 20, required: false },
      { value: gpa, weight: 10, required: false },
    ];

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const field of fields) {
      totalWeight += field.weight;
      // Check if field has a value
      const hasValue = typeof field.value === 'boolean'
        ? field.value
        : field.value !== null && field.value !== undefined && field.value !== '';
      if (hasValue) {
        earnedWeight += field.weight;
      }
    }

    return Math.round((earnedWeight / totalWeight) * 100);
  };

  const handleComplete = async () => {
    if (!userId) {
      console.error('[Player Onboarding] No userId available');
      return;
    }

    console.log('[Player Onboarding] Starting completion...', { userId, playerId });
    setLoading(true);
    setError('');

    try {
      // Get current user for email
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error('[Player Onboarding] Auth error:', authError);
        throw new Error('Authentication error: ' + authError.message);
      }

      if (!user) {
        console.error('[Player Onboarding] No user found in session');
        throw new Error('No authenticated user found. Please log in again.');
      }

      console.log('[Player Onboarding] Auth user:', { id: user.id, email: user.email });

      // IMPORTANT: Ensure the users table record exists
      // The trigger should create it, but let's make sure
      // Note: users table only has: id, email, role, created_at, updated_at (no sport column)
      const { error: usersError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email || '',
          role: 'player',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
          ignoreDuplicates: true,
        });

      if (usersError) {
        console.warn('[Player Onboarding] Users upsert warning:', usersError);
        // Continue anyway - the record might already exist
      } else {
        console.log('[Player Onboarding] Users table upsert successful');
      }

      // Calculate profile completion percentage
      const profileCompletionPercent = calculateProfileCompletion();
      console.log('[Player Onboarding] Profile completion:', profileCompletionPercent);

      // Note: golf_players table has:
      // - graduation_year (not grad_year)
      // - hometown (not city)
      // - profile_complete (boolean, not profile_completion_percent)
      const updateData = {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        hometown: hometown || null,
        state: state || null,
        graduation_year: graduationYear,
        handicap: handicap ? parseFloat(handicap) : null,
        gpa: gpa ? parseFloat(gpa) : null,
        onboarding_completed: true,
        profile_complete: profileCompletionPercent >= 80, // Boolean based on completion threshold
      };

      console.log('[Player Onboarding] Update data:', updateData);

      if (playerId) {
        // Update existing player by ID
        console.log('[Player Onboarding] Updating existing player:', playerId);
        const { data: updateResult, error: updateError } = await supabase
          .from('golf_players')
          .update(updateData)
          .eq('id', playerId)
          .select();

        if (updateError) {
          console.error('[Player Onboarding] Update error:', updateError);
          throw updateError;
        }
        console.log('[Player Onboarding] Update successful:', updateResult);
      } else {
        // Check if a player record already exists for this user (trigger might have created it)
        console.log('[Player Onboarding] Checking for existing player record...');
        const { data: existingPlayer, error: checkError } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          console.error('[Player Onboarding] Error checking existing player:', checkError);
        }

        if (existingPlayer) {
          // Update existing record
          console.log('[Player Onboarding] Found existing player, updating:', existingPlayer.id);
          const { data: updateResult, error: updateError } = await supabase
            .from('golf_players')
            .update({
              ...updateData,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingPlayer.id)
            .select();

          if (updateError) {
            console.error('[Player Onboarding] Update error:', updateError);
            throw updateError;
          }
          console.log('[Player Onboarding] Update successful:', updateResult);
        } else {
          // Insert new record
          console.log('[Player Onboarding] No existing player, inserting new record...');
          const { data: insertResult, error: insertError } = await supabase
            .from('golf_players')
            .insert({
              user_id: userId,
              ...updateData,
            })
            .select();

          if (insertError) {
            console.error('[Player Onboarding] Insert error:', {
              message: insertError.message,
              code: insertError.code,
              details: insertError.details,
              hint: insertError.hint,
              full: JSON.stringify(insertError),
            });
            throw new Error(insertError.message || 'Failed to create player record');
          }
          console.log('[Player Onboarding] Insert successful:', insertResult);
        }
      }

      // Verify the record was saved correctly
      console.log('[Player Onboarding] Verifying saved record...');
      const { data: verifyPlayer, error: verifyError } = await supabase
        .from('golf_players')
        .select('id, user_id, onboarding_completed, first_name, last_name')
        .eq('user_id', userId)
        .single();

      if (verifyError) {
        console.error('[Player Onboarding] Verification error:', verifyError);
      } else {
        console.log('[Player Onboarding] Verified player record:', verifyPlayer);
      }

      // CRITICAL: Call router.refresh() FIRST to invalidate cache and propagate
      // the session cookies, THEN navigate. This matches the pattern used in signup.
      console.log('[Player Onboarding] Calling router.refresh()...');
      router.refresh();

      // Wait for cache to invalidate and database write to commit
      console.log('[Player Onboarding] Waiting 150ms for cache invalidation...');
      await new Promise(resolve => setTimeout(resolve, 150));

      // Navigate to dashboard - players can join a team from their settings
      console.log('[Player Onboarding] Navigating to /golf/dashboard...');
      router.push('/golf/dashboard');
    } catch (err: unknown) {
      console.error('[Player Onboarding] Caught error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred. Please try again.';
      setError(errorMessage);
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
                      <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl scale-150" />
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <img
                          src="/helm.transparent. golf-logo.png"
                          alt="GolfHelm"
                          className="w-20 h-20 object-contain"
                        />
                      </div>
                    </div>
                  </motion.div>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-3">
                    Welcome to GolfHelm!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    Let's set up your player profile. This will help your coach track your progress and manage the team.
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
                    Step 1 of 4
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
                      className="grid grid-cols-2 gap-4"
                    >
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
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Input
                        label="Phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <Input
                        label="Hometown"
                        value={hometown}
                        onChange={(e) => setHometown(e.target.value)}
                        placeholder="Austin"
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
                      onClick={() => setStep('golf')}
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

          {step === 'golf' && (
            <motion.div
              key="golf"
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
                    Step 2 of 4
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Golf Information</h2>
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
                        label="Year"
                        value={year}
                        onChange={(e) => setYear(e.target.value as GolfPlayerYear)}
                      >
                        {years.map((y) => (
                          <option key={y.value} value={y.value}>{y.label}</option>
                        ))}
                      </NativeSelect>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <NativeSelect
                        label="Graduation Year"
                        value={graduationYear.toString()}
                        onChange={(e) => setGraduationYear(parseInt(e.target.value))}
                      >
                        {graduationYears.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </NativeSelect>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Input
                        label="Handicap Index"
                        type="number"
                        step="0.1"
                        value={handicap}
                        onChange={(e) => setHandicap(e.target.value)}
                        placeholder="5.2"
                        hint="Your official USGA Handicap Index"
                      />
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
                      onClick={() => setStep('academic')}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'academic' && (
            <motion.div
              key="academic"
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
                    Step 3 of 4
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Academic Information</h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Optional, but helps your coach with scheduling and eligibility.
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
                        label="Major"
                        value={major}
                        onChange={(e) => setMajor(e.target.value)}
                        placeholder="Business Administration"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        label="GPA"
                        type="number"
                        step="0.01"
                        min="0"
                        max="4.0"
                        value={gpa}
                        onChange={(e) => setGpa(e.target.value)}
                        placeholder="3.50"
                      />
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('golf')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('photo')}
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
                    Step 4 of 4
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Profile Photo</h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Add a profile photo so your coach and teammates can recognize you.
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
                      onClick={() => setStep('academic')}
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
                      Next
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
                    You're all set!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    Your profile is ready. You can now access your team dashboard and start tracking your rounds.
                  </p>
                </motion.div>

                {/* CTA Button */}
                <motion.div variants={staggerItem} className="text-center">
                  <Button
                    size="lg"
                    onClick={handleComplete}
                    isLoading={loading}
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

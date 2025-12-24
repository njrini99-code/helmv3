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
import { cn } from '@/lib/utils';

type Step = 'welcome' | 'program' | 'profile' | 'branding' | 'complete';
type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';

const divisions = ['D1', 'D2', 'D3', 'NAIA'];

const STEPS = ['welcome', 'program', 'profile', 'branding', 'complete'] as const;

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

export default function CoachOnboarding() {
  const router = useRouter();
  const supabase = createClient();
  const { user, coach, loading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [coachType, setCoachType] = useState<CoachType>(coach?.coach_type || 'college');
  const [schoolName, setSchoolName] = useState(coach?.school_name || '');
  const [division, setDivision] = useState(coach?.program_division || '');
  const [conference, setConference] = useState(coach?.conference || '');
  const [schoolCity, setSchoolCity] = useState(coach?.school_city || '');
  const [schoolState, setSchoolState] = useState(coach?.school_state || '');

  const [fullName, setFullName] = useState(coach?.full_name || '');
  const [coachTitle, setCoachTitle] = useState(coach?.coach_title || '');
  const [email, setEmail] = useState(coach?.email_contact || user?.email || '');
  const [phone, setPhone] = useState(coach?.phone || '');
  const [about] = useState(coach?.about || '');

  if (authLoading) return <PageLoading />;

  if (!user || user.role !== 'coach') {
    router.push('/baseball/login');
    return null;
  }

  if (coach?.onboarding_completed) {
    router.push('/baseball/dashboard');
    return null;
  }

  const currentStepIndex = STEPS.indexOf(step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      if (!user) {
        router.push('/baseball/login');
        return;
      }

      // Step 1: Create organization
      const orgType = coachType === 'college' ? 'college'
        : coachType === 'juco' ? 'juco'
        : coachType === 'high_school' ? 'high_school'
        : 'showcase_org';

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: schoolName,
          type: orgType,
          division: division || null,
          conference: conference || null,
          location_city: schoolCity || null,
          location_state: schoolState || null,
        })
        .select()
        .single();

      if (orgError) {
        console.error('Organization error:', orgError);
        setError(`Failed to create organization: ${orgError.message}`);
        setLoading(false);
        return;
      }

      // Step 2: Update coach record with organization_id
      const { error: updateError } = await supabase
        .from('coaches')
        .update({
          coach_type: coachType,
          organization_id: org.id,
          full_name: fullName,
          coach_title: coachTitle,
          email_contact: email,
          phone: phone || null,
          school_name: schoolName,
          school_city: schoolCity || null,
          school_state: schoolState || null,
          program_division: division || null,
          conference: conference || null,
          about: about || null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Coach update error:', updateError);
        setError(updateError.message);
        setLoading(false);
        return;
      }

      router.push('/baseball/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Onboarding error:', err);
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
              className="w-full max-w-2xl"
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
                    Welcome to Helm Sports Labs!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    Let's set up your program in 2 minutes. You'll be discovering talent in no time.
                  </p>
                </motion.div>

                {/* Coach Type Selection */}
                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5 max-w-md mx-auto"
                >
                  <label className="block text-sm font-semibold text-slate-700 mb-4">
                    Select your program type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'college', label: 'College', emoji: '🎓' },
                      { value: 'juco', label: 'JUCO', emoji: '⚾' },
                      { value: 'high_school', label: 'High School', emoji: '🏫' },
                      { value: 'showcase', label: 'Showcase', emoji: '✨' },
                    ].map((type) => (
                      <motion.button
                        key={type.value}
                        whileHover={{ scale: 1.05, y: -4 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCoachType(type.value as CoachType)}
                        className={cn(
                          'relative p-4 border-2 rounded-xl text-sm font-medium transition-all group overflow-hidden',
                          coachType === type.value
                            ? 'border-green-500 bg-green-50 text-green-700 shadow-lg shadow-green-900/10'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-green-200 hover:shadow-md'
                        )}
                      >
                        {coachType === type.value && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                          >
                            <IconCheck size={12} className="text-white" />
                          </motion.div>
                        )}
                        <div className="text-2xl mb-2">{type.emoji}</div>
                        <div>{type.label}</div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Get Started Button */}
                <motion.div variants={staggerItem} className="text-center">
                  <Button
                    size="lg"
                    onClick={() => setStep('program')}
                    className="px-8 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 hover:shadow-xl hover:shadow-green-900/30 transition-all"
                  >
                    Get Started
                    <IconArrowRight size={16} className="ml-2" />
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'program' && (
            <motion.div
              key="program"
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
                    Step 1 of 3
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Program Information</h2>
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
                        label="School/Organization Name"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="Texas A&M University"
                        required
                        autoFocus
                      />
                    </motion.div>

                    {(coachType === 'college' || coachType === 'juco') && (
                      <>
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 }}
                        >
                          <NativeSelect
                            label="Division"
                            value={division}
                            onChange={(e) => setDivision(e.target.value)}
                          >
                            <option value="">Select division</option>
                            {divisions.map((div) => (
                              <option key={div} value={div}>
                                {div}
                              </option>
                            ))}
                          </NativeSelect>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 }}
                        >
                          <Input
                            label="Conference"
                            value={conference}
                            onChange={(e) => setConference(e.target.value)}
                            placeholder="SEC"
                          />
                        </motion.div>
                      </>
                    )}

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <Input
                        label="City"
                        value={schoolCity}
                        onChange={(e) => setSchoolCity(e.target.value)}
                        placeholder="College Station"
                      />
                      <Input
                        label="State"
                        value={schoolState}
                        onChange={(e) => setSchoolState(e.target.value)}
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
                      onClick={() => setStep('profile')}
                      disabled={!schoolName}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'profile' && (
            <motion.div
              key="profile"
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
                    Step 2 of 3
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Your Profile</h2>
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
                        label="Title/Role"
                        value={coachTitle}
                        onChange={(e) => setCoachTitle(e.target.value)}
                        placeholder="Head Coach"
                        required
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="coach@school.edu"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
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
                      transition={{ delay: 0.6 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-3">
                        Photo (optional)
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shadow-sm">
                          <IconUser size={28} className="text-slate-400" />
                        </div>
                        <Button variant="secondary" size="sm">
                          <IconUpload size={16} className="mr-2" />
                          Upload Photo
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">JPG or PNG, max 5MB</p>
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('program')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('branding')}
                      disabled={!fullName || !coachTitle}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'branding' && (
            <motion.div
              key="branding"
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
                    Step 3 of 3
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Branding</h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Customize your program's appearance. You can skip this and update it later.
                  </p>
                </motion.div>

                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5"
                >
                  <div className="space-y-6">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-3">
                        Program Logo
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shadow-sm">
                          <span className="text-3xl font-bold text-slate-400">
                            {schoolName ? schoolName.charAt(0).toUpperCase() : 'L'}
                          </span>
                        </div>
                        <Button variant="secondary" size="sm">
                          <IconUpload size={16} className="mr-2" />
                          Upload Logo
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Square PNG or SVG, max 2MB</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-3">
                        Primary Color
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-green-600 border-2 border-slate-200 shadow-sm" />
                        <div className="text-sm text-slate-600">
                          <p className="font-medium text-slate-900">Kelly Green</p>
                          <p className="text-xs text-slate-500">#16A34A (default)</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('profile')}
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
                    Your program is ready!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    {coachType === 'college' || coachType === 'juco'
                      ? "You're all set to start discovering recruits."
                      : "You're all set to start managing your team."}
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
                    {coachType === 'college' || coachType === 'juco'
                      ? 'Find your first recruit'
                      : 'Invite your first player'}
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

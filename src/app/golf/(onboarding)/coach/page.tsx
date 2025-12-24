'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { IconArrowRight, IconCheck, IconUser, IconUpload } from '@/components/icons';

type Step = 'welcome' | 'organization' | 'team' | 'profile' | 'complete';

const divisions = ['D1', 'D2', 'D3', 'NAIA', 'NJCAA', 'Club'];

const STEPS = ['welcome', 'organization', 'team', 'profile', 'complete'] as const;

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

export default function GolfCoachOnboarding() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Organization data
  const [orgName, setOrgName] = useState('');
  const [division, setDivision] = useState('');
  const [conference, setConference] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Team data
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('2024-25');

  // Profile data
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const currentStepIndex = STEPS.indexOf(step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/golf/login');
        return;
      }

      // Step 1: Create organization
      const { data: org, error: orgError } = await supabase
        .from('golf_organizations')
        .insert({
          name: orgName,
          division: division || null,
          conference: conference || null,
          city: city || null,
          state: state || null,
        })
        .select()
        .single();

      if (orgError) {
        console.error('Org error:', orgError);
        setError(`Failed to create organization: ${orgError.message}`);
        setLoading(false);
        return;
      }

      // Step 2: Create team
      const { data: team, error: teamError } = await supabase
        .from('golf_teams')
        .insert({
          organization_id: org.id,
          name: teamName || `${orgName} Golf`,
          season: season,
        })
        .select()
        .single();

      if (teamError) {
        console.error('Team error:', teamError);
        setError(`Failed to create team: ${teamError.message}`);
        setLoading(false);
        return;
      }

      // Step 3: Update coach record
      const { error: coachError } = await supabase
        .from('golf_coaches')
        .update({
          team_id: team.id,
          organization_id: org.id,
          full_name: fullName,
          title: title || null,
          email: email || null,
          phone: phone || null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      if (coachError) {
        console.error('Coach error:', coachError);
        setError(`Failed to update coach: ${coachError.message}`);
        setLoading(false);
        return;
      }

      router.push('/golf/dashboard');
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
                      <img
                        src="/helm-golf-logo.png"
                        alt="GolfHelm"
                        className="h-20 w-auto relative z-10"
                      />
                    </div>
                  </motion.div>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-3">
                    Welcome to GolfHelm!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    Let's set up your golf program. This will only take a couple of minutes.
                  </p>
                </motion.div>

                {/* Features List */}
                <motion.div
                  variants={staggerItem}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 p-8 shadow-xl shadow-slate-900/5 max-w-md mx-auto"
                >
                  <h3 className="font-semibold text-slate-900 mb-4 text-center">
                    What you'll set up:
                  </h3>
                  <ul className="space-y-3 text-sm text-slate-600">
                    {[
                      { num: 1, text: 'Your school or organization' },
                      { num: 2, text: 'Your golf team' },
                      { num: 3, text: 'Your coach profile' },
                    ].map((item, index) => (
                      <motion.li
                        key={item.num}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                        className="flex items-center gap-3"
                      >
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 font-semibold text-xs">
                            {item.num}
                          </span>
                        </div>
                        {item.text}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                {/* Get Started Button */}
                <motion.div variants={staggerItem} className="text-center">
                  <Button
                    size="lg"
                    onClick={() => setStep('organization')}
                    className="px-8 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 hover:shadow-xl hover:shadow-green-900/30 transition-all"
                  >
                    Get Started
                    <IconArrowRight size={16} className="ml-2" />
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'organization' && (
            <motion.div
              key="organization"
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
                  <h2 className="text-2xl font-bold text-slate-900">Organization Information</h2>
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
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Texas A&M University"
                        required
                        autoFocus
                      />
                    </motion.div>

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
                        label="Conference (optional)"
                        value={conference}
                        onChange={(e) => setConference(e.target.value)}
                        placeholder="SEC"
                      />
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
                        placeholder="College Station"
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
                      onClick={() => setStep('team')}
                      disabled={!orgName}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {step === 'team' && (
            <motion.div
              key="team"
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
                  <h2 className="text-2xl font-bold text-slate-900">Team Details</h2>
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
                        label="Team Name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="Men's Golf"
                        hint="e.g., Men's Golf, Women's Golf"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        label="Season"
                        value={season}
                        onChange={(e) => setSeason(e.target.value)}
                        placeholder="2024-25"
                      />
                    </motion.div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Button
                      variant="secondary"
                      onClick={() => setStep('organization')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('profile')}
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
                    Step 3 of 3
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
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Head Coach"
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
                      onClick={() => setStep('team')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep('complete')}
                      disabled={!fullName}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Complete Setup
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
                    Your team is ready!
                  </h1>
                  <p className="text-slate-600 text-lg max-w-md mx-auto leading-relaxed">
                    You're all set to start managing your golf program and tracking player performance.
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

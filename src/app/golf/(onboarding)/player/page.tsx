'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import { IconArrowRight, IconCheck, IconUser } from '@/components/icons';
import type { GolfPlayerYear } from '@/lib/types/golf';

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

export default function GolfPlayerOnboarding() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');

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
      const { data: { user } } = await (supabase as any).auth.getUser();

      if (!user) {
        router.push('/golf/login');
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');

      // Check for existing player record
      const { data: player } = await (supabase as any)
        .from('golf_players')
        .select('*, team:golf_teams(name)')
        .eq('user_id', user.id)
        .single();

      if (player) {
        setPlayerId(player.id);
        if (player.onboarding_completed) {
          router.push('/golf/dashboard');
          return;
        }
        // Pre-fill existing data
        setFirstName(player.first_name || '');
        setLastName(player.last_name || '');
        setPhone(player.phone || '');
        setHometown(player.hometown || '');
        setState(player.state || '');
        setYear(player.year || 'freshman');
        setGraduationYear(player.graduation_year || graduationYears[3] || new Date().getFullYear() + 3);
        setHandicap(player.handicap?.toString() || '');
        setMajor(player.major || '');
        setGpa(player.gpa?.toString() || '');
        if (player.team) {
          setTeamName(player.team.name);
        }
      }

      setAuthLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  if (authLoading) return <PageLoading />;

  const handleComplete = async () => {
    if (!userId) return;

    setLoading(true);
    setError('');

    try {
      const updateData = {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        hometown: hometown || null,
        state: state || null,
        year: year,
        graduation_year: graduationYear,
        handicap: handicap ? parseFloat(handicap) : null,
        major: major || null,
        gpa: gpa ? parseFloat(gpa) : null,
        onboarding_completed: true,
      };

      if (playerId) {
        // Update existing player
        const { error: updateError } = await (supabase as any)
          .from('golf_players')
          .update(updateData)
          .eq('id', playerId);

        if (updateError) throw updateError;
      } else {
        // Create new player record
        const { error: insertError } = await (supabase as any)
          .from('golf_players')
          .insert({
            user_id: userId,
            ...updateData,
            status: 'active',
          });

        if (insertError) throw insertError;
      }

      router.push('/golf/dashboard');
      router.refresh();
    } catch (err: unknown) {
      console.error('Onboarding error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred. Please try again.';
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-20 w-auto mx-auto mb-6"
          />
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">
            Welcome to GolfHelm!
          </h1>
          {teamName && (
            <p className="text-green-600 font-medium mb-2">
              You've been invited to {teamName}
            </p>
          )}
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Let's set up your player profile. This will help your coach track your progress and manage the team.
          </p>
          <Button size="lg" onClick={() => setStep('basic')} className="px-8">
            Get Started <IconArrowRight size={16} className="ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <IconCheck size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">
            You're all set!
          </h1>
          <p className="text-slate-600 mb-8">
            Your profile is ready. You can now access your team dashboard and start tracking your rounds.
          </p>
          <Button size="lg" onClick={handleComplete} loading={loading} className="px-8">
            Go to Dashboard
          </Button>
          {error && (
            <p className="text-sm text-red-600 mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const stepNumber = step === 'basic' ? 1 : step === 'golf' ? 2 : step === 'academic' ? 3 : 4;
  const progress = step === 'basic' ? 25 : step === 'golf' ? 50 : step === 'academic' ? 75 : 100;

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Step {stepNumber} of 4</span>
            <span>{progress}% complete</span>
          </div>
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          {step === 'basic' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Basic Information
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
                <div className="grid grid-cols-2 gap-4">
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
                </div>
              </div>
              <div className="flex gap-3 mt-6">
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
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'golf' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Golf Information
              </h2>
              <div className="space-y-4">
                <NativeSelect
                  label="Year"
                  value={year}
                  onChange={(e) => setYear(e.target.value as GolfPlayerYear)}
                >
                  {years.map((y) => (
                    <option key={y.value} value={y.value}>{y.label}</option>
                  ))}
                </NativeSelect>
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
                  type="number"
                  step="0.1"
                  value={handicap}
                  onChange={(e) => setHandicap(e.target.value)}
                  placeholder="5.2"
                  hint="Your official USGA Handicap Index"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => setStep('basic')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('academic')}
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'academic' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Academic Information
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Optional, but helps your coach with scheduling and eligibility.
              </p>
              <div className="space-y-4">
                <Input
                  label="Major"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  placeholder="Business Administration"
                />
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
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => setStep('golf')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('photo')}
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'photo' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Profile Photo
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Add a profile photo so your coach and teammates can recognize you.
              </p>
              <div className="flex flex-col items-center mb-6">
                <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <IconUser size={48} className="text-slate-400" />
                </div>
                <Button variant="secondary" size="sm">
                  Upload Photo
                </Button>
                <p className="text-xs text-slate-500 mt-2">JPG or PNG, max 5MB</p>
              </div>
              <div className="flex gap-3 mt-6">
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
                  className="flex-1"
                >
                  Complete
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

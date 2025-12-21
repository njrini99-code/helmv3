'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { IconArrowRight, IconCheck, IconUser } from '@/components/icons';

type Step = 'welcome' | 'organization' | 'team' | 'profile' | 'complete';

const divisions = ['D1', 'D2', 'D3', 'NAIA', 'NJCAA', 'Club'];

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

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl text-center">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-20 w-auto mx-auto mb-6"
          />
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">
            Welcome to GolfHelm!
          </h1>
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Let's set up your golf program. This will only take a couple of minutes.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 max-w-md mx-auto">
            <h3 className="font-medium text-slate-900 mb-4">What you'll set up:</h3>
            <ul className="text-left space-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-medium text-xs">1</span>
                </div>
                Your school or organization
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-medium text-xs">2</span>
                </div>
                Your golf team
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-medium text-xs">3</span>
                </div>
                Your coach profile
              </li>
            </ul>
          </div>

          <Button size="lg" onClick={() => setStep('organization')} className="px-8">
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
            Your team is ready!
          </h1>
          <p className="text-slate-600 mb-8">
            You're all set to start managing your golf program and tracking player performance.
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

  const stepNumber = step === 'organization' ? 1 : step === 'team' ? 2 : 3;
  const progress = step === 'organization' ? 33 : step === 'team' ? 67 : 100;

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Step {stepNumber} of 3</span>
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
          {step === 'organization' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Organization Information
              </h2>
              <div className="space-y-4">
                <Input
                  label="School/Organization Name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Texas A&M University"
                  required
                  autoFocus
                />
                <NativeSelect
                  label="Division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  <option value="">Select division</option>
                  {divisions.map((div) => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </NativeSelect>
                <Input
                  label="Conference (optional)"
                  value={conference}
                  onChange={(e) => setConference(e.target.value)}
                  placeholder="SEC"
                />
                <div className="grid grid-cols-2 gap-4">
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
                  onClick={() => setStep('team')}
                  disabled={!orgName}
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'team' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Team Details
              </h2>
              <div className="space-y-4">
                <Input
                  label="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Men's Golf"
                  hint="e.g., Men's Golf, Women's Golf"
                />
                <Input
                  label="Season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="2024-25"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => setStep('organization')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('profile')}
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'profile' && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">
                Your Profile
              </h2>
              <div className="space-y-4">
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
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coach@school.edu"
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Photo (optional)
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                      <IconUser size={28} className="text-slate-400" />
                    </div>
                    <Button variant="secondary" size="sm">
                      Upload Photo
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">JPG or PNG, max 5MB</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
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
                  className="flex-1"
                >
                  Complete Setup
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

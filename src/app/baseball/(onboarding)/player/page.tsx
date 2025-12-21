'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import { IconArrowRight, IconCheck, IconUser } from '@/components/icons';

type Step = 'welcome' | 'basic' | 'baseball' | 'physical' | 'metrics' | 'photo' | 'complete';

const positions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'INF', 'UTIL'];
const handedness = ['R', 'L', 'S'];
const gradYears = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

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
        console.error('Update error:', updateError);
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

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">H</span>
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-3">Let's build your profile</h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            We'll help you create a profile that stands out to college coaches. This will take about 3 minutes.
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
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <IconCheck size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-3">Your profile is ready!</h1>
          <p className="text-gray-600 mb-8">
            You're all set to start connecting with college coaches.
          </p>
          <Button size="lg" onClick={handleComplete} loading={loading} className="px-8">
            Go to Dashboard
          </Button>
          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Step {step === 'basic' ? 1 : step === 'baseball' ? 2 : step === 'physical' ? 3 : step === 'metrics' ? 4 : 5} of 5</span>
            <span>{step === 'basic' ? 20 : step === 'baseball' ? 40 : step === 'physical' ? 60 : step === 'metrics' ? 80 : 100}% complete</span>
          </div>
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300"
              style={{ width: `${step === 'basic' ? 20 : step === 'baseball' ? 40 : step === 'physical' ? 60 : step === 'metrics' ? 80 : 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border-light p-8 shadow-sm">
          {step === 'basic' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
              <div className="space-y-4">
                <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                <Input label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                <NativeSelect label="Graduation Year" value={gradYear.toString()} onChange={(e) => setGradYear(parseInt(e.target.value))} required>
                  {gradYears.map(year => <option key={year} value={year}>{year}</option>)}
                </NativeSelect>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
                  <Input label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" maxLength={2} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('welcome')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('baseball')} disabled={!firstName || !lastName} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'baseball' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Baseball Info</h2>
              <div className="space-y-4">
                <NativeSelect label="Primary Position" value={primaryPosition} onChange={(e) => setPrimaryPosition(e.target.value)} required>
                  <option value="">Select position</option>
                  {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </NativeSelect>
                <NativeSelect label="Secondary Position" value={secondaryPosition} onChange={(e) => setSecondaryPosition(e.target.value)}>
                  <option value="">None</option>
                  {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </NativeSelect>
                <div className="grid grid-cols-2 gap-4">
                  <NativeSelect label="Bats" value={bats} onChange={(e) => setBats(e.target.value)}>
                    <option value="">Select</option>
                    {handedness.map(h => <option key={h} value={h}>{h}</option>)}
                  </NativeSelect>
                  <NativeSelect label="Throws" value={throws} onChange={(e) => setThrows(e.target.value)}>
                    <option value="">Select</option>
                    {handedness.map(h => <option key={h} value={h}>{h}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('basic')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('physical')} disabled={!primaryPosition} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'physical' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Physical Measurements</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Height</label>
                  <div className="grid grid-cols-2 gap-4">
                    <NativeSelect value={heightFeet.toString()} onChange={(e) => setHeightFeet(parseInt(e.target.value))}>
                      {[4, 5, 6, 7].map(ft => <option key={ft} value={ft}>{ft} ft</option>)}
                    </NativeSelect>
                    <NativeSelect value={heightInches.toString()} onChange={(e) => setHeightInches(parseInt(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i} in</option>)}
                    </NativeSelect>
                  </div>
                </div>
                <Input label="Weight (lbs)" type="number" value={weight} onChange={(e) => setWeight(parseInt(e.target.value))} />
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('baseball')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('metrics')} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'metrics' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Metrics</h2>
              <p className="text-sm text-gray-600 mb-4">Add at least one metric. You can add more later.</p>
              <div className="space-y-4">
                <Input label="Pitch Velocity (mph)" type="number" step="0.1" value={pitchVelo} onChange={(e) => setPitchVelo(e.target.value)} placeholder="85.0" />
                <Input label="Exit Velocity (mph)" type="number" step="0.1" value={exitVelo} onChange={(e) => setExitVelo(e.target.value)} placeholder="90.0" />
                <Input label="60-Yard Time (sec)" type="number" step="0.01" value={sixtyTime} onChange={(e) => setSixtyTime(e.target.value)} placeholder="6.90" />
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('physical')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('photo')} disabled={!pitchVelo && !exitVelo && !sixtyTime} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'photo' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Profile Photo</h2>
              <p className="text-sm text-gray-600 mb-6">
                Add a profile photo to help coaches recognize you. You can skip this step and add one later.
              </p>
              <div className="flex flex-col items-center mb-6">
                <div className="w-32 h-32 rounded-full bg-cream-200 flex items-center justify-center mb-4">
                  <IconUser size={48} className="text-gray-400" />
                </div>
                <Button variant="secondary" size="sm">
                  Upload Photo
                </Button>
                <p className="text-xs text-gray-500 mt-2">JPG or PNG, max 5MB</p>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('metrics')} className="flex-1">Back</Button>
                <Button variant="ghost" onClick={() => setStep('complete')} className="flex-1">Skip for now</Button>
                <Button onClick={() => setStep('complete')} className="flex-1">Complete</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

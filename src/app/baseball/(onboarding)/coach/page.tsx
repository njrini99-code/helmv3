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

type Step = 'welcome' | 'program' | 'profile' | 'branding' | 'complete';
type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';

const divisions = ['D1', 'D2', 'D3', 'NAIA'];

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

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('coaches')
        .update({
          coach_type: coachType,
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

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl text-center">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">H</span>
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">Welcome to Helm Sports Labs!</h1>
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Let's set up your program in 2 minutes. You'll be discovering talent in no time.
          </p>

          <div className="bg-white rounded-2xl border border-border-light p-6 mb-8 max-w-md mx-auto">
            <label className="label mb-3">Select your program type</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'college', label: 'College' },
                { value: 'juco', label: 'JUCO' },
                { value: 'high_school', label: 'High School' },
                { value: 'showcase', label: 'Showcase' },
              ].map(type => (
                <button
                  key={type.value}
                  onClick={() => setCoachType(type.value as CoachType)}
                  className={`p-4 border-2 rounded-lg text-sm font-medium transition-all ${
                    coachType === type.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-border-light bg-white text-slate-700 hover:border-border'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <Button size="lg" onClick={() => setStep('program')} className="px-8">
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
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">Your program is ready!</h1>
          <p className="text-slate-600 mb-8">
            {coachType === 'college' || coachType === 'juco'
              ? "You're all set to start discovering recruits."
              : "You're all set to start managing your team."}
          </p>
          <Button size="lg" onClick={handleComplete} loading={loading} className="px-8">
            {coachType === 'college' || coachType === 'juco' ? 'Find your first recruit' : 'Invite your first player'}
          </Button>
          {error && <p className="text-sm leading-relaxed text-red-600 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Step {step === 'program' ? 1 : step === 'profile' ? 2 : 3} of 3</span>
            <span>{step === 'program' ? 33 : step === 'profile' ? 67 : 100}% complete</span>
          </div>
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300"
              style={{ width: `${step === 'program' ? 33 : step === 'profile' ? 67 : 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border-light p-8 shadow-sm">
          {step === 'program' && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-6">Program Information</h2>
              <div className="space-y-4">
                <Input
                  label="School/Organization Name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Texas A&M University"
                  required
                />
                {(coachType === 'college' || coachType === 'juco') && (
                  <>
                    <NativeSelect label="Division" value={division} onChange={(e) => setDivision(e.target.value)}>
                      <option value="">Select division</option>
                      {divisions.map(div => <option key={div} value={div}>{div}</option>)}
                    </NativeSelect>
                    <Input
                      label="Conference"
                      value={conference}
                      onChange={(e) => setConference(e.target.value)}
                      placeholder="SEC"
                    />
                  </>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City" value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} placeholder="College Station" />
                  <Input label="State" value={schoolState} onChange={(e) => setSchoolState(e.target.value)} placeholder="TX" maxLength={2} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('welcome')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('profile')} disabled={!schoolName} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'profile' && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-6">Your Profile</h2>
              <div className="space-y-4">
                <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Smith" required />
                <Input label="Title/Role" value={coachTitle} onChange={(e) => setCoachTitle(e.target.value)} placeholder="Head Coach" required />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@school.edu" />
                <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                <div>
                  <label className="label mb-2">Photo (optional)</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-cream-200 flex items-center justify-center">
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
                <Button variant="secondary" onClick={() => setStep('program')} className="flex-1">Back</Button>
                <Button onClick={() => setStep('branding')} disabled={!fullName || !coachTitle} className="flex-1">Next</Button>
              </div>
            </>
          )}

          {step === 'branding' && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-6">Branding</h2>
              <p className="text-sm leading-relaxed text-slate-600 mb-6">
                Customize your program's appearance. You can skip this step and update it later.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label mb-2">Program Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg bg-cream-200 flex items-center justify-center">
                      <span className="text-2xl font-semibold tracking-tight text-slate-400">
                        {schoolName ? schoolName.charAt(0).toUpperCase() : 'L'}
                      </span>
                    </div>
                    <Button variant="secondary" size="sm">
                      Upload Logo
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Square PNG or SVG, max 2MB</p>
                </div>
                <div>
                  <label className="label mb-2">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-brand-600 border-2 border-border-light" />
                    <div className="text-sm leading-relaxed text-slate-600">
                      <p className="font-medium">Kelly Green</p>
                      <p className="text-xs text-slate-500">#16A34A (default)</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" onClick={() => setStep('profile')} className="flex-1">Back</Button>
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

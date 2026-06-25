'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { completeLiftingCoachOnboarding, type CompleteLiftingCoachOnboardingArgs } from '@/app/lifting/actions/onboarding';
import { fromUntyped } from '@/lib/supabase/untyped';

interface OrgOption {
  id: string;
  name: string;
}

export default function LiftingCoachOnboardingPage() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-fill name from Supabase user metadata
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/lifting/login');
        return;
      }
      const meta = user.user_metadata as Record<string, string | undefined>;
      if (meta?.full_name) setFullName(meta.full_name);
      if (meta?.email) { /* no-op — user.email is preferred */ }
    });
  }, [supabase, router]);

  // Load organizations linked via helm_lifting_coach_invites or fallback all
  useEffect(() => {
    async function loadOrgs() {
      setOrgsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        // Look for accepted/pending invites for this email
        const { data: invites } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
          .select('organization_id')
          .eq('email', user.email.toLowerCase())
          .in('status', ['pending', 'accepted']) as { data: Array<{ organization_id: string }> | null };

        const orgIds = (invites ?? []).map((r) => r.organization_id);

        if (orgIds.length > 0) {
          const { data: orgRows } = await supabase
            .from('organizations')
            .select('id, name')
            .in('id', orgIds) as { data: Array<{ id: string; name: string }> | null };
          setOrgs(orgRows ?? []);
          if (orgRows && orgRows.length === 1 && orgRows[0]) setOrgId(orgRows[0].id);
        }
        // No fallback to all-orgs: without an invite the coach cannot join.
      } finally {
        setOrgsLoading(false);
      }
    }
    loadOrgs();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) {
      setError('Please select your organization.');
      return;
    }
    setIsLoading(true);
    setError(null);

    const args: CompleteLiftingCoachOnboardingArgs = { fullName, title, organizationId: orgId };
    const result = await completeLiftingCoachOnboarding(args);
    if (result.success) {
      setDone(true);
      setTimeout(() => router.push('/lifting/dashboard'), 1000);
    } else {
      setError(result.error ?? 'Failed to save. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6"
      style={{ background: 'linear-gradient(135deg, #FFFEFA 0%, #f0fdf4 50%, #dcfce7 100%)' }}
    >
      {/* Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] -top-32 -right-32 rounded-full bg-gradient-to-br from-primary-400/30 to-primary-600/20 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] -bottom-24 -left-24 rounded-full bg-gradient-to-tr from-primary-400/25 to-primary-400/20 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass-standard backdrop-blur-xl border border-white/20 rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
        >
          {done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center gap-4 py-4"
            >
              <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold text-warm-900">Profile saved</h2>
              <p className="text-warm-500 text-sm">Taking you to your dashboard…</p>
              <Loader2 className="w-5 h-5 text-primary-600 animate-spin mt-2" />
            </motion.div>
          ) : (
            <>
              {/* Logo + welcome header */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-xl scale-150" />
                  <div className="relative w-14 h-14 flex items-center justify-center bg-primary-50 rounded-2xl border border-primary-100">
                    <Image src="/helm-lifting-logo.png" alt="Helm Lifting Lab" width={56} height={56} className="object-contain" priority />
                  </div>
                </div>
                <h1 className="text-xl font-bold text-warm-900">Helm Lifting Lab</h1>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-warm-900 mb-2">Welcome, Coach</h2>
                <p className="text-warm-500 text-sm">
                  Confirm your profile to get started building strength programs
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {error && (
                  <div
                    className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="onboard-name" className="text-sm font-medium text-warm-700">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="onboard-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="onboard-title" className="text-sm font-medium text-warm-700">
                    Title <span className="text-warm-400 font-normal">(optional)</span>
                  </label>
                  <Input
                    id="onboard-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Strength & Conditioning Coach"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="onboard-org" className="text-sm font-medium text-warm-700">
                    Organization <span className="text-red-500">*</span>
                  </label>
                  {orgsLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-cream-50 border border-warm-200 rounded-xl">
                      <Loader2 className="w-4 h-4 text-primary-600 animate-spin flex-shrink-0" />
                      <span className="text-warm-400 text-sm">Loading organizations…</span>
                    </div>
                  ) : orgs.length === 0 ? (
                    <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <p className="text-amber-800 text-sm font-medium">No invitation found</p>
                      <p className="text-amber-700 text-sm">
                        Enter your invite code or ask your head coach to invite you from their
                        dashboard. You&apos;ll receive an email with a link to join.
                      </p>
                    </div>
                  ) : (
                    <NativeSelect
                      id="onboard-org"
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      required
                      placeholder="Select your school / organization"
                      options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                    />
                  )}
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={isLoading || orgsLoading || orgs.length === 0}
                  className="w-full min-h-[50px] bg-primary-600 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/25 hover:bg-primary-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    'Save & go to dashboard'
                  )}
                </Button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

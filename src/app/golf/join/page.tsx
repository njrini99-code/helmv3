'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { IconUsers } from '@/components/icons';
import { Button } from '@/components/ui/button';

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function JoinTeamPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const trimmed = code.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }

    if (trimmed.length < 4) {
      setError('Invite code must be at least 4 characters.');
      return;
    }

    router.push(`/golf/join/${trimmed}`);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  return (
    <div className="min-h-dvh bg-auth-golf relative">
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-green-400/40 to-helm-green-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-green-400/25 to-helm-green-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-green-300/20 to-helm-green-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LazyMotion features={domAnimation}>
          {/* Logo */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 sm:mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-green-500/25 rounded-full blur-xl scale-150" />
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                width={48}
                height={48}
                className="relative w-10 h-10 sm:w-12 sm:h-12 object-contain"
                priority
                unoptimized
              />
            </div>
          </m.div>

          <m.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="w-full max-w-md"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary-50/80 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
                <IconUsers size={32} className="text-primary-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">Join a Team</h1>
              <p className="text-warm-500 mt-2 text-sm sm:text-base">
                Enter the invite code your coach gave you to join their team.
              </p>
            </div>

            <div className="auth-glass-card rounded-3xl p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Input
                    label="Invite Code"
                    type="text"
                    value={code}
                    onChange={handleChange}
                    placeholder="e.g. ABC123"
                    maxLength={10}
                    aria-describedby={error ? 'invite-code-error' : 'invite-code-hint'}
                    aria-invalid={error ? true : undefined}
                    error={error || undefined}
                    autoFocus
                    className="text-center text-lg font-mono tracking-widest"
                  />
                  {!error && (
                    <p id="invite-code-hint" className="mt-2 text-xs text-warm-400 text-center">
                      {trimmed.length > 0
                        ? `${trimmed.length} / 10 characters`
                        : '4\u201310 characters, letters and numbers'}
                    </p>
                  )}
                </div>
                <Button variant="primary"
                  type="submit"
                  disabled={!trimmed}
                  className="w-full px-4 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15"
                >
                  Join Team
                </Button>
              </form>

              <p className="text-center text-xs text-warm-400 mt-4">
                Don&apos;t have a code? Ask your coach for the team invite code.
              </p>
            </div>
          </m.div>
        </LazyMotion>
      </div>
    </div>
  );
}

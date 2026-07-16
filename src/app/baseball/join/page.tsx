'use client';

/**
 * BaseballHelm "join with a code" landing page.
 *
 * Bare `/baseball/join` had no page — only the dynamic `/baseball/join/[code]`
 * existed, which requires the code already be in the URL. This is the code
 * ENTRY step the public marketing page's "Join with a code" CTA links to,
 * mirroring GolfHelm's `/golf/join/page.tsx` (same code-length validation,
 * same `router.push` handoff), themed in the Living Annual paper/ink system
 * instead of golf's glass-orb auth chrome — `/baseball/join/[code]/page.tsx`
 * already uses `PaperCard` from this kit for its own success/error states.
 *
 * Reduced motion: the one entrance animation is the plain CSS
 * `animate-fade-up` utility, neutralized app-wide by the global
 * `@media (prefers-reduced-motion: reduce)` reset in globals.css — no
 * framer-motion / LazyMotion needed for a page this small.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HelmMark } from '@/components/brand/HelmMark';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PaperCard, HairlineRule } from '@/components/baseball/living-annual';

export default function BaseballJoinPage() {
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

    if (!/^[A-Z0-9]+$/.test(trimmed)) {
      setError('Invite code must contain only letters and numbers.');
      return;
    }

    router.push(`/baseball/join/${trimmed}`);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--paper-canvas)] p-4 sm:p-6">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 text-center">
          <Link href="/baseball" className="inline-flex items-center gap-2">
            <HelmMark sport="baseball" size={40} className="h-10 w-10" unoptimized />
          </Link>
          <h1 className="mt-4 font-annual text-h1 font-semibold text-text-primary">Join a team</h1>
          <p className="mt-2 text-body text-text-secondary">Enter the invite code your coach sent you.</p>
        </div>

        <PaperCard registrationTick className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="Invite code"
                type="text"
                value={code}
                onChange={handleChange}
                placeholder="e.g. ABC123"
                maxLength={10}
                aria-describedby={error ? 'invite-code-error' : 'invite-code-hint'}
                aria-invalid={error ? true : undefined}
                error={error || undefined}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus on the single-field join form
                autoFocus
                className="text-center font-annual text-lg tracking-widest"
              />
              {!error && (
                <p id="invite-code-hint" className="mt-2 text-center text-body-sm text-text-tertiary">
                  {trimmed.length > 0 ? `${trimmed.length} / 10 characters` : '4–10 characters, letters and numbers'}
                </p>
              )}
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={!trimmed} className="w-full">
              Join team
            </Button>
          </form>

          <HairlineRule ink="team" animate={false} className="my-6" />

          <p className="text-center text-body-sm text-text-tertiary">
            Don&apos;t have a code? Ask your coach, or{' '}
            <Link href="/baseball/signup" className="font-medium text-grade-plus hover:underline">
              create a program
            </Link>
            .
          </p>
        </PaperCard>

        <p className="mt-6 text-center text-body-sm text-text-tertiary">
          <Link href="/baseball" className="hover:text-text-primary">
            ← Back to BaseballHelm
          </Link>
        </p>
      </div>
    </div>
  );
}

'use client';

/**
 * `/join` — sport-agnostic invite-code entry. First Light's material
 * system (docs/LANDING_ENTRY_WORLD_DESIGN.md, glass grammar in
 * `src/components/marketing/first-light/first-light.css`) on a plain ecru
 * field: one field, one button, a G3 glass panel (the grade the scaffold
 * reserves for auth forms — CONTRACTS.md).
 *
 * A single code doesn't reveal which product it belongs to on its own
 * (golf and baseball invite codes are generated independently, drawn from
 * overlapping alphabets), so submit calls the server-side
 * `resolveJoinCode` action, then hands off to the REAL, existing,
 * untouched flow: `/golf/join/${code}` or `/baseball/join/${code}` — both
 * of which still own their own auth gate, membership checks, and
 * confirmation UI.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '@/components/marketing/first-light/fonts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resolveJoinCode } from './actions';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function JoinClient() {
  const prefersReduced = useReducedMotion();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
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

    setStatus('checking');
    const result = await resolveJoinCode(trimmed);

    if (!result.ok) {
      setStatus('idle');
      setError(result.error);
      return;
    }

    router.push(`/${result.sport}/join/${trimmed}`);
    // Deliberately leave `status` at 'checking' here — the button stays
    // disabled through the navigation so a slow route transition can't be
    // double-submitted, and this component unmounts on route change anyway.
  }

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16"
      style={{ backgroundColor: 'var(--fl-ecru)' }}
    >
      <div className="fl-grain" aria-hidden="true" />
      <LazyMotion features={domAnimation}>
        <m.div
          initial={prefersReduced ? undefined : { opacity: 0, y: 16 }}
          animate={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <Link
              href="/"
              className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(20,53,39,0.55)]"
            >
              Helm Sports Labs
            </Link>
            <h1
              className={cn(
                flFraunces.className,
                'mt-4 text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.1] text-[var(--fl-pine)]',
              )}
            >
              One code. Your team.
            </h1>
            <p className="mt-3 text-body text-warm-500">
              Enter the invite code your coach gave you — golf or baseball, we&rsquo;ll take it from here.
            </p>
          </div>

          <div className="fl-glass-3 rounded-3xl p-7 sm:p-9">
            <form onSubmit={handleSubmit} className="relative z-10 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="inviteCode"
                  className="mb-2 block text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-ecru-rgb),0.55)]"
                >
                  Invite code
                </label>
                <Input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  value={code}
                  onChange={handleChange}
                  placeholder="e.g. ABC123"
                  maxLength={10}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus on the single-field join form
                  autoFocus
                  aria-describedby={error ? 'invite-code-error' : 'invite-code-hint'}
                  aria-invalid={error ? true : undefined}
                  disabled={status === 'checking'}
                  className={cn(
                    'text-center font-mono text-lg tracking-[0.3em] text-[var(--fl-ecru)] placeholder:tracking-normal placeholder:text-[rgba(var(--fl-ecru-rgb),0.35)]',
                    'bg-black/20 hover:bg-black/20 focus:bg-black/20',
                    'border-[rgba(var(--fl-brass-rgb),0.35)] hover:border-[rgba(var(--fl-brass-rgb),0.45)] focus:border-[var(--fl-green)] focus:ring-[var(--fl-green)]/30',
                    'focus-visible:ring-offset-[var(--fl-pine)]',
                    error && 'border-red-400/70 focus:border-red-400',
                  )}
                />
                {error ? (
                  <p id="invite-code-error" role="alert" className="mt-2 text-center text-xs text-red-300">
                    {error}
                  </p>
                ) : (
                  <p id="invite-code-hint" className="mt-2 text-center text-xs text-[rgba(var(--fl-ecru-rgb),0.45)]">
                    {trimmed.length > 0 ? `${trimmed.length} / 10 characters` : '4–10 characters, letters and numbers'}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                isLoading={status === 'checking'}
                disabled={!trimmed}
                rightIcon={<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
                className="group w-full rounded-full px-6 py-3.5 text-sm shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-offset-[var(--fl-pine)]"
              >
                {status === 'checking' ? 'Checking…' : 'Continue'}
              </Button>
            </form>

            <p className="relative z-10 mt-5 text-center text-xs text-[rgba(var(--fl-ecru-rgb),0.5)]">
              Don&rsquo;t have a code? Ask your coach for the team invite link.
            </p>
          </div>
        </m.div>
      </LazyMotion>
    </main>
  );
}

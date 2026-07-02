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
      style={{ backgroundColor: 'var(--fl-cream)' }}
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
              className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-sage-ink-rgb),0.55)]"
            >
              Helm Sports Labs
            </Link>
            <h1
              className={cn(
                flFraunces.className,
                'mt-4 text-balance text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.1] text-[var(--fl-sage-ink)]',
              )}
            >
              One code. Your team.
            </h1>
            <p className="mt-3 text-pretty text-body text-[rgba(var(--fl-sage-ink-rgb),0.6)]">
              Enter the invite code your coach gave you — golf or baseball, we&rsquo;ll take it from here.
            </p>
          </div>

          {/* Specular lip (`--fl-specular`, restating the shared `.fl-glass-3`
              brass top-edge since inline `boxShadow` replaces rather than
              appends to the class's box-shadow) + a faint dark hairline ring
              — the "double-edge" glass recipe (research §2.1/§2.2: a bright
              inner top highlight plus a faint dark ring gives light-mode
              glass its physical edge). */}
          <div
            className="fl-glass-3 rounded-3xl p-7 ring-1 ring-[rgba(var(--fl-sage-ink-rgb),0.18)] sm:p-9"
            style={{ boxShadow: 'inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35), var(--fl-specular)' }}
          >
            <form onSubmit={handleSubmit} className="relative z-10 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="inviteCode"
                  className="mb-2 block text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-cream-rgb),0.55)]"
                >
                  Invite code
                </label>
                {/* Inset glass well (.fl-well, first-light.css) — never a
                    stark white/black rectangle. `.fl-well` owns
                    background/border/error-state (keyed off aria-invalid)
                    at a specificity that reliably beats the shared Input's
                    default classes; sage-deep focus ring here replaces the
                    shared Input's default kelly `--focus-ring` (kelly is
                    product-only — never landing/auth chrome). */}
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
                    'fl-well text-center font-mono text-lg tracking-[0.3em] text-[var(--fl-cream)] placeholder:tracking-normal placeholder:text-[rgba(var(--fl-cream-rgb),0.35)]',
                    'focus-visible:ring-[color:var(--fl-sage-deep)]/35 focus-visible:ring-offset-[var(--fl-sage-ink)]',
                  )}
                />
                {error ? (
                  <p id="invite-code-error" role="alert" className="mt-2 text-center text-xs text-red-300">
                    {error}
                  </p>
                ) : (
                  <p id="invite-code-hint" className="mt-2 text-center text-xs text-[rgba(var(--fl-cream-rgb),0.45)]">
                    {trimmed.length > 0 ? `${trimmed.length} / 10 characters` : '4–10 characters, letters and numbers'}
                  </p>
                )}
              </div>

              {/* Sage-deep fill + cream text, overriding the shared Button's
                  kelly `primary` variant (twMerge resolves the bg/text/ring
                  conflicts — verified). Kelly is product-only, never
                  landing/auth chrome. Button-in-button (Amendment 2 §B.8):
                  the arrow lives in its own circle; press physics via the
                  spring easing + `active:scale-[0.98]` override (twMerge
                  drops the shared Button's `transition-all`/`duration-200`/
                  `ease-out`/`active:scale-[0.97]` in favor of these since
                  `className` is merged last). No glow here — the ≤2-glow
                  budget is spent on M1 + M8's primaries (§E). */}
              <Button
                type="submit"
                variant="primary"
                isLoading={status === 'checking'}
                disabled={!trimmed}
                rightIcon={
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[rgba(var(--fl-cream-high-rgb),0.15)] transition-transform duration-[240ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                }
                className="group w-full rounded-full bg-[var(--fl-sage-deep)] px-6 py-3.5 text-sm text-[var(--fl-cream)] shadow-[0_10px_25px_-5px_rgba(var(--fl-sage-ink-rgb),0.4)] transition-[transform,box-shadow,filter] duration-[240ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-[var(--fl-sage-deep)] hover:brightness-110 hover:shadow-[0_10px_25px_-5px_rgba(var(--fl-sage-ink-rgb),0.4)] active:scale-[0.98] focus-visible:ring-[color:var(--fl-sage-deep)]/40 focus-visible:ring-offset-[var(--fl-sage-ink)]"
              >
                {status === 'checking' ? 'Checking…' : 'Continue'}
              </Button>
            </form>

            <p className="relative z-10 mt-5 text-center text-xs text-[rgba(var(--fl-cream-rgb),0.5)]">
              Don&rsquo;t have a code? Ask your coach for the team invite link.
            </p>
          </div>
        </m.div>
      </LazyMotion>
    </main>
  );
}

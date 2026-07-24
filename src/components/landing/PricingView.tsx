'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { submitDemoRequest } from '@/app/actions/demo-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GLASS_CARD } from './glass';
import { MarketingShell } from './MarketingShell';
import { Reveal } from './motion';

/**
 * Pricing — deliberately a single editorial statement and one email field.
 * No tiers, no tables: pricing is a conversation, and the page says exactly
 * that in Nick's words.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Status = 'idle' | 'sending' | 'success';

function PricingCapture() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const successRef = useRef<HTMLParagraphElement | null>(null);

  const onSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const honeypot = String(fd.get('company') ?? '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      setError('Enter a valid work email.');
      return;
    }
    if (honeypot) {
      setStatus('success');
      return;
    }
    setError(null);
    setStatus('sending');
    const result = await submitDemoRequest(email, { source: 'pricing' });
    if (result.success) {
      setStatus('success');
      window.setTimeout(() => successRef.current?.focus(), 0);
    } else {
      setStatus('idle');
      setError(result.error ?? 'Something went wrong. Please try again.');
    }
  }, []);

  if (status === 'success') {
    return (
      <div role="status" className="mx-auto mt-[42px] max-w-[460px] rounded-3xl p-7 text-center" style={GLASS_CARD}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-50">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--fw-color-accent-700)" strokeWidth="2.4" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p ref={successRef} tabIndex={-1} className="mt-4 text-body-lg font-semibold text-text-primary outline-none">
          Request received.
        </p>
        <p className="mx-auto mt-2 max-w-[26em] text-body-sm leading-relaxed text-text-secondary">
          A member of the Helm team will reach out to set up your call.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto mt-[42px] w-full max-w-[520px]">
      {/* Stadium radius only works while the form is a single row — stacked
          on mobile, `rounded-full` curves the card away behind the full-width
          button so it reads as hanging outside the box (2026-07-24 iPhone). */}
      <div className="rounded-3xl p-1.5 sm:rounded-full" style={GLASS_CARD}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <div className="flex-1 [&_input]:rounded-full [&_input]:border-transparent [&_input]:bg-[oklch(1_0_0/0.55)]">
            <Input
              name="email"
              type="email"
              label=""
              aria-label="Work email"
              placeholder="Work email"
              error={undefined}
            />
          </div>
          {/* Honeypot — hidden from real users and assistive tech */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
            <label>
              Company
              <input name="company" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={status === 'sending'}
            className="w-full rounded-full bg-primary-700 px-7 text-[0.9375rem] font-semibold hover:bg-primary-800 shadow-[0_1px_1px_oklch(0.35_0.08_150/0.4),0_3px_10px_oklch(0.35_0.08_150/0.28)] sm:w-auto"
          >
            {status === 'sending' ? 'Sending…' : 'Set up a call'}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-center text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function PricingView() {
  return (
    <MarketingShell>
      <section className="relative overflow-clip">
        {/* Sunlit glow + concentric rings, echoing the landing's CTA motif */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[18%] left-1/2 h-[54vw] max-h-[820px] w-[54vw] max-w-[820px] -translate-x-1/2 rounded-full blur-[10px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, oklch(0.9 0.07 120 / 0.2), transparent 62%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute top-[46%] left-1/2 aspect-square w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[oklch(0.4_0.02_60/0.08)]"
        />
        <div
          aria-hidden="true"
          className="absolute top-[46%] left-1/2 aspect-square w-[min(440px,64vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[oklch(0.4_0.02_60/0.1)]"
        />

        <div className="relative mx-auto flex min-h-[calc(100dvh-160px)] max-w-[880px] flex-col items-center justify-center px-[clamp(20px,4vw,64px)] py-[clamp(80px,12vw,150px)] text-center">
          <Reveal className="flex items-center justify-center gap-2.5 font-fw-mono text-[0.75rem] uppercase tracking-[0.2em] text-accent-700">
            <span className="inline-block h-px w-[22px] bg-accent-500" />
            Pricing
            <span className="inline-block h-px w-[22px] bg-accent-500" />
          </Reveal>
          <Reveal as="p" delay={60} className="mt-7 [text-wrap:balance]">
            <span
              className="block text-[clamp(2.6rem,6vw,5rem)] leading-[1.02] tracking-[-0.028em] text-text-primary"
              style={{ fontWeight: 640 }}
            >
              Every program.
            </span>
            {/* accent-600, not the raw helm green: accent-500 is 2.67:1 on the
                champagne canvas (AA large-text needs 3:1); 600 passes at 3.7:1
                while staying in the brand green, not forest. */}
            <span
              className="block text-[clamp(2.6rem,6vw,5rem)] leading-[1.02] tracking-[-0.028em] text-accent-600"
              style={{ fontWeight: 640 }}
            >
              Every level.
            </span>
          </Reveal>
          <Reveal
            as="p"
            delay={120}
            className="mx-auto mt-7 max-w-[30em] text-[clamp(1.1rem,1.7vw,1.45rem)] leading-normal text-text-secondary [text-wrap:pretty]"
          >
            We built Helm Sports Labs so managing your team efficiently doesn&apos;t take your whole budget.
          </Reveal>
          <Reveal
            as="p"
            delay={160}
            className="mx-auto mt-4 max-w-[32em] text-[clamp(0.95rem,1.25vw,1.1rem)] leading-relaxed text-text-tertiary [text-wrap:pretty]"
          >
            Set up a quick call to see how Helm can fit in with your program.
          </Reveal>
          <Reveal delay={180} className="w-full">
            <PricingCapture />
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

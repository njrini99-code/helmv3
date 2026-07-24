'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { submitDemoRequest } from '@/app/actions/demo-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Request Demo modal — accessible dialog with validation, sending, and
 * success states, wired to the real demo_requests lead pipeline.
 * Focus lands on the first field on open and returns to the trigger on
 * close; Escape and overlay-click dismiss.
 */

interface RequestDemoModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = 'idle' | 'sending' | 'success';

interface FieldErrors {
  name?: string;
  email?: string;
  school?: string;
  submit?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RequestDemoModal({ open, onClose }: RequestDemoModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Reset + focus + scroll-lock while open.
  useEffect(() => {
    if (!open) return;
    setStatus('idle');
    setErrors({});
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, [open]);

  // The submit button unmounts on success — move focus to the confirmation
  // heading so keyboard/AT users don't silently fall out of the dialog.
  useEffect(() => {
    if (status === 'success') successHeadingRef.current?.focus();
  }, [status]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      // Light focus trap — cycle Tab within the dialog.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, a[href], [tabindex]:not([tabindex="-1"])',
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  const onOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const onSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const school = String(fd.get('school') ?? '').trim();
    const honeypot = String(fd.get('company') ?? '').trim();

    const nextErrors: FieldErrors = {};
    if (!name) nextErrors.name = 'Please enter your name.';
    if (!email || !EMAIL_RE.test(email)) nextErrors.email = 'Enter a valid work email.';
    if (!school) nextErrors.school = 'Which program do you coach?';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    // Bots that fill the visually-hidden field get a quiet success.
    if (honeypot) {
      setStatus('success');
      return;
    }

    setErrors({});
    setStatus('sending');
    const result = await submitDemoRequest(email, { name, school });
    if (result.success) {
      setStatus('success');
    } else {
      setStatus('idle');
      setErrors({ submit: result.error ?? 'Something went wrong. Please try again.' });
    }
  }, []);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onOverlayClick}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[oklch(0.15_0.01_60/0.42)] p-5 backdrop-blur-[6px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-modal-title"
        className="relative w-[min(460px,100%)] rounded-3xl border border-[oklch(1_0_0/0.55)] bg-surface p-[clamp(24px,4vw,34px)] shadow-[inset_0_1px_0_oklch(1_0_0/0.6),0_2px_4px_oklch(0.18_0.01_60/0.09),0_24px_56px_oklch(0.18_0.01_60/0.2),0_52px_110px_oklch(0.18_0.01_60/0.16)]"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 h-[34px] w-[34px] min-h-0 rounded-full bg-surface-tint text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>

        {status !== 'success' ? (
          <div>
            <div className="font-fw-mono text-[0.6875rem] uppercase tracking-[0.16em] text-accent-700">Request Demo</div>
            <h3
              id="demo-modal-title"
              className="mt-3 text-[clamp(1.4rem,3vw,1.8rem)] leading-[1.1] tracking-[-0.02em] text-text-primary"
              style={{ fontWeight: 620 }}
            >
              See GolfHelm with your program.
            </h3>
            <p className="mt-2.5 text-body-sm leading-normal text-text-secondary">
              Tell us where you coach and we&apos;ll set up a walkthrough with your data in mind.
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-[22px] flex flex-col gap-4">
              <Input ref={firstFieldRef} label="Name" name="name" type="text" autoComplete="name" error={errors.name} />
              <Input label="Work email" name="email" type="email" error={errors.email} />
              <Input label="Program / school" name="school" type="text" autoComplete="organization" error={errors.school} />
              {/* Honeypot — hidden from real users and assistive tech */}
              <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                <label>
                  Company
                  {/* eslint-disable-next-line helm/no-raw-input -- honeypot bot-bait: must stay an unstyled, non-focusable raw input */}
                  <input name="company" type="text" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={status === 'sending'}
                className="mt-1 rounded-full bg-primary-700 text-[0.9375rem] font-semibold hover:bg-primary-800 shadow-[0_2px_8px_oklch(0.35_0.08_150/0.28)]"
              >
                {status === 'sending' ? 'Sending…' : 'Request Demo'}
              </Button>
              {errors.submit ? (
                <p role="alert" className="text-center text-body-sm text-destructive">
                  {errors.submit}
                </p>
              ) : null}
              <p className="text-center text-caption font-normal leading-normal text-text-tertiary">
                By requesting a demo you agree that we&apos;ll contact you about GolfHelm. No marketing without consent.
              </p>
            </form>
          </div>
        ) : (
          <div role="status" className="px-0 pt-3.5 pb-1.5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--fw-color-accent-700)" strokeWidth="2.4" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3
              ref={successHeadingRef}
              tabIndex={-1}
              className="mt-[18px] text-[1.5rem] text-text-primary outline-none"
              style={{ fontWeight: 620 }}
            >
              Request received.
            </h3>
            <p className="mx-auto mt-2.5 max-w-[26em] text-body-sm leading-relaxed text-text-secondary">
              Thanks — a member of the Helm team will reach out to schedule your GolfHelm walkthrough.
            </p>
            <Button
              variant="ghost"
              onClick={onClose}
              className="mt-[22px] rounded-full bg-surface-tint px-[22px] text-[0.8125rem] font-medium text-text-primary hover:bg-surface-sunken"
            >
              Back to the page
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

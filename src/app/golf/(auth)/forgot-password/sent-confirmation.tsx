'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { authPrimaryButtonClass, authTextLinkClass } from '@/components/auth/golf-auth-canvas';
import styles from './sent-confirmation.module.css';

/** Seconds before "Resend" unlocks, so a double tap can't send two emails. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The animated seal above "Check your email": an envelope draws itself, its
 * flap folds shut, two rings ripple out once and a check lands on the corner.
 * Keyed by the caller so a resend plays it again.
 */
export function SentMark() {
  return (
    <div className={styles.mark} aria-hidden="true">
      <span className={cn(styles.ring, 'text-accent-ink')} />
      <span className={cn(styles.ring, 'text-accent-ink')} />
      <span className={cn(styles.seal, 'bg-accent-wash')} />
      <svg className={cn(styles.envelope, 'text-accent-ink')} width="34" height="34" viewBox="0 0 24 24" fill="none">
        <path
          className={styles.body}
          pathLength={1}
          d="M5.5 5.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          className={styles.flap}
          pathLength={1}
          d="M4.5 7 12 12.5 19.5 7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={cn(styles.check, 'bg-accent-fill text-text-on-accent-fill')}>
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
          <path pathLength={1} d="M2.5 6.2 5 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Wraps content so it rises in at position `i` of the stagger. `as="span"`
 * (an inline-block) for use inside a heading or paragraph.
 */
export function Rise({
  i,
  children,
  className,
  as = 'div',
}: {
  i: number;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'span';
}) {
  const Tag = as;
  return (
    <Tag className={cn(styles.rise, as === 'span' && 'inline-block', className)} style={{ '--sc-i': i } as CSSProperties}>
      {children}
    </Tag>
  );
}

function formatSeconds(total: number): string {
  return `0:${String(total).padStart(2, '0')}`;
}

/**
 * Everything under the header once the link is sent: what to do next, a
 * resend that unlocks after a short cooldown, and the way back to sign in.
 */
export function SentConfirmation({ onResend }: { onResend: () => Promise<boolean> }) {
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resentCount, setResentCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  const resend = async () => {
    if (resending || remaining > 0) return;
    setResending(true);
    setFailed(false);
    const ok = await onResend().catch(() => false);
    setResending(false);
    if (ok) {
      setResentCount((n) => n + 1);
      setRemaining(RESEND_COOLDOWN_SECONDS);
    } else {
      setFailed(true);
    }
  };

  return (
    <div>
      <Rise i={1}>
        <p className="px-2 text-center text-body text-text-secondary">
          Open the link in the email to choose a new password. It expires in 1&nbsp;hour.
        </p>
      </Rise>

      <Rise i={2}>
        <Link href="/golf/login" className={cn(authPrimaryButtonClass, 'mt-7')}>
          Back to sign in
        </Link>
      </Rise>

      <Rise i={3} className="mt-3 flex min-h-[44px] flex-col items-center justify-center text-center">
        <p className="text-body-sm text-text-secondary" aria-live="polite">
          {resentCount > 0 && remaining > 0 ? (
            <span key={resentCount} className={cn(styles.flash, 'inline-block font-medium text-accent-ink')}>
              Sent again. Check your inbox and spam folder.
            </span>
          ) : failed ? (
            <span className="text-fw-danger-ink">Couldn’t resend. Check your connection and try again.</span>
          ) : (
            'Didn’t get it? Check your spam folder.'
          )}
        </p>
        {remaining > 0 ? (
          <p className="text-body-sm text-text-secondary">
            Resend in <span className={styles.countdown}>{formatSeconds(remaining)}</span>
          </p>
        ) : (
          // eslint-disable-next-line helm/no-raw-button -- a quiet text-link action inside the auth card, styled like the canvas's other text links
          <button type="button" className={cn(authTextLinkClass, 'text-body-sm')} onClick={resend} aria-busy={resending || undefined}>
            {resending ? 'Sending…' : 'Resend the email'}
          </button>
        )}
      </Rise>
    </div>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { HelmMark } from '@/components/brand/HelmMark';
import { cn } from '@/lib/utils';
import styles from './reset-password.module.css';

/**
 * The frame every state of /golf/reset-password sits in: the ivory canvas, the
 * GolfHelm lockup and one card with a forest rule on top. It matches the reset
 * email, so the email and the page read as one continuous step.
 *
 * No hooks, so the route's loading.tsx renders the same frame as the page's
 * first paint and nothing moves when the page takes over.
 */
export function ResetShell({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <div className={styles.root}>
      <Link href="/golf/login" className={cn(styles.lockup, styles.lockupEnter)} aria-label="GolfHelm sign in">
        <HelmMark sport="golf" size={32} className="h-8 w-8" priority />
        <span className={styles.wordmark} aria-hidden="true">
          Golf<b>Helm</b>
        </span>
      </Link>
      <main id="auth-card" className={cn(styles.card, styles.enter)}>
        {children}
      </main>
      {below}
    </div>
  );
}

/** The first moment after tapping the email's button: the link is being checked. */
export function CheckingCard() {
  return (
    <div role="status" aria-live="polite">
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.checking}>
        <span className={styles.spinner} aria-hidden="true" />
        Checking your link…
      </p>
      {/* Holds the form's shape so nothing jumps when the fields arrive. */}
      <div className={styles.bars} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

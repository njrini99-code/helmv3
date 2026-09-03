'use client';

/**
 * ============================================================================
 * Fairway · Feedback · ReportProblemButton
 * ----------------------------------------------------------------------------
 * Opens Sentry's programmatic feedback form (no floating widget — the
 * integration in src/instrumentation-client.ts is registered with
 * `autoInject: false`). This button is the ONLY way a user reaches it.
 *
 * `Sentry.getFeedback()?.createForm()` returns a `FeedbackDialog` (verified
 * against node_modules/@sentry/core/build/types/types/feedback/index.d.ts):
 * it starts closed (`appendToDom()` inserts it into the shadow DOM in a
 * closed state) and needs an explicit `open()` call.
 *
 * Sentry can be unavailable for reasons that are all normal, not bugs — an
 * ad-blocker, `NEXT_PUBLIC_SENTRY_DSN` unset locally, the SDK not finished
 * initializing yet — so every failure path here falls back to a plain
 * `mailto:` and a toast, and NEVER throws or logs a console error itself.
 * ========================================================================== */

import { useCallback, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button, type ButtonProps } from '@/components/fairway/controls/button';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';

const SUPPORT_MAILTO = 'mailto:admin@helmsportslabs.com?subject=Problem%20report';

export interface ReportProblemButtonProps {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  fullWidth?: boolean;
}

function openSupportMailto(): void {
  if (typeof window === 'undefined') return;
  window.location.href = SUPPORT_MAILTO;
}

export function ReportProblemButton({
  className,
  variant = 'secondary',
  size = 'md',
  fullWidth,
}: ReportProblemButtonProps) {
  const [isOpening, setIsOpening] = useState(false);

  const handleClick = useCallback(async () => {
    if (isOpening) return;
    setIsOpening(true);
    try {
      const feedback = Sentry.getFeedback?.();
      const dialog = await feedback?.createForm();
      if (!dialog) {
        fairwayToast.info('Opening email — the in-app report form is unavailable right now.');
        openSupportMailto();
        return;
      }
      dialog.appendToDom();
      dialog.open();
    } catch {
      // Never crash or console.error on a feedback-widget failure.
      fairwayToast.info('Opening email — the in-app report form is unavailable right now.');
      openSupportMailto();
    } finally {
      setIsOpening(false);
    }
  }, [isOpening]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      busy={isOpening}
      className={className}
      onClick={() => void handleClick()}
    >
      Report a problem
    </Button>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, IconButton } from '@/components/fairway';
import { cn } from '@/lib/utils';

/**
 * Helm Bridge — "Copy-for-Claude" incident copy control.
 *
 * The report is a PLAIN STRING built server-side (see
 * `@/lib/admin/incident-report`'s buildIncidentReport /
 * buildCombinedIncidentReport) and passed down as a prop — never a function
 * across the RSC boundary (this repo was burned by exactly that).
 *
 * Two shapes: `icon` for a dense per-row control (TriageQueue rows, errors
 * rows — aria-label required, no visible label), `labeled` for a header/
 * toolbar action ("Copy full report", "Copy all (filtered)").
 */

const COPIED_RESET_MS = 1500;

export interface CopyReportButtonProps {
  /** Pre-built plain-string report. */
  report: string;
  variant?: 'icon' | 'labeled';
  size?: 'sm' | 'md';
  /** Visible label for `labeled`; accessible name for `icon` (or override
   *  the `labeled` button's accessible name if it needs to differ from its
   *  visible text). */
  label?: string;
  'aria-label'?: string;
  className?: string;
}

/** iOS Safari (older versions) + non-secure-context / embedded-webview
 *  fallback: navigator.clipboard.writeText needs a secure context and, in
 *  some wrapped webviews, a direct unbroken user-gesture call chain that
 *  async work upstream can break. A hidden, selected textarea +
 *  document.execCommand('copy') works everywhere clipboard.writeText
 *  doesn't. */
function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }
  return copyViaExecCommand(text);
}

export function CopyReportButton({
  report,
  variant = 'labeled',
  size = 'sm',
  label = 'Copy report',
  className,
  'aria-label': ariaLabelProp,
}: CopyReportButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  async function handleClick() {
    const succeeded = await copyText(report);
    if (!succeeded) return; // Fail silently — a clipboard denial shouldn't throw a toast war.
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  if (variant === 'icon') {
    return (
      <IconButton
        type="button"
        variant="ghost"
        size={size}
        aria-label={copied ? 'Copied to clipboard' : (ariaLabelProp ?? label)}
        onClick={handleClick}
        className={className}
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </IconButton>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={handleClick}
      leftIcon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      aria-label={ariaLabelProp}
      className={cn('shrink-0', className)}
    >
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </Button>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/fairway';
import { copyTextToClipboard } from '../../_components/CopyReportButton';
import { cn } from '@/lib/utils';

/**
 * One forensics field, one-tap copy. The value column of the fingerprint
 * page's forensics header: a labelled value plus a small copy control, or an
 * explicit em-dash with NO copy control when the value is absent — an absent
 * field is never a blank string quietly copyable to "" (see the header's own
 * "explicit em-dash, never invented" contract).
 *
 * Reuses CopyReportButton's exact clipboard fallback chain
 * (`copyTextToClipboard`) rather than a second copy of it.
 */

const COPIED_RESET_MS = 1500;

export interface FieldCopyProps {
  /** Field name — used to build the icon button's accessible name
   *  ("Copy <label>"). Not rendered as visible text; the caller renders its
   *  own label next to this control. */
  label: string;
  value: string | null | undefined;
  /** Renders the value in the mono/tabular face used for codes, ids and
   *  paths. Default true — most forensics values are exactly that. */
  mono?: boolean;
  className?: string;
}

export function FieldCopy({ label, value, mono = true, className }: FieldCopyProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const hasValue = value != null && value !== '';

  async function handleClick() {
    if (!hasValue) return;
    const succeeded = await copyTextToClipboard(value);
    if (!succeeded) return; // Fail silently — a clipboard denial shouldn't throw a toast war.
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <span
        className={cn(
          'min-w-0 flex-1 break-words text-sm text-warm-900 [overflow-wrap:anywhere]',
          mono && 'font-fw-mono',
          !hasValue && 'text-warm-500',
        )}
      >
        {hasValue ? value : '—'}
      </span>
      {hasValue ? (
        <IconButton
          type="button"
          variant="ghost"
          size="md"
          aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
          onClick={handleClick}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </IconButton>
      ) : null}
    </div>
  );
}

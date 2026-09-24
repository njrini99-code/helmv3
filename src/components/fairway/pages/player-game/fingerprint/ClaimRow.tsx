'use client';

/**
 * ClaimRow: one CoachHelm insight as a hairline row, not a card.
 *
 *   Line 1  the title, which is the takeaway
 *   Line 2  value · comparison · window · sample · confidence word
 *   Why     a disclosure holding the explanation, stakes, tags and drills
 *
 * Actions live in one overflow menu per row (coach: assign a focus area;
 * player: add to plan). The disclosure and the menu trigger are siblings;
 * nothing interactive is nested inside another.
 */

import { useState } from 'react';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { IconMoreHorizontal } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { ClaimView } from './fingerprint-model';

export type ClaimAction = 'acknowledged' | 'dismissed' | 'create_focus_area';

export interface ClaimRowProps {
  claim: ClaimView;
  mode: 'coach' | 'player';
  pending?: boolean;
  onAction?: (action: ClaimAction, insightId: string) => void;
  /** Read-only rows (e.g. inside the evidence sheet) drop the menu. */
  readOnly?: boolean;
}

const TONE_INK = {
  good: 'text-fw-success-ink',
  bad: 'text-fw-warning-ink',
  neutral: 'text-text-primary',
} as const;

export function ClaimMeta({ claim }: { claim: ClaimView }) {
  const rest = [claim.comparison ? `vs ${claim.comparison}` : null, claim.window, claim.sample].filter(Boolean);
  return (
    <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
      {claim.value ? <span className={cn('font-semibold tabular-nums', TONE_INK[claim.tone])}>{claim.value}</span> : null}
      {claim.value && rest.length ? ' ' : null}
      {rest.length ? <span className="tabular-nums">{rest.join(' · ')}</span> : null}
      <span className="text-text-tertiary">
        {claim.value || rest.length ? ' · ' : ''}
        {claim.confidence}
      </span>
    </p>
  );
}

export function ClaimRow({ claim, mode, pending = false, onAction, readOnly = false }: ClaimRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasWhy = Boolean(claim.body || claim.impact || claim.drills.length || claim.tags.length || claim.movement);

  const run = (action: ClaimAction) => {
    setMenuOpen(false);
    onAction?.(action, claim.id);
  };

  const items: Array<{ action: ClaimAction; label: string }> =
    mode === 'coach'
      ? [
          { action: 'create_focus_area', label: 'Assign as focus area' },
          ...(claim.acknowledged ? [] : [{ action: 'acknowledged' as const, label: 'Acknowledge' }]),
          { action: 'dismissed', label: 'Dismiss' },
        ]
      : [
          { action: 'create_focus_area', label: 'Add to my plan' },
          ...(claim.acknowledged ? [] : [{ action: 'acknowledged' as const, label: 'Mark as seen' }]),
          { action: 'dismissed', label: 'Not useful' },
        ];

  return (
    <li className="border-t border-border-subtle py-4" data-slot="claim-row" aria-busy={pending || undefined}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body font-semibold text-text-primary">{claim.title}</p>
          <ClaimMeta claim={claim} />
          {claim.acknowledged ? (
            <p className="mt-1 font-fw-sans text-caption text-text-tertiary">{mode === 'coach' ? 'Acknowledged' : 'Seen'}</p>
          ) : null}
        </div>
        {readOnly || !onAction ? null : (
          <PopoverPanel
            open={menuOpen}
            onOpenChange={setMenuOpen}
            surface="matte"
            align="end"
            side="bottom"
            ariaLabel={`Actions for ${claim.title}`}
            trigger={
              <button
                type="button"
                disabled={pending}
                aria-label={`More actions for ${claim.title}`}
                className={cn(
                  '-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary outline-none',
                  'transition-colors [transition-duration:150ms] active:bg-surface-sunken',
                  'focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40',
                  '[@media(hover:hover)]:hover:bg-surface-sunken',
                )}
              >
                <IconMoreHorizontal size={20} aria-hidden="true" />
              </button>
            }
          >
            <ul role="menu" className="flex min-w-[200px] flex-col py-1">
              {items.map((it) => (
                <li key={it.action} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(it.action)}
                    className={cn(
                      'flex min-h-[44px] w-full items-center px-4 text-left font-fw-sans text-body text-text-primary outline-none',
                      'active:bg-surface-sunken focus-visible:bg-surface-sunken [@media(hover:hover)]:hover:bg-surface-sunken',
                      it.action === 'dismissed' && 'text-text-secondary',
                    )}
                  >
                    {it.label}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverPanel>
        )}
      </div>

      {hasWhy ? (
        <details className="group mt-2">
          <summary
            className={cn(
              'inline-flex min-h-[44px] cursor-pointer list-none items-center font-fw-sans text-body-sm font-medium text-accent-700 outline-none',
              'focus-visible:ring-2 focus-visible:ring-border-focus [&::-webkit-details-marker]:hidden',
            )}
          >
            <span className="group-open:hidden">Why</span>
            <span className="hidden group-open:inline">Hide</span>
          </summary>
          <div className="flex max-w-[64ch] flex-col gap-2 pb-1 font-fw-sans text-body-sm text-text-secondary">
            {claim.body ? <p>{claim.body}</p> : null}
            {claim.impact ? <p className="text-text-primary">{claim.impact}.</p> : null}
            {claim.movement ? <p>Previously: {claim.movement.replace(/^was /, '')}.</p> : null}
            {claim.tags.length ? <p className="text-caption text-text-tertiary">{claim.tags.join(' · ')}</p> : null}
            {claim.drills.length ? (
              <p>
                <span className="text-text-primary">Drills: </span>
                {claim.drills.map((d) => `${d.title}${d.minutes != null ? ` (${d.minutes} min)` : ''}`).join(', ')}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}

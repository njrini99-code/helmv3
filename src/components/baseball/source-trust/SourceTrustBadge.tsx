'use client';

// =============================================================================
// src/components/baseball/source-trust/SourceTrustBadge.tsx
//
// V5 System 2 — the small, consistent trust pill that EVERY data surface mounts
// next to a value (stat rows, import rows, signals, AI cards). Clicking it opens
// the SourceDrawer with full provenance.
//
// OWNED BY THE SOURCE-TRUST FOUNDATION PACKET. Fan-out surfaces only import it.
//
// Honesty (binding):
//  - conflict / logged-intent / unreviewed / ai-derived each render distinctly
//    (see trust-presentation.ts) so a planned or unverified value is never shown
//    as if it were trusted/observed.
//  - confidence renders "—" when null, never a fake 0%.
//  - low confidence (<60%) is de-emphasized, not hidden.
//
// Cream/green GolfHelm look — reuses the canonical <Badge> primitive + design
// icons. No golf labels. No new palette.
// =============================================================================

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  IconShieldCheck,
  IconShield,
  IconShieldAlert,
  IconDatabase,
  IconFile,
  IconSparkles,
  IconClock,
  IconInfo,
  IconWarning,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  getTrustPresentation,
  formatConfidence,
  type TrustIconKey,
} from './trust-presentation';
import { SourceDrawer } from './SourceDrawer';
import type { SourceTrustBadgeProps } from './source-trust-types';

function TrustIcon({ icon, size }: { icon: TrustIconKey; size: number }) {
  switch (icon) {
    case 'shield-check':
      return <IconShieldCheck size={size} />;
    case 'shield':
      return <IconShield size={size} />;
    case 'shield-alert':
      return <IconShieldAlert size={size} />;
    case 'database':
      return <IconDatabase size={size} />;
    case 'file':
      return <IconFile size={size} />;
    case 'sparkles':
      return <IconSparkles size={size} />;
    case 'clock':
      return <IconClock size={size} />;
    case 'info':
    default:
      return <IconInfo size={size} />;
  }
}

const SIZE_TO_BADGE = { sm: 'sm', md: 'md', lg: 'md' } as const;
const SIZE_TO_ICON = { sm: 11, md: 12, lg: 14 } as const;

export function SourceTrustBadge({
  trust,
  provenance,
  size = 'md',
  hideConfidence = false,
  iconOnly = false,
  onOpenDrawer,
  viewerRole,
  className,
}: SourceTrustBadgeProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const presentation = getTrustPresentation(trust);
  const conf = formatConfidence(trust.confidencePct);

  // The badge is interactive when it has somewhere to send the click — either a
  // parent-owned drawer (onOpenDrawer) or its own internal drawer (provenance).
  const interactive = Boolean(onOpenDrawer) || Boolean(provenance);

  const handleClick = () => {
    if (!interactive) return;
    if (onOpenDrawer && provenance) {
      onOpenDrawer(provenance, trust);
      return;
    }
    if (provenance) setInternalOpen(true);
  };

  const ariaLabel = `Source: ${presentation.trustLabel}${
    conf.missing
      ? ''
      : `, confidence ${conf.text}${conf.low ? ' (low)' : ''}`
  }${interactive ? '. Open source details.' : ''}`;

  const badge = (
    <Badge
      as={interactive ? 'button' : 'span'}
      tone={presentation.tone}
      appearance="soft"
      size={SIZE_TO_BADGE[size]}
      icon={<TrustIcon icon={presentation.icon} size={SIZE_TO_ICON[size]} />}
      className={cn(
        'tracking-tight',
        interactive &&
          'cursor-pointer hover:brightness-[0.97] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-cream-50',
        className,
      )}
      onClick={interactive ? handleClick : undefined}
      type={interactive ? 'button' : undefined}
      aria-label={ariaLabel}
      title={presentation.caption}
    >
      {!iconOnly && <span>{presentation.trustLabel}</span>}
      {!iconOnly && !hideConfidence && (
        <span
          className={cn(
            'tabular-nums font-normal',
            // Missing confidence renders "—" — this is exactly the honest
            // "no figure recorded" signal a coach must be able to read, so it
            // must clear WCAG AA. warm-400 (#a8a29e, ~2.3:1 on cream) fails;
            // warm-500 (#78716c, ~4.6:1) is the readable de-emphasized floor.
            conf.missing && 'text-warm-500',
            // Low-confidence caution figure is small tabular text — amber-700
            // (#b45309, ~4.9:1 on cream) clears AA where amber-600 (~3.4:1) is
            // only borderline for normal text. Keeps the amber caution language.
            // WCAG 1.4.1 (use of color): this is the single most decision-
            // critical number on the chip, so it must NOT rely on hue alone —
            // it is also weighted (font-medium vs the normal-confidence
            // font-normal) and carries a warning glyph cue below.
            conf.low && 'inline-flex items-center gap-0.5 text-amber-700 font-medium',
          )}
        >
          {conf.low && (
            <IconWarning
              size={SIZE_TO_ICON[size] - 1}
              className="flex-shrink-0"
              aria-hidden="true"
            />
          )}
          <span>· {conf.text}</span>
        </span>
      )}
    </Badge>
  );

  // When the parent owns the drawer (onOpenDrawer), render badge only.
  if (onOpenDrawer || !provenance) return badge;

  return (
    <>
      {badge}
      <SourceDrawer
        open={internalOpen}
        onOpenChange={setInternalOpen}
        trust={trust}
        provenance={provenance}
        viewerRole={viewerRole}
      />
    </>
  );
}

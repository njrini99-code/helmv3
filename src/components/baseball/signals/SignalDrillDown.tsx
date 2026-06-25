'use client';

// =============================================================================
// src/components/baseball/signals/SignalDrillDown.tsx
//
// [W6c] Signal drill-down glass slide-over.
//
// Opens from a signal card and shows the full source-backed narrative the card
// only previews: why_it_matters · evidence (parsed table) · recommended action
// label · limitation · source refs with sample_n. Radix Dialog rendered as a
// right-panel slide-over (not a bottom drawer) so the main signal list stays
// visible on desktop.
//
// Accessibility contract:
//   - Radix Dialog supplies focus trap, role="dialog", aria-modal=true.
//   - First focusable element (close button) receives focus on open.
//   - Escape closes via Radix default behavior.
//   - Close button has accessible label.
//   - Overlay click closes (Radix default).
//
// Design bar: glass panel — bg-white/90 backdrop-blur-2xl with warm border +
// shadow. Slow cinematic entrance (slide-in-from-right). Generous padding.
// No neon. Source refs render as honest rows (label + detail + sample_n).
// Limitation renders with an amber advisory strip — never missing when present.
// =============================================================================

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { m, LazyMotion, domAnimation } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconX,
  IconAlertCircle,
  IconList,
  IconChevronRight,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { DURATION, EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import {
  getSeverityPresentation,
  getCategoryLabel,
  getActionTypeLabel,
} from './signal-presentation';

// ─── helpers ─────────────────────────────────────────────────────────────────

function confidenceLabel(c: number | null): string {
  if (c === null) return '—';
  return `${Math.round(c * 100)}%`;
}

/** Parse a multi-item evidence string (semicolons or newlines). */
function parseEvidence(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?:;\s*|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

// ─── public interface ─────────────────────────────────────────────────────────

export interface SignalDrillDownProps {
  signal: SignalInboxRow | null;
  /** Display name of the player this signal concerns (if resolvable). */
  playerName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function SignalDrillDown({
  signal,
  playerName,
  open,
  onOpenChange,
}: SignalDrillDownProps) {
  const reduce = useReducedMotionGuard();

  // Derive the limitation text. Prefer the signal's stored limitation field
  // (baseball_signals.limitation — full column set). Fall back to the
  // sample-too-small sentinel so a starved signal always shows the caveat.
  const limitationText: string | null =
    (signal as SignalInboxRow & { limitation?: string | null })?.limitation ??
    (signal?.sampleTooSmall
      ? `Sample too small${signal.sampleN != null ? ` (n=${signal.sampleN})` : ''}. Treat as a watch item, not a confident finding.`
      : null);

  const sev = signal ? getSeverityPresentation(signal.severity) : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* ── Overlay ─────────────────────────────────────────────────── */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-warm-900/30 backdrop-blur-[3px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'duration-200',
          )}
        />

        {/* ── Panel ───────────────────────────────────────────────────── */}
        <DialogPrimitive.Content
          className={cn(
            // Positioning: fixed right panel — full height, capped width.
            'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col',
            'sm:max-w-md',
            // Glass surface.
            'bg-white/90 backdrop-blur-2xl border-l border-white/20',
            // Shadow — depth cue for the overlay pattern.
            'shadow-[−24px_0_64px_rgba(28,25,23,0.14)]',
            // Radix slide transitions.
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full',
            'duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          )}
          // Prevent Radix from trying to auto-focus the overlay; the close
          // button will receive focus via autoFocus below.
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-describedby="signal-drilldown-desc"
        >
          <LazyMotion features={domAnimation} strict>
            {signal && (
              <>
                {/* ── Header bar ────────────────────────────────────────── */}
                <div className="flex items-center justify-between gap-3 border-b border-warm-200/60 px-5 py-4">
                  <DialogPrimitive.Title asChild>
                    <h2 className="flex-1 truncate text-sm font-semibold text-warm-900 leading-snug">
                      Signal detail
                    </h2>
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close asChild>
                    <Button
                      variant="ghost"
                      aria-label="Close signal detail"
                      // autoFocus so Radix focuses here on panel open.
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="h-9 w-9 shrink-0 rounded-xl p-0 text-warm-500 hover:text-warm-900"
                    >
                      <IconX size={17} aria-hidden />
                    </Button>
                  </DialogPrimitive.Close>
                </div>

                {/* ── Scrollable body ───────────────────────────────────── */}
                <div
                  id="signal-drilldown-desc"
                  className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5"
                >
                  {/* Signal title + meta chips */}
                  <m.div
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={reduce ? false : { opacity: 1, y: 0 }}
                    transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {sev && (
                        <Badge tone={sev.tone} appearance="soft" size="sm">
                          {sev.label}
                        </Badge>
                      )}
                      <Badge tone="warm" appearance="outline" size="sm">
                        {getCategoryLabel(signal.category)}
                      </Badge>
                      <span className="text-xs text-warm-400 tabular-nums">
                        Confidence {confidenceLabel(signal.confidence)}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-warm-900 leading-snug">
                      {signal.title}
                    </h3>
                    {(playerName ?? signal.playerId == null) && (
                      <p className="mt-0.5 text-sm text-warm-500">
                        {playerName ?? 'Team-wide'}
                      </p>
                    )}
                  </m.div>

                  {/* ── Sample-too-small banner (first-class, binding) ────── */}
                  {signal.sampleTooSmall && (
                    <m.div
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={reduce ? false : { opacity: 1, y: 0 }}
                      transition={{ duration: DURATION.short, ease: EASE_CINEMATIC, delay: 0.05 }}
                      role="alert"
                      className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-3"
                    >
                      <IconAlertCircle
                        size={15}
                        className="mt-0.5 shrink-0 text-amber-500"
                        aria-hidden
                      />
                      <p className="text-sm leading-relaxed text-amber-800">
                        Sample too small
                        {signal.sampleN != null ? ` (n=${signal.sampleN})` : ''} — treat as
                        a watch item, not a confident finding.
                      </p>
                    </m.div>
                  )}

                  {/* ── Why it matters ──────────────────────────────────── */}
                  {signal.whyItMatters && (
                    <Section label="Why it matters">
                      <p className="text-sm leading-relaxed text-warm-700">
                        {signal.whyItMatters}
                      </p>
                    </Section>
                  )}

                  {/* ── Evidence ────────────────────────────────────────── */}
                  {signal.evidence && (
                    <Section label="Evidence">
                      <EvidenceBlock evidence={signal.evidence} />
                    </Section>
                  )}

                  {/* ── Recommended action label ─────────────────────────── */}
                  {signal.recommendedActionType &&
                    signal.recommendedActionType !== 'none' && (
                      <Section
                        label={
                          signal.sampleTooSmall
                            ? 'Possible next step (advisory)'
                            : 'Recommended action'
                        }
                      >
                        <div className="flex items-center gap-2">
                          <IconChevronRight
                            size={13}
                            className="shrink-0 text-primary-500"
                            aria-hidden
                          />
                          <p className="text-sm font-medium text-warm-800">
                            {signal.recommendedActionLabel ??
                              getActionTypeLabel(signal.recommendedActionType)}
                          </p>
                        </div>
                      </Section>
                    )}

                  {/* ── Limitation ─────────────────────────────────────── */}
                  {limitationText && (
                    <Section label="Limitation">
                      <div className="rounded-xl bg-warm-50 border border-warm-200/70 px-3.5 py-3">
                        <p className="text-sm leading-relaxed text-warm-600">
                          {limitationText}
                        </p>
                      </div>
                    </Section>
                  )}

                  {/* ── Source refs ─────────────────────────────────────── */}
                  <Section
                    label={
                      signal.sourceRefs.length > 0
                        ? `Source refs · ${signal.sourceRefs.length}`
                        : 'Source refs'
                    }
                  >
                    {signal.sourceRefs.length === 0 ? (
                      <p className="rounded-xl border border-amber-200/70 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                        Source not yet attached — this signal cannot be acted upon
                        with confidence.
                      </p>
                    ) : (
                      <ul className="space-y-2" aria-label="Source references">
                        {signal.sourceRefs.map((ref, i) => (
                          <SourceRefRow key={i} ref_={ref} />
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>
              </>
            )}
          </LazyMotion>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-warm-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function EvidenceBlock({ evidence }: { evidence: string }) {
  const parts = parseEvidence(evidence);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return <p className="text-sm leading-relaxed text-warm-700">{parts[0]}</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Evidence items">
      {parts.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-sm leading-relaxed text-warm-700"
        >
          <IconList
            size={12}
            aria-hidden
            className="mt-1 shrink-0 text-warm-400"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceRefRow({
  ref_,
}: {
  ref_: SignalInboxRow['sourceRefs'][number];
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-warm-100 bg-cream-50 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-warm-800">
          {ref_.label ?? ref_.source_table}
        </p>
        {ref_.source_table && ref_.label && (
          <p className="mt-0.5 font-mono text-xs text-warm-400 truncate">
            {ref_.source_table}
            {ref_.column ? `.${ref_.column}` : ''}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {ref_.sample_n != null && (
          <span className="text-xs tabular-nums text-warm-500">
            n={ref_.sample_n}
          </span>
        )}
        {ref_.confidence != null && (
          <Badge tone="warm" appearance="soft" size="sm">
            {Math.round(ref_.confidence * 100)}%
          </Badge>
        )}
      </div>
    </li>
  );
}

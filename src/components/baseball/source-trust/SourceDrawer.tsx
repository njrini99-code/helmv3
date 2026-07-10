'use client';

// =============================================================================
// src/components/baseball/source-trust/SourceDrawer.tsx
//
// V5 System 2 — the provenance sheet the SourceTrustBadge opens. Answers, for
// any surfaced value: where it came from, who put it there, when, from which
// file/row/field, how confident, what it relates to, who can see it, and its
// audit history. For AI-derived values it splits FACTS from INTERPRETATION
// honestly (V2 AI output contract).
//
// Also accepts signal-specific source data (sourceChips, confidence,
// limitation) for use by SignalCard. Per spec §3.4: when sourceChips /
// confidence / limitation are all null/undefined the drawer renders an explicit
// "Source not yet attached — this signal cannot be acted upon" message.
//
// OWNED BY THE SOURCE-TRUST FOUNDATION PACKET. Fan-out surfaces only import it.
//
// Honesty (binding):
//  - every nullable field renders "Not recorded" rather than a fabricated value.
//  - confidence shows "—" when null; low confidence (<60%) reads as a caution.
//  - logged-intent / conflict / unreviewed surface their honest caption up top.
//  - empty provenance => honest empty state (never a blank or fake panel).
//  - null sourceChips / confidence / limitation renders an explicit unactionable
//    warning (§3.4), never a silent blank.
//
// Built on the canonical <Drawer> primitive (vaul, cream/green). No golf labels.
// =============================================================================

import * as React from 'react';
import { LazyMotion, m, AnimatePresence } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconShieldCheck,
  IconShield,
  IconShieldAlert,
  IconDatabase,
  IconFile,
  IconSparkles,
  IconClock,
  IconInfo,
  IconChevronRight,
  IconWarning,
} from '@/components/icons';
import { cn, formatDateTime } from '@/lib/utils';
import {
  DURATION,
  EASE_CINEMATIC,
  STAGGER_STEP,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';
import { getTrustPresentation, formatConfidence, type TrustIconKey } from './trust-presentation';
import type {
  SourceDrawerProps,
  SourceProvenance,
  SourceTrust,
} from './source-trust-types';
import type { BaseballSignalSourceRef } from '@/lib/types/baseball-signals';

/**
 * Section wrapper that fades + rises into place on open, staggered behind its
 * siblings. Reduced-motion users get an instant render (no travel). Keeps the
 * drawer feeling composed rather than dumped on screen.
 */
function MotionSection({
  index,
  reduce,
  children,
}: {
  index: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={reduce ? false : { opacity: 1, y: 0 }}
      transition={{
        duration: DURATION.medium,
        ease: EASE_CINEMATIC,
        delay: index * STAGGER_STEP,
      }}
    >
      {children}
    </m.div>
  );
}

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

const VISIBILITY_LABELS: Record<string, string> = {
  staff_only: 'Staff only',
  player_visible: 'Player visible',
  restricted: 'Restricted',
};

function fmt(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  return value;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  try {
    return formatDateTime(value);
  } catch {
    return value;
  }
}

/** A labeled provenance row. Honest "Not recorded" when empty. */
function DetailRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-warm-100 last:border-0">
      <span className="text-body-sm text-warm-500 flex-shrink-0">{label}</span>
      <span
        className={cn(
          'text-body-sm text-right text-warm-900 font-medium',
          // "Not recorded" is the honesty model's core signal — the very value
          // the coach is being told is unverified must stay readable. warm-500
          // (#78716c, ~4.6:1 on cream) is the de-emphasized AA floor; warm-400
          // (~2.3:1) failed AA and made the flagged-as-missing value the hardest
          // thing to read.
          muted && 'text-warm-500 font-normal',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-500 mb-2">
      {children}
    </p>
  );
}

function ProvenanceBody({
  provenance,
  presentation,
  confText,
  confMissing,
  confLow,
  viewerRole,
  reduce,
}: {
  provenance: SourceProvenance;
  presentation: ReturnType<typeof getTrustPresentation>;
  confText: string;
  confMissing: boolean;
  confLow: boolean;
  /** When 'player', staff-internal visibility classification is omitted. */
  viewerRole?: 'coach' | 'player';
  reduce: boolean;
}) {
  const p = provenance;
  const isAi = presentation.icon === 'sparkles';
  const isConflict = presentation.tone === 'red';

  // Monotonic index so each rendered section staggers in behind the previous,
  // regardless of which optional sections are present.
  let sectionIndex = 0;
  const nextIndex = () => sectionIndex++;

  return (
    <div className="px-6 pb-8 space-y-6 overflow-y-auto">
      {/* Conflict callout — a true error state, surfaced as a visible banner
          (not just the header subtitle) so it cannot be skimmed past. Mirrors
          StatVisualFrame's Priority-4 caveat pattern, but red for error. */}
      {isConflict && (
        <MotionSection index={nextIndex()} reduce={reduce}>
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-[var(--notice-error-ink)]/10 px-3 py-2.5 text-body-sm text-text-primary ring-1 ring-[var(--notice-error-ink)]/20"
          >
            <IconShieldAlert size={16} className="mt-0.5 flex-shrink-0 text-[color:var(--notice-error-ink)]" />
            <span className="leading-relaxed">{presentation.caption}</span>
          </div>
        </MotionSection>
      )}

      {/* Provenance core */}
      <MotionSection index={nextIndex()} reduce={reduce}>
        <SectionLabel>Provenance</SectionLabel>
        <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4">
          <DetailRow label="Source" value={fmt(p.sourceName ?? p.ref.label)} />
          <DetailRow
            label="Confidence"
            value={
              <span
                className={cn(
                  'tabular-nums inline-flex items-center justify-end gap-1',
                  // Missing confidence "—" must stay readable (AA floor).
                  confMissing && 'text-warm-500 font-normal',
                  // --pursuit-ink clears AA for this small figure and keeps
                  // the caution reading as a soft warning, not an error.
                  // WCAG 1.4.1: pair the hue with a glyph + a "Low" qualifier so
                  // the caution is never carried by color alone.
                  confLow && 'text-pursuit font-semibold',
                )}
              >
                {confLow && (
                  <IconWarning size={13} className="flex-shrink-0" aria-hidden="true" />
                )}
                <span>{confText}</span>
                {confLow && (
                  <span className="text-caption font-medium text-pursuit">Low</span>
                )}
              </span>
            }
            muted={confMissing}
          />
          <DetailRow
            label={isAi ? 'Generated' : 'Recorded'}
            value={fmtDate(p.generatedAt ?? p.importedAt)}
            muted={!(p.generatedAt ?? p.importedAt)}
          />
          <DetailRow
            label={isAi ? 'Generated by' : 'Entered by'}
            value={fmt(p.importedBy)}
            muted={!p.importedBy}
          />
          {p.expiresAt && (
            <DetailRow label="Expires" value={fmtDate(p.expiresAt)} />
          )}
          {/* Visibility is a staff-routing concept; don't expose it to players
              (seeing "Staff only" on their own stat is confusing — they're
              already seeing it so the classification is moot for them). */}
          {p.visibility && viewerRole !== 'player' && (
            <DetailRow
              label="Visibility"
              value={VISIBILITY_LABELS[p.visibility] ?? p.visibility}
            />
          )}
        </div>
      </MotionSection>

      {/* Import detail — only when this came from a file */}
      {(p.rawFileName || p.rowNumber != null || p.mappedField) && (
        <MotionSection index={nextIndex()} reduce={reduce}>
          <SectionLabel>Import detail</SectionLabel>
          <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4">
            <DetailRow label="File" value={fmt(p.rawFileName)} muted={!p.rawFileName} />
            <DetailRow
              label="Row"
              value={p.rowNumber != null ? `#${p.rowNumber}` : 'Not recorded'}
              muted={p.rowNumber == null}
            />
            <DetailRow
              label="Mapped field"
              value={fmt(p.mappedField)}
              muted={!p.mappedField}
            />
          </div>
        </MotionSection>
      )}

      {/* AI honesty: facts vs interpretation.
          Always show this section for AI-derived values — even if no facts were
          captured, the empty state is more honest than silence ("no facts
          recorded" is itself meaningful to a coach reviewing an AI output). */}
      {isAi && (
        <MotionSection index={nextIndex()} reduce={reduce}>
          <SectionLabel>What this is built on</SectionLabel>
          {(!p.facts || p.facts.length === 0) && !p.interpretation && (
            <p className="text-body-sm text-warm-500 leading-relaxed">
              No source facts were recorded for this AI output.
            </p>
          )}
          {p.facts && p.facts.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {p.facts.map((fact, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-body-sm text-warm-700 leading-relaxed"
                >
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-primary-500 flex-shrink-0" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          )}
          {p.interpretation && (
            <div className="rounded-2xl border border-warm-200 bg-warm-50/60 px-4 py-3">
              <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-600 mb-1">
                Interpretation
              </p>
              <p className="text-body-sm text-warm-700 leading-relaxed">
                {p.interpretation}
              </p>
            </div>
          )}
        </MotionSection>
      )}

      {/* Related objects */}
      {p.relatedObjects && p.relatedObjects.length > 0 && (
        <MotionSection index={nextIndex()} reduce={reduce}>
          <SectionLabel>Related</SectionLabel>
          <div className="rounded-2xl border border-warm-200 bg-cream-50 divide-y divide-warm-100 overflow-clip">
            {p.relatedObjects.map((obj, i) => {
              const inner = (
                <>
                  <div className="min-w-0">
                    <p className="text-eyebrow uppercase tracking-wide text-warm-500">
                      {obj.kind}
                    </p>
                    <p className="text-body-sm text-warm-900 font-medium truncate">
                      {obj.label}
                    </p>
                  </div>
                  {obj.href && (
                    <IconChevronRight
                      size={16}
                      className="flex-shrink-0 text-warm-300 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-warm-400"
                    />
                  )}
                </>
              );
              return obj.href ? (
                <a
                  key={i}
                  href={obj.href}
                  className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
                >
                  {inner}
                </a>
              ) : (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  {inner}
                </div>
              );
            })}
          </div>
        </MotionSection>
      )}

      {/* Audit history */}
      {p.auditHistory && p.auditHistory.length > 0 && (
        <MotionSection index={nextIndex()} reduce={reduce}>
          <SectionLabel>History</SectionLabel>
          <ol className="space-y-3">
            {p.auditHistory.map((entry, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="mt-1 h-2 w-2 rounded-full bg-warm-300" />
                  {i < p.auditHistory!.length - 1 && (
                    <span className="w-px flex-1 bg-warm-200 my-1" />
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-body-sm text-warm-900 font-medium">
                    {entry.action}
                    {entry.actor && (
                      <span className="text-warm-500 font-normal"> · {entry.actor}</span>
                    )}
                  </p>
                  <p className="text-caption text-warm-500">{fmtDate(entry.at)}</p>
                  {entry.detail && (
                    <p className="text-caption text-warm-500 mt-0.5">{entry.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </MotionSection>
      )}
    </div>
  );
}

/**
 * Extended props for signal-specific source drawer sections.
 * Per spec §3.4: when all three are null/undefined the drawer surfaces an
 * explicit "Source not yet attached" message rather than hiding the section.
 */
export interface SignalSourceDrawerProps extends SourceDrawerProps {
  /** Source-ref chips from the signal's source_refs field. */
  sourceChips?: BaseballSignalSourceRef[] | null;
  /** Overall confidence [0,1] from the signal row. */
  signalConfidence?: number | null;
  /** Limitation text — e.g. sample-too-small caveat. */
  limitation?: string | null;
}

/**
 * Signal-specific source summary section. Rendered above the existing
 * ProvenanceBody when the drawer is opened from a SignalCard. Displays
 * source chips, confidence percentage, and limitation text. Per §3.4, all
 * absent fields render "Not provided" rather than hiding the section.
 */
function SignalSourceSection({
  sourceChips,
  signalConfidence,
  limitation,
}: {
  sourceChips?: BaseballSignalSourceRef[] | null;
  signalConfidence?: number | null;
  limitation?: string | null;
}) {
  const hasAnyData =
    (sourceChips != null && sourceChips.length > 0) ||
    signalConfidence != null ||
    limitation != null;

  if (!hasAnyData) {
    return (
      <div className="p-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-pursuit/10 border border-pursuit/20 px-3 py-2.5"
        >
          <IconWarning size={15} className="text-pursuit mt-0.5 flex-shrink-0" aria-hidden />
          <p className="text-body-sm text-text-primary leading-relaxed">
            Source not yet attached — this signal cannot be acted upon.
          </p>
        </div>
      </div>
    );
  }

  const confPct =
    signalConfidence != null ? Math.round(signalConfidence * 100) : null;
  const confText = confPct != null ? `${confPct}%` : '—';
  const confLow = confPct != null && confPct < 60;
  const confMissing = confPct == null;

  return (
    <div className="p-4 space-y-4">
      {/* Source chips */}
      <div>
        <SectionLabel>Sources</SectionLabel>
        {sourceChips == null || sourceChips.length === 0 ? (
          <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4">
            <DetailRow label="Sources" value="Not provided" muted />
          </div>
        ) : (
          <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4">
            {sourceChips.map((chip, i) => (
              <DetailRow
                key={i}
                label={chip.source_table}
                value={
                  chip.label
                    ? `${chip.label}${chip.sample_n != null ? ` (n=${chip.sample_n})` : ''}`
                    : chip.column
                      ? `.${chip.column}`
                      : 'Recorded'
                }
                muted={!chip.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confidence */}
      <div>
        <SectionLabel>Confidence</SectionLabel>
        <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4">
          <DetailRow
            label="Confidence"
            value={
              <span
                className={cn(
                  'tabular-nums inline-flex items-center justify-end gap-1',
                  confMissing && 'text-warm-500 font-normal',
                  confLow && 'text-pursuit font-semibold',
                )}
              >
                {confLow && (
                  <IconWarning size={13} className="flex-shrink-0" aria-hidden="true" />
                )}
                <span>{confText}</span>
                {confLow && (
                  <span className="text-caption font-medium text-pursuit">Low</span>
                )}
              </span>
            }
            muted={confMissing}
          />
        </div>
      </div>

      {/* Limitation */}
      <div>
        <SectionLabel>Limitation</SectionLabel>
        <div className="rounded-2xl border border-warm-200 bg-cream-50 px-4 py-3">
          <p className={cn('text-body-sm leading-relaxed', limitation ? 'text-warm-800' : 'text-warm-500')}>
            {limitation ?? 'Not provided'}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Shared drawer inner content (header + provenance body or empty state). */
function DrawerInner({
  trust,
  provenance,
  viewerRole,
  reduce,
}: {
  trust: SourceTrust | null;
  provenance: SourceProvenance | null;
  viewerRole?: 'coach' | 'player';
  reduce: boolean;
}) {
  const presentation = trust ? getTrustPresentation(trust) : null;
  const conf = formatConfidence(trust?.confidencePct ?? null);

  if (trust && presentation) {
    return (
      <>
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0',
                presentation.tone === 'primary' && 'bg-primary-50 text-primary-600',
                presentation.tone === 'red' && 'bg-[var(--notice-error-ink)]/10 text-[color:var(--notice-error-ink)]',
                presentation.tone === 'amber' && 'bg-pursuit/10 text-pursuit',
                presentation.tone === 'warm' && 'bg-warm-100 text-warm-500',
              )}
            >
              <TrustIcon icon={presentation.icon} size={18} />
            </span>
            <div className="min-w-0">
              <DrawerTitle className="text-title-3">
                {presentation.trustLabel}
              </DrawerTitle>
              <DrawerDescription>{trust.label}</DrawerDescription>
            </div>
          </div>
          <p className="text-body-sm text-warm-500 leading-relaxed mt-2">
            {presentation.caption}
          </p>
        </DrawerHeader>

        {provenance ? (
          <ProvenanceBody
            provenance={provenance}
            presentation={presentation}
            confText={conf.text}
            confMissing={conf.missing}
            confLow={conf.low}
            viewerRole={viewerRole}
            reduce={reduce}
          />
        ) : (
          <div className="px-6 pb-8">
            <EmptyState
              variant="compact"
              icon={<IconInfo size={28} />}
              title="No further detail recorded"
              description="This value carries a trust label but no additional provenance has been captured yet."
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="px-6 pb-8 pt-2">
      <EmptyState
        variant="compact"
        icon={<IconInfo size={28} />}
        title="No source selected"
        description="Open a source badge to see where a value came from."
      />
    </div>
  );
}

export function SourceDrawer({
  open,
  onOpenChange,
  trust,
  provenance,
  viewerRole,
}: SourceDrawerProps) {
  const reduce = useReducedMotionGuard();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-md sm:mx-auto">
        <LazyMotion features={loadFeatures} strict>
          <AnimatePresence mode="wait">
            {open && (
              <m.div
                key="source-drawer-content"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
              >
                <DrawerInner
                  trust={trust}
                  provenance={provenance}
                  viewerRole={viewerRole}
                  reduce={reduce}
                />
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Signal-specific variant of <SourceDrawer>. Renders signal source chips,
 * confidence, and limitation in a first-class section above the base
 * provenance body. Per spec §3.4: when all source data is absent the drawer
 * shows an explicit "Source not yet attached" warning.
 *
 * Uses AnimatePresence for open/close with useReducedMotion guard.
 */
export function SignalSourceDrawer({
  open,
  onOpenChange,
  trust,
  provenance,
  viewerRole,
  sourceChips,
  signalConfidence,
  limitation,
}: SignalSourceDrawerProps) {
  const reduce = useReducedMotionGuard();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-md sm:mx-auto">
        <LazyMotion features={loadFeatures} strict>
          <AnimatePresence mode="wait">
            {open && (
              <m.div
                key="signal-source-drawer-content"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
              >
                <DrawerHeader>
                  <DrawerTitle className="text-title-3">Signal Source</DrawerTitle>
                  <DrawerDescription>
                    Where this signal came from and how much to rely on it.
                  </DrawerDescription>
                </DrawerHeader>

                {/* Glass card wrapping the signal-specific section */}
                <div className="px-6 pb-2">
                  <div className="rounded-2xl border border-warm-200/40 bg-cream-50 overflow-hidden">
                    <SignalSourceSection
                      sourceChips={sourceChips}
                      signalConfidence={signalConfidence}
                      limitation={limitation}
                    />
                  </div>
                </div>

                {/* Standard provenance body below the signal section */}
                {trust && (
                  <DrawerInner
                    trust={trust}
                    provenance={provenance}
                    viewerRole={viewerRole}
                    reduce={reduce}
                  />
                )}
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </DrawerContent>
    </Drawer>
  );
}

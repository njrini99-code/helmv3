'use client';

// =============================================================================
// src/components/baseball/signals/SignalDrillDown.tsx
//
// [W6c] Signal drill-down — the full source-backed narrative a signal card only
// previews: why_it_matters · evidence (parsed list) · recommended action label ·
// limitation · source refs with sample_n. Built on the Fairway `<Sheet>` —
// docked `side="right"` panel at md+ so the main signal list stays visible on
// desktop, `mobileSide="bottom"` below md (Doctrine rule 4: every input/detail
// flow under `md` is a bottom sheet, never the desktop docked panel) — no
// bespoke Radix Dialog or useMediaQuery wiring here, the primitive resolves it.
//
// THE WAR ROOM lane (`pursuit` ink). Limitation renders through an honest
// InlineNotice advisory strip — never a yellow box, never missing when present.
// =============================================================================

import type { ReactNode } from 'react';
import { Sheet, InlineNotice } from '@/components/fairway';
import { InkBadge, Eyebrow, StatReadout, Reveal } from '@/components/baseball/living-annual';
import { IconList, IconChevronRight } from '@/components/icons';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import {
  getSeverityPresentation,
  getCategoryLabel,
  getActionTypeLabel,
} from './signal-presentation';

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  // Derive the limitation text. Prefer the signal's stored limitation field
  // (baseball_signals.limitation — full column set). Fall back to the
  // sample-too-small sentinel so a starved signal always shows the caveat.
  const limitationText: string | null =
    (signal as (SignalInboxRow & { limitation?: string | null }) | null)?.limitation ??
    (signal?.sampleTooSmall
      ? `Sample too small${signal.sampleN != null ? ` (n=${signal.sampleN})` : ''}. Treat as a watch item, not a confident finding.`
      : null);

  const sev = signal ? getSeverityPresentation(signal.severity) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      mobileSide="bottom"
      title="Signal detail"
      hideTitle
    >
      {signal ? (
        <Sheet.Body className="flex flex-col gap-5 pt-6">
          {/* Signal title + meta chips */}
          <Reveal>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {sev && <InkBadge label={sev.label} tone={sev.tone} variant={sev.variant} />}
                <InkBadge label={getCategoryLabel(signal.category)} tone="neutral" />
                <span className="inline-flex items-baseline gap-1 font-annual text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                  Confidence
                  <StatReadout
                    value={signal.confidence === null ? '—' : Math.round(signal.confidence * 100)}
                    suffix={signal.confidence === null ? undefined : '%'}
                    className="text-body-sm normal-case tracking-normal text-text-secondary"
                    ariaLabel="Confidence"
                  />
                </span>
              </div>
              <h2 className="font-annual text-h3 font-semibold leading-snug text-text-primary">
                {signal.title}
              </h2>
              {(playerName ?? signal.playerId == null) && (
                <p className="mt-0.5 font-annual text-body-sm text-text-tertiary">
                  {playerName ?? 'Team-wide'}
                </p>
              )}
            </div>
          </Reveal>

          {/* ── Sample-too-small banner (first-class, binding) ────── */}
          {signal.sampleTooSmall && (
            <InlineNotice tone="warning">
              Sample too small
              {signal.sampleN != null ? ` (n=${signal.sampleN})` : ''} — treat as a
              watch item, not a confident finding.
            </InlineNotice>
          )}

          {/* ── Why it matters ──────────────────────────────────── */}
          {signal.whyItMatters && (
            <Section label="Why it matters">
              <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
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
          {signal.recommendedActionType && signal.recommendedActionType !== 'none' && (
            <Section
              label={signal.sampleTooSmall ? 'Possible next step (advisory)' : 'Recommended action'}
            >
              <div className="flex items-center gap-2">
                <IconChevronRight size={13} className="shrink-0 text-pursuit" aria-hidden />
                <p className="font-annual text-body-sm font-medium text-text-primary">
                  {signal.recommendedActionLabel ?? getActionTypeLabel(signal.recommendedActionType)}
                </p>
              </div>
            </Section>
          )}

          {/* ── Limitation ─────────────────────────────────────── */}
          {limitationText && (
            <Section label="Limitation">
              <InlineNotice tone="warning">{limitationText}</InlineNotice>
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
              <InlineNotice tone="warning">
                Source not yet attached — this signal cannot be acted upon with
                confidence.
              </InlineNotice>
            ) : (
              <ul className="space-y-2" aria-label="Source references">
                {signal.sourceRefs.map((ref, i) => (
                  <SourceRefRow key={i} ref_={ref} />
                ))}
              </ul>
            )}
          </Section>
        </Sheet.Body>
      ) : null}
    </Sheet>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Eyebrow ink="muted" className="mb-1.5">
        {label}
      </Eyebrow>
      {children}
    </div>
  );
}

function EvidenceBlock({ evidence }: { evidence: string }) {
  const parts = parseEvidence(evidence);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return <p className="font-annual text-body-sm leading-relaxed text-text-secondary">{parts[0]}</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Evidence items">
      {parts.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 font-annual text-body-sm leading-relaxed text-text-secondary"
        >
          <IconList size={12} aria-hidden className="mt-1 shrink-0 text-text-tertiary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceRefRow({ ref_ }: { ref_: SignalInboxRow['sourceRefs'][number] }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-annual text-body-sm font-medium text-text-primary">
          {ref_.label ?? ref_.source_table}
        </p>
        {ref_.source_table && ref_.label && (
          <p className="mt-0.5 truncate font-fw-mono text-eyebrow text-text-tertiary">
            {ref_.source_table}
            {ref_.column ? `.${ref_.column}` : ''}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {ref_.sample_n != null && (
          <span className="font-annual text-eyebrow tabular-nums text-text-tertiary">
            n={ref_.sample_n}
          </span>
        )}
        {ref_.confidence != null && (
          <InkBadge label={`${Math.round(ref_.confidence * 100)}%`} tone="neutral" />
        )}
      </div>
    </li>
  );
}

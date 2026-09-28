import type { ComponentType } from 'react';
import { AlertTriangle, CheckCircle2, Circle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StateChip } from './Row';
import { RelativeTime } from './RelativeTime';
import {
  PROOF_MILESTONE_LABEL,
  PROOF_GAP_LABEL,
  EVIDENCE_DIMENSION_LABEL,
  type ProofDot,
  type ProofState,
  type ProofGap,
  type EvidenceCoverage,
} from '@/lib/admin/incidents/types';

/**
 * The Bridge's proof strip — six evidence MILESTONES, not a percentage.
 *
 * WHY NOT A PROGRESS BAR. A progress bar implies a smooth, ordered march from
 * 0% to 100% along one axis. Proof does not work that way: `ci-proven` can be
 * true while `deployed` is false, `production-verified` can be `unknown`
 * because the deploy lookup itself failed (not because nothing has happened
 * yet), and `failed` is a genuinely different fact from `not-reached` — a
 * regression, not a step not taken. Each dot is a SPECIFIC claim with its own
 * evidence (`memory` — see `ProofDot.evidence`), which is exactly what
 * `src/lib/admin/incidents/types.ts` documents at `PROOF_MILESTONES`: "4 of 6
 * is a factual statement about which milestones have evidence; `67%
 * confident` would imply a calibration this system does not have." Rendering
 * this as a percent or a filled bar would manufacture that calibration.
 *
 * Shapes carry the state so colour is never the only channel: `proven` is a
 * filled circle, `pending` a half-filled circle, `not-reached` a hollow
 * circle, `failed` a filled square with an "!" mark (a different SHAPE, not
 * just a different colour, because a colour-blind reader must still be able
 * to tell "contradicted" from "not yet due"), and `unknown` a dashed circle
 * with a "?" — deliberately NOT the same hollow-circle shape as
 * `not-reached`, because "we could not read this" and "this has not
 * happened yet" are different facts and collapsing them is the exact
 * unknown-as-orderly-progress failure `ProofState`'s doc comment warns about.
 *
 * Everything here is drawn as inline SVG rather than a Unicode glyph
 * (● ◐ ○ ■) — glyph coverage and rendering vary by platform font, and a
 * proof stage silently going blank on one operator's phone is not an
 * acceptable failure mode for evidence UI.
 */

const PROOF_STATE_ORDER: readonly ProofState[] = ['proven', 'pending', 'not-reached', 'failed', 'unknown'] as const;

const PROOF_STATE_WORD: Readonly<Record<ProofState, string>> = {
  proven: 'proven',
  pending: 'pending',
  'not-reached': 'not reached',
  failed: 'failed',
  unknown: 'unknown',
};

/** The bare shape for one proof state — shared by the strip's dots and the legend's swatches, so the two can never drift apart. */
function ProofGlyphShape({ state, className }: { state: ProofState; className?: string }) {
  switch (state) {
    case 'proven':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="fill-fw-success" />
        </svg>
      );
    case 'pending':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="fill-none stroke-fw-warning" strokeWidth="2" />
          <path d="M10 2a8 8 0 0 1 0 16z" className="fill-fw-warning" />
        </svg>
      );
    case 'not-reached':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="fill-none stroke-warm-300" strokeWidth="2" />
        </svg>
      );
    case 'failed':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="3" className="fill-fw-danger" />
          {/* text-eyebrow (11px), not an arbitrary text-[Npx] — the SVG's own
              viewBox-to-viewport scaling shrinks it to the right glyph size
              at render time (helm/no-arbitrary-text-px). */}
          <text x="10" y="14.5" textAnchor="middle" className="fill-white text-eyebrow">
            !
          </text>
        </svg>
      );
    case 'unknown':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="fill-none stroke-warm-400" strokeWidth="2" strokeDasharray="2.5 2.5" />
          <text x="10" y="13.5" textAnchor="middle" className="fill-warm-500 text-eyebrow">
            ?
          </text>
        </svg>
      );
  }
}

const DOT_PX: Readonly<Record<'sm' | 'md', string>> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
};

/** One dot — the SVG shape (decorative, `aria-hidden`) inside a `title`-bearing
 *  wrapper, so hovering names the exact milestone and its evidence. The strip
 *  around it carries the one accessible label; this is a supplementary hint,
 *  never the only place the milestone name lives. */
function ProofDotGlyph({ dot, size }: { dot: ProofDot; size: 'sm' | 'md' }) {
  const title = dot.evidence ? `${PROOF_MILESTONE_LABEL[dot.milestone]}: ${dot.evidence}` : PROOF_MILESTONE_LABEL[dot.milestone];
  return (
    <span title={title} className="inline-flex shrink-0">
      <ProofGlyphShape state={dot.state} className={cn('shrink-0', DOT_PX[size])} />
    </span>
  );
}

/**
 * The six-stage proof strip.
 *
 * NOT A PERCENT SCORE — see the module doc comment above. `proof.length` is
 * always `PROOF_MILESTONES.length` in production (the read model fills every
 * milestone, even when its state is `unknown`), but this component makes no
 * assumption about that; it renders whatever it is given, in the order
 * given, and reports the true count.
 *
 * The whole strip carries exactly ONE accessible label (`role="img"` +
 * `aria-label`), built from `PROOF_MILESTONE_LABEL` and the state each dot is
 * actually in — never hardcoded milestone names, so a future seventh
 * milestone cannot silently go unannounced.
 */
export function ProofDots({ proof, size = 'sm' }: { proof: readonly ProofDot[]; size?: 'sm' | 'md' }) {
  const completed = proof.filter((d) => d.state === 'proven').length;
  const summary = proof.map((d) => `${PROOF_MILESTONE_LABEL[d.milestone].toLowerCase()} ${PROOF_STATE_WORD[d.state]}`).join(', ');
  const label = `${completed} of ${proof.length} proof stages complete: ${summary}`;

  return (
    <div role="img" aria-label={label} className="inline-flex items-center gap-1">
      {proof.map((dot) => (
        <ProofDotGlyph key={dot.milestone} dot={dot} size={size} />
      ))}
    </div>
  );
}

/** The five proof-state swatches, for a detail view that wants to spell out
 *  what each shape means once rather than repeating it per dot. */
export function ProofLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-warm-500">
      {PROOF_STATE_ORDER.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <ProofGlyphShape state={state} className="h-3.5 w-3.5 shrink-0" />
          <span>{PROOF_STATE_WORD[state]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Work that looks solved but still lacks the evidence to say so — one line
 * per gap. `gap.detail` is the useful half of this list ("iOS calls since
 * deploy: 4", not "awaiting traffic"); it is rendered verbatim, never
 * shortened to the category label, because the category alone is exactly
 * the information an operator already has from the chip next to it.
 *
 * Renders nothing (not an empty list, not a "no gaps" line) when `gaps` is
 * empty — an empty gap list is a fact worth not saying twice.
 */
export function ProofGapList({ gaps }: { gaps: readonly ProofGap[] }) {
  if (gaps.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {gaps.map((gap, i) => (
        <li key={`${gap.kind}-${i}`} className="flex items-start gap-2 text-caption leading-5 text-warm-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-fw-warning-ink" aria-hidden />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            <span className="font-medium text-warm-700">{PROOF_GAP_LABEL[gap.kind]}</span>
            {' — '}
            {gap.detail}
            {gap.ageMs !== null ? (
              <>
                {' · '}
                <RelativeTime sinceMs={Date.now() - gap.ageMs} className="text-warm-400" />
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

type DimensionState = EvidenceCoverage['dimensions'][number]['state'];

const EVIDENCE_TONE: Readonly<Record<DimensionState, 'accent' | 'neutral' | 'warning'>> = {
  // `present` is deliberately ACCENT, not success — this checklist states
  // whether an artefact exists, not that anything is healthy. Accent means
  // "there is useful intelligence here", which is exactly what a present
  // dimension is; green is reserved for verified success and a checklist
  // entry existing is not that (design law: never green for "record
  // exists").
  present: 'accent',
  absent: 'neutral',
  unknown: 'warning',
};

const EVIDENCE_ICON: Readonly<Record<DimensionState, ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>>> = {
  present: CheckCircle2,
  absent: Circle,
  unknown: HelpCircle,
};

const EVIDENCE_STATE_WORD: Readonly<Record<DimensionState, string>> = {
  present: 'present',
  absent: 'absent',
  unknown: 'unknown',
};

/**
 * Mechanical evidence coverage as a segmented CHECKLIST.
 *
 * Deliberately NOT a radar/spider chart. A radar plots each dimension on a
 * shared numeric axis and draws a filled polygon through them, which invites
 * reading the shape as a magnitude — "this incident has MORE evidence in
 * this direction" — for data that is actually binary (present or absent) or
 * outright unreadable (`unknown`). A checklist can only say what it actually
 * knows: each dimension renders its own word, icon and tone, and there is no
 * aggregate shape to over-read.
 *
 * Reuses `StateChip` (`./Row.tsx`) rather than a bespoke chip, per the row
 * language this tab already speaks.
 */
export function EvidenceCoverageStrip({ coverage }: { coverage: EvidenceCoverage }) {
  const label = `Evidence ${coverage.present}/${coverage.total}`;

  return (
    <div>
      <ul className="flex flex-wrap gap-1.5">
        {coverage.dimensions.map((d) => {
          const Icon = EVIDENCE_ICON[d.state];
          const title = `${EVIDENCE_DIMENSION_LABEL[d.dimension]}: ${EVIDENCE_STATE_WORD[d.state]}`;
          return (
            <li key={d.dimension}>
              <StateChip tone={EVIDENCE_TONE[d.state]} title={title}>
                <Icon size={11} aria-hidden />
                {EVIDENCE_DIMENSION_LABEL[d.dimension]}
              </StateChip>
            </li>
          );
        })}
      </ul>
      {/* The one-sentence tally — the textual summary a screen reader (or a
          quick scan) gets for free, so the checklist above is never the only
          explanation of how much evidence exists. */}
      <p className="mt-1 text-caption text-warm-500">{label}</p>
    </div>
  );
}

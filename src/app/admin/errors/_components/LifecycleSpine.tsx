import { cn } from '@/lib/utils';
import {
  LIFECYCLE_LABEL,
  type UnifiedIncident,
  type LifecycleVerdict,
  type LifecycleReasonLine,
  type ProofDot,
  type ProofState,
} from '@/lib/admin/incidents/types';

/**
 * The six-stage operator narrative for one incident: Capture → Diagnose →
 * Repair → Release → Verify → Close.
 *
 * WHY A SEPARATE SHAPE FROM `PROOF_MILESTONES`. `types.ts` names six proof
 * milestones for evidence purposes (`observed`, `analyzed`, `reproduced`,
 * `ci-proven`, `deployed`, `production-verified`); this spine names six
 * STAGES for narrative purposes, and they are not 1:1 — Repair is a single
 * operator-facing stage even though it rests on two separate pieces of
 * evidence (`reproduced` + `ci-proven`), because "did repair reproduce the
 * bug" and "did CI accept the fix" are one question to an operator scanning
 * a card, however differently they are proven underneath. `deriveStages`
 * below is where that merge happens, and it happens exactly once so the
 * spine and any future consumer of the same derivation cannot disagree.
 *
 * DERIVED, NEVER STORED — same rule `lifecycle.ts` and `proof.ts` both state
 * for their own outputs. This module takes an already-computed
 * `UnifiedIncident` and reads its `proof` and `resolution` fields; it does
 * no I/O and stores nothing itself.
 */

export const LIFECYCLE_STAGES = [
  { id: 'capture', label: 'Capture' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'repair', label: 'Repair' },
  { id: 'release', label: 'Release' },
  { id: 'verify', label: 'Verify' },
  { id: 'close', label: 'Close' },
] as const;

type StageId = (typeof LIFECYCLE_STAGES)[number]['id'];

interface StageStatus {
  id: StageId;
  label: string;
  state: ProofState;
  /** Evidence lines for this stage — empty when nothing to show. Never an
   *  invented string: a stage with no evidence shows nothing, per the
   *  contract on `ProofDot.evidence` in types.ts. */
  evidence: readonly string[];
}

// ---------------------------------------------------------------------------
// Glyphs — inline SVG, never a Unicode character. Deliberately the same
// visual vocabulary as ProofDots.tsx (filled circle / half circle / hollow
// circle / square-with-! / dashed-circle-with-?) so an operator reading both
// this spine and the proof strip on the same page is reading one language,
// not two that happen to agree by coincidence. Not imported from there —
// ProofDots.tsx exports only its composed components, not the bare shape —
// so this is a deliberate, small, local redraw, not a copy of live code.
// ---------------------------------------------------------------------------

type GlyphKind = 'positive' | 'pending' | 'negative' | 'neutral' | 'unknown';

function GlyphShape({ kind, className }: { kind: GlyphKind; className?: string }) {
  switch (kind) {
    case 'positive':
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
    case 'neutral':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="fill-none stroke-warm-300" strokeWidth="2" />
        </svg>
      );
    case 'negative':
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="3" className="fill-fw-danger" />
          <text x="10" y="14.5" textAnchor="middle" className="fill-white text-eyebrow">
            !
          </text>
        </svg>
      );
    case 'unknown':
      // Deliberately NOT the same hollow circle as `neutral` (not-reached) —
      // "we could not read this" and "this has not happened yet" are
      // different facts, and collapsing them into one shape is the exact
      // unknown-as-orderly-progress failure ProofState's own doc comment
      // (types.ts) warns against.
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

const STAGE_GLYPH_KIND: Readonly<Record<ProofState, GlyphKind>> = {
  proven: 'positive',
  pending: 'pending',
  'not-reached': 'neutral',
  failed: 'negative',
  unknown: 'unknown',
};

/** The word an operator reads next to a stage glyph. Deliberately "in
 *  progress" rather than proof.ts's "pending" — this is stage-level
 *  narrative copy, not the evidence vocabulary, and "in progress" is the
 *  honest word for a stage actively being worked. */
const STAGE_STATE_WORD: Readonly<Record<ProofState, string>> = {
  proven: 'proven',
  pending: 'in progress',
  'not-reached': 'not reached',
  failed: 'failed',
  unknown: 'unknown',
};

const STAGE_STATE_INK: Readonly<Record<ProofState, string>> = {
  proven: 'text-fw-success-ink',
  pending: 'text-fw-warning-ink',
  'not-reached': 'text-warm-400',
  failed: 'text-fw-danger-ink',
  unknown: 'text-warm-500',
};

function StageGlyph({ state, className }: { state: ProofState; className?: string }) {
  return <GlyphShape kind={STAGE_GLYPH_KIND[state]} className={cn('h-[18px] w-[18px] shrink-0', className)} />;
}

/**
 * Worst-wins merge for a stage backed by more than one proof dot (Repair
 * alone, today). Same precedence the rest of this package uses for
 * multi-signal derivation (`lifecycle.ts`'s own header calls this "worst
 * wins" and states why): a contradiction outranks an unread source, an
 * unread source outranks work still in flight, and nothing may claim
 * `proven` unless every contributing dot does.
 */
function mergeStageState(states: readonly ProofState[]): ProofState {
  if (states.some((s) => s === 'failed')) return 'failed';
  if (states.some((s) => s === 'unknown')) return 'unknown';
  if (states.some((s) => s === 'pending')) return 'pending';
  if (states.length > 0 && states.every((s) => s === 'proven')) return 'proven';
  return 'not-reached';
}

function evidenceFor(dot: ProofDot | undefined): readonly string[] {
  return dot?.evidence ? [dot.evidence] : [];
}

/**
 * Map one incident's evidence onto the six operator-facing stages.
 *
 * Close is the one stage not backed by a `ProofDot` at all — it reads
 * `incident.resolution` directly, per the mapping the caller specified. A
 * regression is folded in as a CONTRADICTION rather than an absence: a
 * `resolution` row can still be present on a regressed incident (a prior
 * human resolution that a later occurrence contradicted — see
 * `lifecycle.ts`'s own `regressed` branch), and rendering that as a plain
 * "proven" close would hide the single highest-value signal this system
 * produces.
 */
function deriveStages(incident: UnifiedIncident): StageStatus[] {
  const byMilestone = new Map(incident.proof.map((dot) => [dot.milestone, dot]));
  const observed = byMilestone.get('observed');
  const analyzed = byMilestone.get('analyzed');
  const reproduced = byMilestone.get('reproduced');
  const ciProven = byMilestone.get('ci-proven');
  const deployed = byMilestone.get('deployed');
  const productionVerified = byMilestone.get('production-verified');

  const repairState = mergeStageState([reproduced?.state ?? 'unknown', ciProven?.state ?? 'unknown']);
  const repairEvidence = [...evidenceFor(reproduced), ...evidenceFor(ciProven)];

  const regressed = incident.lifecycle.state === 'regressed';
  const closeState: ProofState = regressed ? 'failed' : incident.resolution !== null ? 'proven' : 'not-reached';
  const closeEvidence: readonly string[] = regressed
    ? ['Observed again after being marked resolved — this contradicts the close.']
    : incident.resolution !== null
      ? [
          `Resolved by ${
            incident.resolution.resolvedBy === 'auto'
              ? 'the nightly cron'
              : incident.resolution.resolvedBy === 'manual'
                ? 'a human operator'
                : 'an unknown process'
          }.`,
        ]
      : [];

  return [
    { id: 'capture', label: 'Capture', state: observed?.state ?? 'unknown', evidence: evidenceFor(observed) },
    { id: 'diagnose', label: 'Diagnose', state: analyzed?.state ?? 'unknown', evidence: evidenceFor(analyzed) },
    { id: 'repair', label: 'Repair', state: repairState, evidence: repairEvidence },
    { id: 'release', label: 'Release', state: deployed?.state ?? 'unknown', evidence: evidenceFor(deployed) },
    { id: 'verify', label: 'Verify', state: productionVerified?.state ?? 'unknown', evidence: evidenceFor(productionVerified) },
    { id: 'close', label: 'Close', state: closeState, evidence: closeEvidence },
  ];
}

/**
 * The lifecycle spine — one row of six stages, horizontal on desktop and a
 * vertical spine on mobile. Same data, same DOM, different geometry: this
 * renders the stage list exactly once and lets responsive classes reflow
 * it, rather than rendering two competing layouts that could drift apart.
 */
export function LifecycleSpine({ incident }: { incident: UnifiedIncident }) {
  const stages = deriveStages(incident);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start">
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        return (
          <div key={stage.id} data-lifecycle-stage={stage.id} className="flex gap-3 pb-4 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5 sm:pb-0 sm:text-center">
            <div className="flex flex-col items-center gap-1 sm:w-full sm:flex-row sm:gap-1.5">
              <StageGlyph state={stage.state} />
              {!isLast ? (
                <span
                  aria-hidden
                  className="mt-0.5 min-h-[1rem] w-px flex-1 bg-warm-200 sm:mt-0 sm:h-px sm:w-auto sm:min-h-0"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold uppercase tracking-widest text-warm-800">{stage.label}</p>
              <p className={cn('text-caption font-medium', STAGE_STATE_INK[stage.state])}>{STAGE_STATE_WORD[stage.state]}</p>
              {stage.evidence.map((line, idx) => (
                <p key={idx} className="mt-0.5 break-words text-caption text-warm-500 [overflow-wrap:anywhere] sm:mx-auto sm:max-w-[9rem]">
                  {line}
                </p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LifecycleWhy
// ---------------------------------------------------------------------------

const REASON_GLYPH_KIND: Readonly<Record<LifecycleReasonLine['status'], GlyphKind>> = {
  met: 'positive',
  pending: 'pending',
  failed: 'negative',
};

const REASON_WORD: Readonly<Record<LifecycleReasonLine['status'], string>> = {
  met: 'met',
  pending: 'pending',
  failed: 'failed',
};

const REASON_INK: Readonly<Record<LifecycleReasonLine['status'], string>> = {
  met: 'text-fw-success-ink',
  pending: 'text-fw-warning-ink',
  failed: 'text-fw-danger-ink',
};

/**
 * The "why am I seeing this?" disclosure behind one lifecycle verdict.
 *
 * A derived state an operator cannot interrogate is one they eventually
 * stop believing — this is the mechanical answer to that: every chip this
 * page renders has to be able to show its working, and this is where the
 * lifecycle chip shows its. `verdict.because` already carries the ordered
 * checks (`lifecycle.ts` builds them in the order an operator would ask
 * them); this only renders them, it derives nothing itself.
 */
export function LifecycleWhy({ verdict }: { verdict: LifecycleVerdict }) {
  return (
    <div>
      <h3 className="text-eyebrow uppercase text-warm-500">Why &quot;{LIFECYCLE_LABEL[verdict.state]}&quot;?</h3>
      <p className="mt-1 text-sm text-warm-900">{verdict.headline}</p>
      <ul className="mt-2 space-y-1.5">
        {verdict.because.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-caption leading-5 text-warm-700">
            <GlyphShape kind={REASON_GLYPH_KIND[line.status]} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className={cn('font-semibold uppercase', REASON_INK[line.status])}>{REASON_WORD[line.status]}</span>
              {' — '}
              {line.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

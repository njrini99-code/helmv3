import { cn } from '@/lib/utils';
import {
  EVIDENCE_COVERAGE_SOURCE_LABEL,
  type EvidenceCoverageCell,
  type EvidenceSourceCoverage,
} from '@/lib/admin/incidents/coverage';
import { UnknownValue } from './UnknownValue';

/**
 * ============================================================================
 * Bridge Premium · EvidenceSourceChips + SourceConfidenceRing
 * ----------------------------------------------------------------------------
 * The shared six-source evidence-coverage vocabulary (brief §13 "per-source
 * ✓ / ? with 'unavailable' spelled out", §36 "a reusable SourceConfidenceRing
 * ('Evidence 3/4 · Sentry ✓ · Supabase ✓ · Flight Recorder ✓ · Vercel ?')").
 * Both components share one data model (`EvidenceSourceCoverage` from
 * `coverage.ts`) so a card's compact ring and the Evidence Inspector's full
 * chip row can never disagree about the same incident.
 *
 * BLIND ≠ ABSENT ≠ HEALTHY-ZERO — the distinction this file exists to draw:
 *   - a CHECKED cell (`health === 'reading'`) is real, positive evidence —
 *     tone success, glyph ✓.
 *   - a PARTIAL cell (`health === 'partial'`) has SOME evidence, just not a
 *     complete read — tone warning, glyph ?, never rendered identically to
 *     a clean check.
 *   - an UNKNOWN cell (`health === 'unknown'`) was never attempted at all —
 *     routed through `UnknownValue`'s hatched treatment, the same "we have
 *     no opinion" rendering every other Bridge Premium surface uses, never a
 *     bare "?" that could be misread as "checked and inconclusive".
 *   - a BLIND cell (`health === 'blind'`) is the worst case — the read was
 *     ATTEMPTED and FAILED — tone danger, glyph "blind" spelled out, never
 *     folded into the same visual bucket as "partial" or "unknown".
 * No cell is ever silently dropped: `coverage.ts`'s `buildEvidenceCoverage`
 * always returns exactly six cells, in the same order, so a source with
 * nothing to say still occupies its place in the row.
 * ========================================================================== */

const CELL_TONE_CLASS: Readonly<Record<EvidenceCoverageCell['mark'], string>> = {
  check: 'bg-fw-success-bg text-accent-700 border-accent-200',
  question: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
  blind: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
};

const CELL_GLYPH: Readonly<Record<EvidenceCoverageCell['mark'], string>> = {
  check: '✓',
  question: '?',
  blind: 'blind',
};

function SourceChip({ cell, size }: { cell: EvidenceCoverageCell; size: 'sm' | 'md' }) {
  const label = EVIDENCE_COVERAGE_SOURCE_LABEL[cell.source];

  // 'unknown' health (never attempted) gets the shared hatched treatment
  // instead of a warning-toned "?" — distinct from 'partial' (attempted,
  // incomplete), which still earns the ordinary question-mark chip.
  if (cell.health === 'unknown') {
    return (
      <UnknownValue size={size} reason={cell.reason} className="shrink-0">
        {label}
      </UnknownValue>
    );
  }

  return (
    <span
      title={cell.reason ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-fw-sans font-medium',
        'whitespace-nowrap align-middle',
        size === 'sm' ? 'h-5 px-1.5 text-caption gap-1' : 'h-6 px-2 text-caption gap-1.5',
        CELL_TONE_CLASS[cell.mark],
      )}
    >
      <span aria-hidden="true" className="font-fw-mono">
        {CELL_GLYPH[cell.mark]}
      </span>
      {label}
    </span>
  );
}

export interface EvidenceSourceChipsProps {
  coverage: EvidenceSourceCoverage;
  size?: 'sm' | 'md';
  className?: string;
}

/** The full six-chip row — for the Evidence Inspector and the Incident
 *  Genome, where there is room to name every source individually. */
export function EvidenceSourceChips({ coverage, size = 'md', className }: EvidenceSourceChipsProps) {
  return (
    <div
      data-slot="bridge-evidence-source-chips"
      role="list"
      aria-label={`Evidence coverage ${coverage.present} of ${coverage.total} sources`}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {coverage.cells.map((cell) => (
        <span key={cell.source} role="listitem">
          <SourceChip cell={cell} size={size} />
        </span>
      ))}
    </div>
  );
}

export interface SourceConfidenceRingProps {
  coverage: EvidenceSourceCoverage;
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/**
 * A compact circular read of `present / total`, ringed danger whenever any
 * source is BLIND (a failed read outranks an incomplete one, visually — the
 * ring is never a cheerful color while a source is actively lying dark) and
 * warning when the read is merely incomplete. Text always travels alongside
 * the ring — "Evidence 3/6" — per "color is never the only indicator".
 */
export function SourceConfidenceRing({ coverage, size = 36, className }: SourceConfidenceRingProps) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = coverage.total > 0 ? coverage.present / coverage.total : 0;
  const dash = circumference * fraction;

  const ringColorVar = coverage.anyBlind
    ? 'var(--fw-color-danger)'
    : coverage.present === coverage.total
      ? 'var(--fw-color-success)'
      : 'var(--fw-color-warning)';

  return (
    <div
      data-slot="bridge-source-confidence-ring"
      className={cn('inline-flex items-center gap-2', className)}
      title={`Evidence ${coverage.present}/${coverage.total} of sources read${coverage.anyBlind ? ' — at least one source is blind' : ''}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Evidence coverage ${coverage.present} of ${coverage.total}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--fw-color-warm-200)"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColorVar}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="font-fw-mono text-caption tabular-nums text-warm-700">
        {coverage.present}/{coverage.total}
      </span>
    </div>
  );
}

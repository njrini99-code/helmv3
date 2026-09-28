import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  INCIDENT_SOURCE_LABEL,
  SOURCE_HEALTH_LABEL,
  type IncidentSourceEvidence,
  type SourceHealth,
  type IncidentAnalysis,
  type RepairVerdict,
  type IncidentRepair,
  type RepairStatus,
  type IncidentDeployProof,
  type IncidentResolution,
} from '@/lib/admin/incidents/types';
import { RCA_CATEGORY_LABEL, type RcaCategory } from '@/lib/admin/rca-category';
import { LocalTime } from '../../_components/LocalTime';

/**
 * The evidence wall: every artefact a Diagnose/Repair/Release cycle has
 * actually produced for one incident, rendered so an operator can check the
 * system's work rather than take a chip's word for it.
 *
 * Every card here follows the same honesty contract `types.ts` states for
 * the read model as a whole: a null is a DIFFERENT fact from a zero or an
 * empty string, and this file never collapses one into the other to make a
 * card look tidier. Where that costs an extra branch (an unreadable check
 * matrix, a deploy status nobody could confirm), the extra branch stays.
 */

// ---------------------------------------------------------------------------
// Chip — StateChip (./Row.tsx) plus a `success` tone.
//
// Row.tsx's StateChip deliberately has no success tone: on that surface
// (the incident queue) green is reserved for verified production success,
// which almost nothing in a row of open incidents actually is. This wall is
// different — "production serves the fix" and "the diagnosis was confirmed"
// are both genuine verified-success facts this file needs to say, the same
// way ProofDots.tsx and PanelStates.tsx already use `fw-success` tokens for
// exactly that. Same visual language as StateChip (rounded, uppercase,
// eyebrow-sized), one more tone.
// ---------------------------------------------------------------------------

type ChipTone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral';

function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-eyebrow font-semibold uppercase leading-4',
        tone === 'success' && 'bg-fw-success-bg text-fw-success-ink',
        tone === 'accent' && 'bg-accent-600/15 text-accent-700',
        tone === 'warning' && 'bg-fw-warning-bg text-fw-warning-ink',
        tone === 'danger' && 'bg-fw-danger-bg text-fw-danger-ink',
        tone === 'neutral' && 'bg-warm-100 text-warm-600',
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EvidenceWall
// ---------------------------------------------------------------------------

/**
 * `reading` is deliberately ACCENT, not success — a source successfully
 * reading this refresh says "there is testimony here", not "this incident
 * is healthy"; the same reasoning EvidenceCoverageStrip's own doc comment
 * (ProofDots.tsx) gives for why a present evidence dimension is accent, not
 * green. `blind` is the one health that is actually bad news for the
 * operator (a witness went dark), so it alone gets danger.
 */
const SOURCE_HEALTH_TONE: Readonly<Record<SourceHealth, ChipTone>> = {
  reading: 'accent',
  partial: 'warning',
  blind: 'danger',
  unknown: 'neutral',
};

function SourceCard({ source }: { source: IncidentSourceEvidence }) {
  const isBlind = source.health === 'blind';

  return (
    <div className="min-w-0 rounded-fw-md bg-surface-sunken px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-eyebrow font-bold uppercase tracking-widest text-warm-800">
          {INCIDENT_SOURCE_LABEL[source.source]}
        </p>
        <Chip tone={SOURCE_HEALTH_TONE[source.health]}>{SOURCE_HEALTH_LABEL[source.health]}</Chip>
      </div>

      {/* Never an empty card — a source that could not be read, or read only
          partially, always states why in visible text, right under its
          label. A blind source gets the loudest wording: an empty card here
          reads as "this source saw nothing", when the truth is "we don't
          know what this source saw". */}
      {source.reason ? (
        <p className={cn('mt-2 text-caption', isBlind ? 'font-medium text-fw-danger-ink' : 'text-warm-600')}>
          {source.reason}
          {isBlind ? ' — evidence here may be incomplete.' : null}
        </p>
      ) : null}

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-caption">
        <div>
          <dt className="uppercase tracking-widest text-warm-500">Occurrences</dt>
          {/* null is "this source counts, but exposes no number" — never
              rendered as the digit 0, which would claim it saw nothing. */}
          <dd className="mt-0.5 font-fw-mono tabular-nums text-warm-900">
            {source.occurrences === null ? 'unknown' : source.occurrences}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-widest text-warm-500">First seen</dt>
          <dd className="mt-0.5 font-fw-mono text-warm-900">
            {source.firstSeen ? <LocalTime iso={source.firstSeen} variant="datetime" /> : '—'}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-widest text-warm-500">Last seen</dt>
          <dd className="mt-0.5 font-fw-mono text-warm-900">
            {source.lastSeen ? <LocalTime iso={source.lastSeen} variant="datetime" /> : '—'}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-widest text-warm-500">Reference</dt>
          <dd className="mt-0.5 break-all font-fw-mono text-warm-900 [overflow-wrap:anywhere]">
            {source.ref === null ? (
              '—'
            ) : source.permalink ? (
              <a
                href={source.permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-700 underline"
              >
                {source.ref}
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : (
              source.ref
            )}
          </dd>
        </div>
      </dl>

      {source.summary ? (
        <p className="mt-2.5 break-words text-caption leading-5 text-warm-700 [overflow-wrap:anywhere]">{source.summary}</p>
      ) : null}
    </div>
  );
}

/** One card per source that has testimony on this incident, two columns at
 *  `sm+`, stacked below. `sources` is rendered in the order given — the
 *  caller (the read model) is the one authority on source order. */
export function EvidenceWall({ sources }: { sources: readonly IncidentSourceEvidence[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sources.map((source) => (
        <SourceCard key={source.source} source={source} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RootCauseCard
// ---------------------------------------------------------------------------

const CATEGORY_TONE: Readonly<Record<RcaCategory, ChipTone>> = {
  'fix-here': 'warning',
  'already-fixed': 'success',
  'not-a-defect': 'neutral',
  'needs-more-evidence': 'warning',
  uncategorized: 'neutral',
};

const CONFIDENCE_INK: Readonly<Record<IncidentAnalysis['confidence'], string>> = {
  high: 'text-fw-success-ink',
  medium: 'text-fw-warning-ink',
  low: 'text-fw-danger-ink',
};

const REPAIR_VERDICT_LABEL: Readonly<Record<RepairVerdict, string>> = {
  confirmed: 'CONFIRMED',
  corrected: 'CORRECTED',
  'not-reviewed': 'NOT REVIEWED',
};

/**
 * Diagnose's finding, plus Repair's own verdict on it.
 *
 * `analysis === null` renders an honest "no analysis yet" state rather than
 * an empty card with headers over nothing — the same contract `RcaPanel`
 * already keeps for the interactive version of this same data.
 */
export function RootCauseCard({ analysis }: { analysis: IncidentAnalysis | null }) {
  if (analysis === null) {
    return (
      <Surface padding="sm">
        <h3 className="text-eyebrow uppercase text-warm-500">Root cause</h3>
        <p className="mt-2 text-sm text-warm-500">No analysis yet.</p>
      </Surface>
    );
  }

  return (
    <Surface padding="sm" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-warm-200 pb-2">
        <h3 className="text-eyebrow uppercase text-warm-500">Root cause</h3>
        <Chip tone={CATEGORY_TONE[analysis.category]}>{RCA_CATEGORY_LABEL[analysis.category]}</Chip>
        {/* The model's OWN stated word, never a percentage — a percentage
            would imply a calibration this system does not have (types.ts's
            own note on IncidentAnalysis.confidence makes the same point
            about presenting confidence as a probability). */}
        <span className={cn('text-caption font-semibold uppercase tracking-widest', CONFIDENCE_INK[analysis.confidence])}>
          {analysis.confidence} confidence
        </span>
      </div>

      <div className="mt-3">
        <p className="text-caption uppercase tracking-widest text-warm-500">Probable cause</p>
        <p className="mt-1 break-words text-sm text-warm-900 [overflow-wrap:anywhere]">{analysis.probableCause}</p>
      </div>

      {analysis.suspectFiles.length > 0 ? (
        <div className="mt-3">
          <p className="text-caption uppercase tracking-widest text-warm-500">Suspect files</p>
          <ul className="mt-1 space-y-1">
            {analysis.suspectFiles.map((f, i) => (
              <li key={`${f.path}-${i}`} className="break-words text-caption leading-5 text-warm-700 [overflow-wrap:anywhere]">
                <span className="font-fw-mono text-warm-900">{f.line ? `${f.path}:${f.line}` : f.path}</span>
                {' — '}
                {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-caption uppercase tracking-widest text-warm-500">Suggested fix</p>
        <p className="mt-1 break-words text-sm text-warm-900 [overflow-wrap:anywhere]">{analysis.suggestedFix}</p>
      </div>

      <p className="mt-3 font-fw-mono text-caption text-warm-500">
        {analysis.model} · generated <LocalTime iso={analysis.generatedAt} variant="datetime" />
      </p>

      {/* Repair's independent read on this same analysis. The two halves of
          the self-healing loop run in different processes and can disagree;
          that disagreement is the only empirical feedback the diagnosis
          half gets, so CORRECTED gets real visual weight here rather than
          being minimised as an embarrassment. */}
      <div className="mt-3 border-t border-warm-200 pt-3">
        {analysis.repairVerdict === 'corrected' ? (
          <div className="rounded-fw-md border border-accent-200 bg-accent-50 px-3 py-2.5">
            <p className="text-caption font-bold uppercase tracking-widest text-accent-700">
              {REPAIR_VERDICT_LABEL.corrected} by repair
            </p>
            <p className="mt-1 text-caption leading-5 text-warm-700">
              Repair reviewed this analysis and reached a different conclusion. Diagnose and Repair disagreeing is a
              quality signal, not an error — it is the only empirical feedback the diagnosis step gets.
            </p>
          </div>
        ) : (
          <p className="text-caption uppercase tracking-widest text-warm-500">
            Repair verdict:{' '}
            <span
              className={cn(
                'font-semibold',
                analysis.repairVerdict === 'confirmed' ? 'text-fw-success-ink' : 'text-warm-500',
              )}
            >
              {REPAIR_VERDICT_LABEL[analysis.repairVerdict]}
            </span>
          </p>
        )}
      </div>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// RepairCard
// ---------------------------------------------------------------------------

const REPAIR_STATUS_LABEL: Readonly<Record<RepairStatus, string>> = {
  none: 'No repair attempted',
  candidate: 'Candidate',
  running: 'Running',
  'pr-open': 'PR open',
  'pr-failed': 'PR failed',
  merged: 'Merged',
  unknown: 'Status unknown',
};

const REPAIR_STATUS_TONE: Readonly<Record<RepairStatus, ChipTone>> = {
  none: 'neutral',
  candidate: 'accent',
  running: 'accent',
  'pr-open': 'accent',
  'pr-failed': 'danger',
  // Merged is not verified-live — the same rule LIFECYCLE_TONE (types.ts)
  // states for the `merged` lifecycle state: a process having run is not
  // the same claim as the system working, so this stays warning, not
  // success, until deploy proof says otherwise.
  merged: 'warning',
  unknown: 'neutral',
};

function RepairBoundaryNote() {
  return (
    <p className="mt-3 text-caption text-warm-400">
      Repair opens pull requests. It never merges and never deploys — a human decides both.
    </p>
  );
}

/**
 * What Repair has actually done, mechanically — never inferred from the
 * lifecycle chip elsewhere on the page, which is itself derived from this
 * same data.
 */
export function RepairCard({ repair }: { repair: IncidentRepair | null }) {
  if (repair === null || repair.status === 'none') {
    return (
      <Surface padding="sm">
        <h3 className="text-eyebrow uppercase text-warm-500">Repair</h3>
        <p className="mt-2 text-sm text-warm-500">No repair attempted.</p>
        <RepairBoundaryNote />
      </Surface>
    );
  }

  return (
    <Surface padding="sm" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h3 className="text-eyebrow uppercase text-warm-500">Repair</h3>
        <Chip tone={REPAIR_STATUS_TONE[repair.status]}>{REPAIR_STATUS_LABEL[repair.status]}</Chip>
      </div>

      <dl className="mt-3 grid gap-3 text-caption sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-widest text-warm-500">Pull request</dt>
          <dd className="mt-0.5">
            {repair.prUrl ? (
              <a href={repair.prUrl} target="_blank" rel="noreferrer" className="text-accent-700 underline">
                {repair.prNumber ? `PR #${repair.prNumber}` : 'open PR'}
              </a>
            ) : repair.prNumber ? (
              <span className="font-fw-mono text-warm-900">PR #{repair.prNumber}</span>
            ) : (
              <span className="text-warm-500">no PR linked</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-widest text-warm-500">Branch</dt>
          <dd className="mt-0.5 break-all font-fw-mono text-warm-900 [overflow-wrap:anywhere]">{repair.branch ?? '—'}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <p className="text-caption uppercase tracking-widest text-warm-500">Checks</p>
        {repair.checks === null ? (
          // A checks read that FAILED is not the same fact as checks still
          // running, and must never look like it — rendering this as
          // "pending" would say "in progress" when the truth is "we could
          // not tell". See IncidentRepair.checks in types.ts.
          <p className="mt-1">
            <Chip tone="danger">CHECKS UNREADABLE</Chip>
          </p>
        ) : (
          <div className="mt-1">
            <p className="font-fw-mono text-caption tabular-nums text-warm-700">
              {repair.checks.passed} passed · {repair.checks.failed} failed · {repair.checks.pending} pending (of{' '}
              {repair.checks.total})
            </p>
            <div className="mt-1.5 flex h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-warm-100" aria-hidden="true">
              {repair.checks.passed > 0 ? (
                <span
                  className="bg-fw-success"
                  style={{ width: `${(repair.checks.passed / Math.max(repair.checks.total, 1)) * 100}%` }}
                />
              ) : null}
              {repair.checks.pending > 0 ? (
                <span
                  className="bg-fw-warning"
                  style={{ width: `${(repair.checks.pending / Math.max(repair.checks.total, 1)) * 100}%` }}
                />
              ) : null}
              {repair.checks.failed > 0 ? (
                <span
                  className="bg-fw-danger"
                  style={{ width: `${(repair.checks.failed / Math.max(repair.checks.total, 1)) * 100}%` }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {repair.note ? (
        <p className="mt-3 break-words text-caption text-warm-600 [overflow-wrap:anywhere]">{repair.note}</p>
      ) : null}

      <RepairBoundaryNote />
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// DeploymentProofCard
// ---------------------------------------------------------------------------

/** Coarse, human duration for "time since deploy" — mirrors the private
 *  formatter `proof.ts` keeps for the same reason (that module cannot be
 *  imported from here without dragging its own imports, and duplicating
 *  seven lines is cheaper than a bad coupling). Not `RelativeTime`: that
 *  component's ticker only ever prints seconds or minutes, which reads
 *  absurdly ("4320m ago") for a deploy that is days old. */
function formatElapsed(ms: number): string {
  const abs = Math.max(ms, 0);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(abs / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Whether production actually serves the fix, plus who decided this
 * incident was resolved.
 *
 * `servesFix === null` renders `UNKNOWN` and never "not deployed".
 * `shipStatus` carries three outcomes in `auto-resolve.ts` for exactly this
 * reason: rendering "we could not find out" as "has not shipped" tells an
 * operator their fix is not live when the truth is we could not look.
 */
export function DeploymentProofCard({
  proof,
  resolution,
}: {
  proof: IncidentDeployProof | null;
  resolution: IncidentResolution | null;
}) {
  return (
    <Surface padding="sm" className="min-w-0">
      <h3 className="border-b border-warm-200 pb-2 text-eyebrow uppercase text-warm-500">Deployment proof</h3>

      {proof === null ? (
        <p className="mt-3 text-sm text-warm-500">No deploy evidence recorded for this fault.</p>
      ) : (
        <>
          <dl className="mt-3 grid gap-3 text-caption sm:grid-cols-2">
            <div>
              <dt className="uppercase tracking-widest text-warm-500">Fixed in</dt>
              <dd className="mt-0.5 break-all font-fw-mono text-warm-900 [overflow-wrap:anywhere]">
                {proof.fixedInSha ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-widest text-warm-500">Production</dt>
              <dd className="mt-0.5 break-all font-fw-mono text-warm-900 [overflow-wrap:anywhere]">
                {proof.productionSha ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-widest text-warm-500">Deployed</dt>
              <dd className="mt-0.5 font-fw-mono text-warm-900">
                {proof.deployedAt ? <LocalTime iso={proof.deployedAt} variant="datetime" /> : '—'}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-widest text-warm-500">Last occurrence</dt>
              <dd className="mt-0.5 font-fw-mono text-warm-900">
                {proof.lastOccurrenceAt ? <LocalTime iso={proof.lastOccurrenceAt} variant="datetime" /> : '—'}
              </dd>
            </div>
          </dl>

          {proof.sinceDeployMs !== null ? (
            <p className="mt-2.5 text-caption text-warm-500">{formatElapsed(proof.sinceDeployMs)} of production traffic since deploy.</p>
          ) : null}

          <div className="mt-2.5">
            <p className="text-caption uppercase tracking-widest text-warm-500">Serves the fix</p>
            <p className="mt-1">
              {proof.servesFix === null ? (
                <Chip tone="neutral">UNKNOWN</Chip>
              ) : proof.servesFix ? (
                <Chip tone="success">Serves the fix</Chip>
              ) : (
                <Chip tone="warning">Fix not live yet</Chip>
              )}
            </p>
          </div>

          {proof.gap ? (
            <p className="mt-2 break-words text-caption leading-5 text-warm-600 [overflow-wrap:anywhere]">{proof.gap}</p>
          ) : null}
        </>
      )}

      {resolution ? (
        <div className="mt-3 border-t border-warm-200 pt-3">
          <p className="text-caption uppercase tracking-widest text-warm-500">Resolution</p>
          <p className="mt-1 text-caption leading-5 text-warm-700">
            Decided by{' '}
            <span className="font-semibold text-warm-900">
              {resolution.resolvedBy === 'auto'
                ? 'the nightly cron'
                : resolution.resolvedBy === 'manual'
                  ? 'a human operator'
                  : 'an unknown process'}
            </span>{' '}
            on <LocalTime iso={resolution.resolvedAt} variant="datetime" />.
          </p>
          {/* "Fixed three times already" must not be laundered into a plain
              resolved chip — a reopen count above zero is always visible. */}
          {resolution.reopenedCount > 0 ? (
            <p className="mt-1.5">
              <Chip tone="danger">
                Reopened {resolution.reopenedCount} time{resolution.reopenedCount === 1 ? '' : 's'}
              </Chip>
            </p>
          ) : null}
          {resolution.note ? (
            <p className="mt-1.5 break-words text-caption text-warm-600 [overflow-wrap:anywhere]">{resolution.note}</p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}

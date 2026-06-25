'use client';

// =============================================================================
// src/components/baseball/import-center/ImportDiffViewer.tsx
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The Import Diff Viewer — the before/after, duplicates, and warnings surface the
// v10 import system requires. It renders an EventCommitPlan (previewCommit) so a
// coach sees EXACTLY what commit() will write before committing: creates vs
// updates per grain, idempotent duplicates, unmatched rows, and validation
// errors/warnings — with one prominent primary action (Commit).
//
// Cream/green tokens + GolfHelm primitives. Honest empty/zero states. Pure
// presentation: it takes a plan + callbacks, owns no data fetching.
// =============================================================================

import type { EventCommitPlan, EventValidationIssue } from '@/lib/baseball/adapters';
import type { EventGrain } from '@/lib/baseball/adapters/event-rows';

const GRAIN_LABEL: Record<EventGrain, string> = {
  pitch: 'Pitch events',
  batted_ball: 'Batted-ball events',
  swing: 'Swing events',
};

interface Props {
  sourceLabel: string;
  rowsRead: number;
  eventRowCount: number;
  plan: EventCommitPlan;
  validation: EventValidationIssue[];
  /** matched / total distinct players (for the matching summary line). */
  matchedPlayers: number;
  totalPlayers: number;
}

export function ImportDiffViewer({
  sourceLabel,
  rowsRead,
  eventRowCount,
  plan,
  validation,
  matchedPlayers,
  totalPlayers,
}: Props) {
  const grainsWithActivity = (Object.keys(plan.byGrain) as EventGrain[]).filter(
    (g) =>
      plan.byGrain[g].creates > 0 ||
      plan.byGrain[g].updates > 0 ||
      plan.byGrain[g].skipped > 0,
  );
  const errors = validation.filter((v) => v.severity === 'error');
  const warnings = validation.filter((v) => v.severity === 'warning');
  const nothingToWrite = plan.totalCreates + plan.totalUpdates === 0;

  return (
    <div className="space-y-6">
      {/* Headline counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DiffStat label="New" value={plan.totalCreates} tone="primary" />
        <DiffStat label="Updated" value={plan.totalUpdates} tone="primary" />
        <DiffStat label="Duplicates" value={plan.duplicateRowCount} tone="muted" />
        <DiffStat label="Skipped" value={plan.totalSkipped} tone="muted" />
      </div>

      <p className="text-sm text-warm-600">
        Parsed <strong className="text-warm-800">{eventRowCount}</strong> event rows from{' '}
        <strong className="text-warm-800">{rowsRead}</strong> source rows in{' '}
        <strong className="text-primary-700">{sourceLabel}</strong>. Matched{' '}
        <strong className="text-warm-800">
          {matchedPlayers}/{totalPlayers}
        </strong>{' '}
        players.
      </p>

      {/* Per-grain before/after */}
      <div className="overflow-hidden rounded-xl border border-warm-200">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-left text-warm-600">
            <tr>
              <th className="px-4 py-2 font-medium">Event type</th>
              <th className="px-4 py-2 font-medium text-right">New</th>
              <th className="px-4 py-2 font-medium text-right">Updated</th>
              <th className="px-4 py-2 font-medium text-right">Skipped</th>
            </tr>
          </thead>
          <tbody>
            {grainsWithActivity.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-warm-400">
                  No event rows to write.
                </td>
              </tr>
            ) : (
              grainsWithActivity.map((g) => (
                <tr key={g} className="border-t border-warm-100">
                  <td className="px-4 py-2 text-warm-800">{GRAIN_LABEL[g]}</td>
                  <td className="px-4 py-2 text-right font-medium text-primary-700">
                    {plan.byGrain[g].creates}
                  </td>
                  <td className="px-4 py-2 text-right text-warm-700">{plan.byGrain[g].updates}</td>
                  <td className="px-4 py-2 text-right text-warm-400">{plan.byGrain[g].skipped}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Idempotency note */}
      {plan.duplicateRowCount > 0 && (
        <div className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3 text-sm text-warm-600">
          <strong className="text-warm-800">{plan.duplicateRowCount}</strong> rows already exist
          (matched by the source&apos;s own event id) and will be updated in place — re-importing the
          same file is safe and will not create duplicates.
        </div>
      )}

      {/* Unmatched */}
      {plan.unmatchedRowCount > 0 && (
        <div
          role="status"
          className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
        >
          <strong>{plan.unmatchedRowCount}</strong> rows belong to players not matched to your
          roster and will be skipped. Resolve them in the Match step to include them.
        </div>
      )}

      {/* Validation errors (block) */}
      {errors.length > 0 && (
        <IssueList
          title={`${errors.length} rows have impossible values and will be skipped`}
          tone="error"
          issues={errors}
        />
      )}

      {/* Validation warnings (allow) */}
      {warnings.length > 0 && (
        <IssueList
          title={`${warnings.length} rows have unusual values (imported, but flagged)`}
          tone="warning"
          issues={warnings}
        />
      )}

      {/* Parse warnings */}
      {plan.warnings.length > 0 && (
        <details className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-warm-700">
            {plan.warnings.length} parser note{plan.warnings.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1 text-warm-600">
            {plan.warnings.slice(0, 50).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
            {plan.warnings.length > 50 && (
              <li className="text-warm-400">…and {plan.warnings.length - 50} more</li>
            )}
          </ul>
        </details>
      )}

      {nothingToWrite && (
        <div
          role="alert"
          className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
        >
          Nothing will be written. Match at least one player (and clear any blocking errors) to
          enable commit.
        </div>
      )}
    </div>
  );
}

function DiffStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'primary' | 'muted';
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary-700'
      : tone === 'muted'
        ? 'text-warm-400'
        : 'text-warm-900';
  return (
    <div className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-warm-500">{label}</div>
    </div>
  );
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'error' | 'warning';
  issues: EventValidationIssue[];
}) {
  const border = tone === 'error' ? 'border-error/30' : 'border-warning/30';
  const bg = tone === 'error' ? 'bg-error/5' : 'bg-warning/5';
  const text = tone === 'error' ? 'text-error' : 'text-warning';
  return (
    <details className={`rounded-xl border ${border} ${bg} px-4 py-3 text-sm ${text}`}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className="mt-2 space-y-1">
        {issues.slice(0, 30).map((iss, i) => (
          <li key={i}>
            • Row {iss.sourceRowNumber} ({iss.grain.replace('_', ' ')}): {iss.message}
          </li>
        ))}
        {issues.length > 30 && <li className="opacity-70">…and {issues.length - 30} more</li>}
      </ul>
    </details>
  );
}

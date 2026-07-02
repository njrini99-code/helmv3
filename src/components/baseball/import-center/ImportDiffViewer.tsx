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
// LIVING ANNUAL PRESENTATION — the KPI grid runs through KPIContentsStrip
// (ruled, green-baseline numerals), the per-grain table sits on a hairline-ruled
// PaperCard, and every advisory reads as a quiet InkBadge callout — never a
// yellow/amber box. Pure presentation: it takes a plan + callbacks, owns no
// data fetching.
// =============================================================================

import type { ReactNode } from 'react';
import type { EventCommitPlan, EventValidationIssue } from '@/lib/baseball/adapters';
import type { EventGrain } from '@/lib/baseball/adapters/event-rows';
import { HairlineRule, InkBadge, KPIContentsStrip } from '@/components/baseball/living-annual';

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
      <KPIContentsStrip
        columns={4}
        items={[
          { label: 'New', value: plan.totalCreates, emphasis: true },
          { label: 'Updated', value: plan.totalUpdates, emphasis: true },
          { label: 'Duplicates', value: plan.duplicateRowCount },
          { label: 'Skipped', value: plan.totalSkipped },
        ]}
      />

      <p className="text-body-sm text-text-secondary">
        Parsed <strong className="font-semibold text-text-primary">{eventRowCount}</strong> event rows from{' '}
        <strong className="font-semibold text-text-primary">{rowsRead}</strong> source rows in{' '}
        <strong className="font-semibold text-grade-plus">{sourceLabel}</strong>. Matched{' '}
        <strong className="font-semibold text-text-primary">
          {matchedPlayers}/{totalPlayers}
        </strong>{' '}
        players.
      </p>

      {/* Per-grain before/after */}
      <div className="overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)]">
        <table className="w-full text-body-sm">
          <thead className="text-left text-text-tertiary">
            <tr>
              <th className="px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Event type</th>
              <th className="px-4 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em]">New</th>
              <th className="px-4 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em]">Updated</th>
              <th className="px-4 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em]">Skipped</th>
            </tr>
          </thead>
          <tbody>
            {grainsWithActivity.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  No event rows to write.
                </td>
              </tr>
            ) : (
              grainsWithActivity.map((g) => (
                <tr key={g} className="border-t border-[color:var(--hairline)]">
                  <td className="px-4 py-2 text-text-primary">{GRAIN_LABEL[g]}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-grade-plus">
                    {plan.byGrain[g].creates}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{plan.byGrain[g].updates}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-tertiary">{plan.byGrain[g].skipped}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Idempotency note */}
      {plan.duplicateRowCount > 0 && (
        <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 text-body-sm text-text-secondary">
          <strong className="font-semibold text-text-primary">{plan.duplicateRowCount}</strong> rows already exist
          (matched by the source&apos;s own event id) and will be updated in place — re-importing the
          same file is safe and will not create duplicates.
        </div>
      )}

      {/* Unmatched */}
      {plan.unmatchedRowCount > 0 && (
        <Callout tone="sodium" variant="soft" role="status">
          <strong className="font-semibold">{plan.unmatchedRowCount}</strong> rows belong to players not matched to
          your roster and will be skipped. Resolve them in the Match step to include them.
        </Callout>
      )}

      {/* Validation errors (block) */}
      {errors.length > 0 && (
        <IssueList
          title={`${errors.length} rows have impossible values and will be skipped`}
          tone="sodium-solid"
          issues={errors}
        />
      )}

      {/* Validation warnings (allow) */}
      {warnings.length > 0 && (
        <IssueList
          title={`${warnings.length} rows have unusual values (imported, but flagged)`}
          tone="sodium-soft"
          issues={warnings}
        />
      )}

      {/* Parse warnings */}
      {plan.warnings.length > 0 && (
        <details className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 text-body-sm">
          <summary className="cursor-pointer font-medium text-text-primary">
            {plan.warnings.length} parser note{plan.warnings.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1 text-text-secondary">
            {plan.warnings.slice(0, 50).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
            {plan.warnings.length > 50 && (
              <li className="text-text-tertiary">…and {plan.warnings.length - 50} more</li>
            )}
          </ul>
        </details>
      )}

      {nothingToWrite && (
        <Callout tone="sodium" variant="solid" role="alert">
          Nothing will be written. Match at least one player (and clear any blocking errors) to
          enable commit.
        </Callout>
      )}
    </div>
  );
}

/** A quiet advisory panel — paper stock + an InkBadge carrying the tone, never a
 *  filled yellow/amber box (spec §7.1 empty-state doctrine, "urgency is a
 *  color, not a toast"). */
function Callout({
  tone,
  variant,
  role,
  children,
}: {
  tone: 'sodium';
  variant: 'soft' | 'solid';
  role: 'status' | 'alert';
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
    >
      <InkBadge label={variant === 'solid' ? 'Needs attention' : 'Heads up'} tone={tone} variant={variant} />
      <p className="text-body-sm text-text-secondary">{children}</p>
    </div>
  );
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'sodium-solid' | 'sodium-soft';
  issues: EventValidationIssue[];
}) {
  const variant = tone === 'sodium-solid' ? 'solid' : 'soft';
  return (
    <details className="overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 text-body-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-text-primary">
        <InkBadge label={variant === 'solid' ? 'Blocking' : 'Warning'} tone="sodium" variant={variant} />
        {title}
      </summary>
      <HairlineRule ink="hairline" className="my-2" />
      <ul className="space-y-1 text-text-secondary">
        {issues.slice(0, 30).map((iss, i) => (
          <li key={i}>
            • Row {iss.sourceRowNumber} ({iss.grain.replace('_', ' ')}): {iss.message}
          </li>
        ))}
        {issues.length > 30 && <li className="text-text-tertiary">…and {issues.length - 30} more</li>}
      </ul>
    </details>
  );
}

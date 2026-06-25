'use client';

// =============================================================================
// src/components/baseball/import-center/SourceDetectionCard.tsx
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The Provider-detection surface for the Import Center (v10 Import Dossier step 3:
// "Provider detection" — "File fingerprint card", "Provider confidence meter",
// source badges). It answers, BEFORE the coach matches players: which source is
// this, what GRAINS does it produce, what TRUST can it ever claim, and what is the
// confidence-based AUTO-COMMIT band? This closes the v9 Packet 4 acceptance
// ("upload shows detected source AND grain") the wizard previously skipped.
//
// Pure presentation: takes a SourceFileDetection + callbacks. Cream/green tokens,
// GolfHelm primitives, honest zero/low-confidence states.
// =============================================================================

import { autoCommitLabel, type SourceFileDetection } from '@/lib/baseball/adapters';

const CATEGORY_LABEL: Record<string, string> = {
  official_game: 'Official game',
  tracking: 'Ball tracking',
  player_development: 'Player development',
  video: 'Video / scouting',
  strength: 'Strength & readiness',
  operations: 'Operations',
};

const TRUST_LABEL: Record<string, string> = {
  official: 'Official',
  verified_vendor: 'Verified vendor',
  coach_reviewed: 'Coach reviewed',
  player_submitted: 'Player submitted',
  unverified: 'Unverified',
  inferred: 'Inferred',
};

interface Props {
  detection: SourceFileDetection;
  fileName: string;
}

export function SourceDetectionCard({ detection, fileName }: Props) {
  const pct = Math.round(detection.confidence * 100);
  const band = autoCommitLabel(detection.autoCommit);

  // Confidence meter tone tracks the parse quality, not vanity green-everywhere.
  const meterTone =
    detection.confidence >= 0.9
      ? 'bg-primary-500'
      : detection.confidence >= 0.7
        ? 'bg-warning'
        : 'bg-error';

  const bandTone =
    detection.autoCommit === 'auto_commit_silent' || detection.autoCommit === 'auto_commit_warn'
      ? 'border-primary-200 bg-primary-50/60 text-primary-800'
      : detection.autoCommit === 'hold_for_review'
        ? 'border-warning/30 bg-warning/5 text-warning'
        : 'border-error/30 bg-error/5 text-error';

  return (
    <div className="space-y-5">
      {/* File fingerprint: what we recognized this file as. */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-warm-200 bg-cream-50 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-warm-500">Detected source</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-warm-900">
            {detection.sourceLabel}
          </p>
          <p className="mt-0.5 truncate text-sm text-warm-600">
            {CATEGORY_LABEL[detection.category] ?? detection.category}
            {fileName ? ` · ${fileName}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tabular-nums text-warm-900">{pct}%</p>
          <p className="text-xs uppercase tracking-wide text-warm-500">match</p>
        </div>
      </div>

      {/* Provider confidence meter. */}
      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-warm-100">
          <div
            className={`h-full rounded-full ${meterTone} transition-all`}
            style={{ width: `${Math.max(4, pct)}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Provider detection confidence"
          />
        </div>
        <p className="mt-2 text-sm text-warm-600">
          Parsed <strong className="text-warm-800">{detection.eventRowCount}</strong> event rows
          from <strong className="text-warm-800">{detection.rowsRead}</strong> source rows.
        </p>
      </div>

      {/* Grains + trust badges. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-warm-500">Grains</span>
        {detection.grainLabels.length === 0 ? (
          <span className="rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-400">
            none detected
          </span>
        ) : (
          detection.grainLabels.map((g) => (
            <span
              key={g}
              className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
            >
              {g}
            </span>
          ))
        )}
        <span className="ml-2 text-xs font-medium uppercase tracking-wide text-warm-500">
          Trust ceiling
        </span>
        <span className="rounded-md border border-warm-200 bg-cream-50 px-2 py-0.5 text-xs font-medium text-warm-700">
          {TRUST_LABEL[detection.trustCeiling] ?? detection.trustCeiling}
        </span>
      </div>

      {/* Auto-commit band — the v8 confidence gate, now surfaced. */}
      <div className={`rounded-xl border px-4 py-3 ${bandTone}`}>
        <p className="text-sm font-semibold">{band.title}</p>
        <p className="mt-0.5 text-sm opacity-90">{band.detail}</p>
      </div>

      {/* Honest alternates — "looks more like…". */}
      {detection.alternates.length > 0 && (
        <div className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3 text-sm text-warm-600">
          <span className="font-medium text-warm-800">Also looks a bit like:</span>{' '}
          {detection.alternates
            .map((a) => `${a.sourceLabel} (${Math.round(a.confidence * 100)}%)`)
            .join(', ')}
          . Go back to change the source if this is wrong.
        </div>
      )}

      {/* Parser notes. */}
      {detection.notes.length > 0 && (
        <p className="text-xs text-warm-500">{detection.notes[0]}</p>
      )}

      {/* Preserved document text (PDF manual-mapping path). Shown READ-ONLY so the
          coach can copy the lines into the box-score wizard — never auto-committed. */}
      {detection.preservedText && detection.preservedText.length > 0 && (
        <div className="rounded-xl border border-warm-200 bg-cream-50">
          <div className="flex items-center justify-between border-b border-warm-200 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-warm-600">
              Recovered text — copy into manual entry
            </p>
            <span className="rounded-md bg-warm-100 px-2 py-0.5 text-caption font-medium text-warm-500">
              read only
            </span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-relaxed text-warm-700">
            {detection.preservedText}
          </pre>
        </div>
      )}
    </div>
  );
}

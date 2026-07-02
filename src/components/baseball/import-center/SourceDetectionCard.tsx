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
// Pure presentation: takes a SourceFileDetection + callbacks. LIVING ANNUAL
// PRESENTATION — composed from the kit (PaperCard-lite fingerprint block,
// InkBadge grain/trust stamps, honest zero/low-confidence states, never a
// yellow/amber meter). detection / autoCommitLabel are read-only inputs; no
// logic changed.
// =============================================================================

import { autoCommitLabel, type SourceFileDetection } from '@/lib/baseball/adapters';
import type { AutoCommitDecision } from '@/lib/baseball/stat-import-adapters';
import { HairlineRule, InkBadge, StatReadout } from '@/components/baseball/living-annual';

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

/** InkBadge tone for the auto-commit band — team (proceeds), sodium (needs a look). */
const BAND_TONE: Record<AutoCommitDecision, { tone: 'team' | 'sodium'; variant: 'soft' | 'solid' }> = {
  auto_commit_silent: { tone: 'team', variant: 'soft' },
  auto_commit_warn: { tone: 'team', variant: 'soft' },
  hold_for_review: { tone: 'sodium', variant: 'soft' },
  do_not_commit: { tone: 'sodium', variant: 'solid' },
};

interface Props {
  detection: SourceFileDetection;
  fileName: string;
}

export function SourceDetectionCard({ detection, fileName }: Props) {
  const pct = Math.round(detection.confidence * 100);
  const band = autoCommitLabel(detection.autoCommit);
  const bandTone = BAND_TONE[detection.autoCommit] ?? BAND_TONE.hold_for_review;

  // Confidence meter fill — graphite/hairline ramps toward team green as parse
  // quality rises; low confidence stays a quiet neutral fill (never amber/red).
  const fillColor =
    detection.confidence >= 0.9
      ? 'var(--grade-plus)'
      : detection.confidence >= 0.7
        ? 'var(--sodium)'
        : 'var(--grade-avg)';

  return (
    <div className="space-y-5">
      {/* File fingerprint: what we recognized this file as. */}
      <div className="flex items-start justify-between gap-4 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4">
        <div className="min-w-0">
          <p className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            Detected source
          </p>
          <p className="mt-1 truncate font-annual text-lg font-semibold text-text-primary">
            {detection.sourceLabel}
          </p>
          <p className="mt-0.5 truncate text-body-sm text-text-secondary">
            {CATEGORY_LABEL[detection.category] ?? detection.category}
            {fileName ? ` · ${fileName}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <StatReadout value={pct} suffix="%" className="text-h2 text-text-primary" ariaLabel="Match confidence" />
          <p className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">match</p>
        </div>
      </div>

      {/* Provider confidence meter. */}
      <div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Provider detection confidence"
          className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--hairline)]"
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(4, pct)}%`, backgroundColor: fillColor }}
          />
        </div>
        <p className="mt-2 text-body-sm text-text-secondary">
          Parsed <strong className="font-semibold text-text-primary">{detection.eventRowCount}</strong> event rows
          from <strong className="font-semibold text-text-primary">{detection.rowsRead}</strong> source rows.
        </p>
      </div>

      {/* Grains + trust badges. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Grains</span>
        {detection.grainLabels.length === 0 ? (
          <InkBadge label="None detected" tone="neutral" />
        ) : (
          detection.grainLabels.map((g) => <InkBadge key={g} label={g} tone="team" />)
        )}
        <span className="ml-2 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Trust ceiling
        </span>
        <InkBadge label={TRUST_LABEL[detection.trustCeiling] ?? detection.trustCeiling} tone="neutral" variant="solid" />
      </div>

      {/* Auto-commit band — the v8 confidence gate, now surfaced. */}
      <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
        <InkBadge label={band.title} tone={bandTone.tone} variant={bandTone.variant} />
        <p className="mt-1.5 text-body-sm text-text-secondary">{band.detail}</p>
      </div>

      {/* Honest alternates — "looks more like…". */}
      {detection.alternates.length > 0 && (
        <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 text-body-sm text-text-secondary">
          <span className="font-medium text-text-primary">Also looks a bit like:</span>{' '}
          {detection.alternates
            .map((a) => `${a.sourceLabel} (${Math.round(a.confidence * 100)}%)`)
            .join(', ')}
          . Go back to change the source if this is wrong.
        </div>
      )}

      {/* Parser notes. */}
      {detection.notes.length > 0 && (
        <p className="text-caption text-text-tertiary">{detection.notes[0]}</p>
      )}

      {/* Preserved document text (PDF manual-mapping path). Shown READ-ONLY so the
          coach can copy the lines into the box-score wizard — never auto-committed. */}
      {detection.preservedText && detection.preservedText.length > 0 && (
        <div className="overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)]">
          <div className="flex items-center justify-between px-4 py-2.5">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              Recovered text — copy into manual entry
            </p>
            <InkBadge label="Read only" tone="neutral" />
          </div>
          <HairlineRule ink="hairline" />
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-4 py-3 font-annual text-caption leading-relaxed text-text-secondary">
            {detection.preservedText}
          </pre>
        </div>
      )}
    </div>
  );
}

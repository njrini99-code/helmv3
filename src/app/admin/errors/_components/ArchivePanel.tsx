import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Surface, Inset, StatusPill, Badge, Eyebrow, InlineNotice, type FwStatusTone } from '@/components/fairway';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ArchivedResolution, ResolutionArchiveSnapshot } from '@/lib/admin/data/resolutions';
import type { ShipStatus } from '@/lib/reliability/resolution';
import { PanelNoData, PanelStale } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';

/**
 * Helm Bridge — the Archive panel.
 *
 * Renders `admin_error_resolutions`: faults marked fixed, whether that claim
 * was automatic or human, whether the fix has actually shipped, and whether
 * the fault came back. Every rendering rule below exists because collapsing
 * it would tell an operator something false:
 *
 *   - REGRESSED rows render first and loudest — a fault that was fixed and
 *     came back is the single most valuable signal this panel produces, and
 *     must not read as just another quiet archived row.
 *   - `auto` vs `manual` are visually distinct (outline vs. solid) — an
 *     auto-archive is the cron's inference, a manual one is an operator's
 *     assertion, and those are different strengths of claim.
 *   - Ship status renders THREE states. `unknown` is its own honest label,
 *     never folded into `pending` (which would claim a fix has not shipped
 *     when the truth is we could not find out) or `shipped`.
 *   - A fetch failure renders as a stale/error panel, never as an empty
 *     archive — an empty archive reads as "nothing has ever been fixed",
 *     which is a different (and false) claim than "we could not read this".
 */

const SHIP_STATUS_TONE: Record<ShipStatus, FwStatusTone> = {
  shipped: 'success',
  pending: 'warning',
  unknown: 'neutral',
};

const SHIP_STATUS_LABEL: Record<ShipStatus, string> = {
  shipped: 'shipped',
  pending: 'pending',
  unknown: 'ship state unknown',
};

function ShipStatusBadge({ status }: { status: ShipStatus }) {
  return (
    <StatusPill tone={SHIP_STATUS_TONE[status]} dot size="sm" className="shrink-0">
      {SHIP_STATUS_LABEL[status]}
    </StatusPill>
  );
}

function SourceBadge({ source }: { source: ArchivedResolution['resolutionSource'] }) {
  // `outline` (quieter) for auto, `soft` (heavier fill) for manual — the
  // human assertion should visually outweigh the cron's inference, not just
  // carry a different word.
  if (source === 'auto') {
    return (
      <Badge tone="neutral" variant="outline" size="sm">
        auto · cron inferred
      </Badge>
    );
  }
  return (
    <Badge tone="accent" variant="soft" size="sm">
      manual · operator confirmed
    </Badge>
  );
}

function PrLink({ resolution }: { resolution: ArchivedResolution }) {
  const label = resolution.prNumber !== null ? `PR #${resolution.prNumber}` : 'PR';
  if (resolution.prUrl) {
    return (
      <a
        href={resolution.prUrl}
        target="_blank"
        rel="noreferrer"
        className="text-accent-700 underline"
      >
        {label}
      </a>
    );
  }
  if (resolution.prNumber !== null) {
    return <span className="text-warm-700">{label}</span>;
  }
  return <span className="text-warm-400">no PR recorded</span>;
}

/**
 * `regressed` (`reopenedAt !== null`) is CURRENTLY-broken-again. But
 * `admin_mark_error_regressed` only increments `reopened_count` on the
 * transition into regressed, and a subsequent manual/auto re-resolve clears
 * `reopened_at` while `reopened_count` survives (admin-platform.md: "so
 * 'fixed three times already' cannot be laundered"). So a row can read
 * `regressed: false, reopenedCount: 3` — currently fixed, but broke and got
 * refixed three times. Rendering that as a plain clean row loses exactly the
 * fact the count exists to preserve, so it gets its own quieter pill rather
 * than silence.
 */
function RegressionPill({ resolution }: { resolution: ArchivedResolution }) {
  if (resolution.regressed) {
    return (
      <StatusPill tone="danger" dot size="sm" className="shrink-0">
        regressed{resolution.reopenedCount > 0 ? ` ${resolution.reopenedCount}x` : ''}
      </StatusPill>
    );
  }
  if (resolution.reopenedCount > 0) {
    return (
      <StatusPill tone="warning" dot size="sm" className="shrink-0">
        refixed · regressed {resolution.reopenedCount}x before
      </StatusPill>
    );
  }
  return null;
}

function ArchiveRow({ resolution }: { resolution: ArchivedResolution }) {
  return (
    <Inset
      padding="sm"
      className={cn(
        'space-y-2',
        // Regressed rows carry a visible danger frame — never just a badge
        // buried in the metadata row — so the loudest signal in the archive
        // cannot be scanned past.
        resolution.regressed && 'border border-fw-danger/40 bg-fw-danger-bg',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RegressionPill resolution={resolution} />
          <Link
            href={`/admin/errors/${encodeURIComponent(resolution.fingerprint)}`}
            className="min-w-0 truncate font-fw-mono text-sm text-accent-700 underline"
          >
            {resolution.fingerprint}
          </Link>
        </div>
        <ShipStatusBadge status={resolution.shipStatus} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-warm-600">
        <SourceBadge source={resolution.resolutionSource} />
        <span>
          resolved <LocalTime iso={resolution.resolvedAt} variant="datetime" />
        </span>
        <PrLink resolution={resolution} />
        {resolution.regressed && resolution.reopenedAt ? (
          <span className="font-medium text-fw-danger-ink">
            recurred <LocalTime iso={resolution.reopenedAt} variant="datetime" />
          </span>
        ) : null}
      </div>

      {resolution.note ? <p className="text-xs text-warm-500">{resolution.note}</p> : null}
    </Inset>
  );
}

/** Regressed rows first (most valuable signal), then newest-resolved first
 *  within each group. The data layer already returns newest-resolved-first,
 *  but re-sorting here keeps this the source of truth for display order
 *  regardless of what upstream ordering the query happens to use. */
function sortForDisplay(resolutions: readonly ArchivedResolution[]): ArchivedResolution[] {
  return [...resolutions].sort((a, b) => {
    if (a.regressed !== b.regressed) return a.regressed ? -1 : 1;
    return new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime();
  });
}

export function ArchivePanel({ result }: { result: AdminFetchResult<ResolutionArchiveSnapshot> }) {
  if (result.status === 'error') {
    return (
      <section aria-label="Archive">
        <Eyebrow as="h2" className="mb-2 block">
          Archive
        </Eyebrow>
        <PanelStale label="Archive" error={result.error ?? 'could not read the resolution archive'} />
      </section>
    );
  }

  if (result.status === 'unconfigured' || !result.data) {
    return (
      <section aria-label="Archive">
        <Eyebrow as="h2" className="mb-2 block">
          Archive
        </Eyebrow>
        <PanelNoData
          label="Archive not available"
          description={result.error ?? 'The resolution archive could not be read.'}
        />
      </section>
    );
  }

  const snapshot = result.data;

  if (snapshot.resolutions.length === 0) {
    return (
      <section aria-label="Archive">
        <Eyebrow as="h2" className="mb-2 block">
          Archive
        </Eyebrow>
        {/* PanelNoData, not PanelAllClear: zero rows here means no fault has
            ever been recorded as fixed, which is a data-absence fact, not a
            health verdict — a green all-clear tick would claim more than
            the row count supports. */}
        <PanelNoData label="Nothing archived yet" description="No fault has been recorded as fixed." />
      </section>
    );
  }

  const sorted = sortForDisplay(snapshot.resolutions);
  const regressedCount = sorted.filter((r) => r.regressed).length;

  return (
    <Surface as="section" aria-label="Archive">
      <Surface.Header
        title="Archive"
        subtitle="Faults marked fixed — and whether they stayed fixed"
        actions={
          regressedCount > 0 ? (
            <StatusPill tone="danger" dot size="sm">
              {regressedCount} regressed
            </StatusPill>
          ) : null
        }
      />
      {result.truncated ? (
        <InlineNotice tone="warning" className="mb-4">
          Showing the {snapshot.evaluated} most recently resolved
          {snapshot.confirmedTotal !== null ? ` of ${snapshot.confirmedTotal}` : ''} — more exist beyond this
          page.
        </InlineNotice>
      ) : null}
      <Surface.Body className="space-y-2">
        {sorted.map((resolution) => (
          <ArchiveRow key={resolution.fingerprint} resolution={resolution} />
        ))}
      </Surface.Body>
    </Surface>
  );
}

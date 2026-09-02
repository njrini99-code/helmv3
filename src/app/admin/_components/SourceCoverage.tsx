import { StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { INCIDENT_SOURCE_LABEL, SOURCE_HEALTH_LABEL, type SourceFreshness, type SourceHealth, type FreshnessState } from '@/lib/admin/incidents/types';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';
import { RelativeTime } from './RelativeTime';

/**
 * The Bridge's source coverage surface — "was the system actually watching?",
 * rendered.
 *
 * `sources.ts` computes WHAT is true (health, freshness, the worst-case
 * coverage); this file only renders it, and renders it the way the module's
 * own header insists on: an arm that could not be read is an ABSENCE, and a
 * matrix that lets a blind source blend into a healthy-looking row is worse
 * than one that shows nothing.
 */

const HEALTH_TONE: Readonly<Record<SourceHealth, 'success' | 'warning' | 'danger' | 'neutral'>> = {
  // `reading` is the one case that has earned success here: it is not an
  // expectation or a scheduled state, it is a confirmed fact about THIS
  // refresh — the read happened and it succeeded.
  reading: 'success',
  partial: 'warning',
  blind: 'danger',
  unknown: 'neutral',
};

const FRESHNESS_LABEL: Readonly<Record<FreshnessState, string>> = {
  fresh: 'fresh',
  aging: 'aging',
  stale: 'stale',
  unknown: 'unknown',
};

const FRESHNESS_TEXT_TONE: Readonly<Record<FreshnessState, string>> = {
  fresh: 'text-warm-500',
  aging: 'text-fw-warning-ink',
  stale: 'text-fw-danger-ink',
  unknown: 'text-warm-500',
};

/** One row's freshness cell — a word carrying the state, plus the actual age
 *  when there is a reading to date. Never a bare colour swatch: the word is
 *  always there, the colour only reinforces it. */
function FreshnessCell({ row }: { row: SourceFreshness }) {
  return (
    <span className={cn('font-fw-mono text-xs tabular-nums', FRESHNESS_TEXT_TONE[row.state])}>
      {FRESHNESS_LABEL[row.state]}
      {row.observedAt ? (
        <>
          {' · '}
          <RelativeTime sinceMs={Date.parse(row.observedAt)} />
        </>
      ) : (
        ' · no reading'
      )}
    </span>
  );
}

function summarizeForCaption(freshness: readonly SourceFreshness[]): string {
  if (freshness.length === 0) return 'No sources configured.';
  const parts = freshness.map((row) => `${INCIDENT_SOURCE_LABEL[row.source]} ${SOURCE_HEALTH_LABEL[row.health].toLowerCase()}`);
  return `Source coverage: ${parts.join(', ')}.`;
}

/**
 * One row per source: label, health as a word + coloured pill, freshness as
 * a word + age. Stacked cards below `md` (the doctrine-8 pattern every other
 * Bridge table uses — see `TeamHealthTable.tsx`), a compact table at `md`
 * and up, scoped in its own `overflow-x-auto` so a narrow viewport never
 * gets a page-level horizontal pan.
 *
 * Carries its own `sr-only` textual caption/summary independent of the
 * table's cell text, so a screen reader gets the whole picture in one
 * sentence before it starts reading rows — the visual layout is never the
 * only explanation.
 */
export function SourceCoverageMatrix({ freshness }: { freshness: readonly SourceFreshness[] }) {
  const caption = summarizeForCaption(freshness);

  return (
    <div>
      <p className="sr-only">{caption}</p>

      {/* Phone: stacked rows. */}
      <ul className="divide-y divide-warm-200/60 md:hidden">
        {freshness.map((row) => (
          <li key={row.source} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-warm-900">{INCIDENT_SOURCE_LABEL[row.source]}</p>
              <p className="mt-0.5">
                <FreshnessCell row={row} />
              </p>
            </div>
            <StatusPill tone={HEALTH_TONE[row.health]} dot size="sm" className="shrink-0">
              {SOURCE_HEALTH_LABEL[row.health]}
            </StatusPill>
          </li>
        ))}
      </ul>

      {/* md+: compact table, scoped scroll container. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[420px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-accent-600/25 text-left text-xs uppercase tracking-widest text-warm-500">
              <th className="py-2 pr-3">Source</th>
              <th className="px-3">Health</th>
              <th className="px-3">Freshness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-200/60">
            {freshness.map((row) => (
              <tr key={row.source}>
                <td className="py-2 pr-3 font-medium text-warm-900">{INCIDENT_SOURCE_LABEL[row.source]}</td>
                <td className="px-3">
                  <StatusPill tone={HEALTH_TONE[row.health]} dot size="sm">
                    {SOURCE_HEALTH_LABEL[row.health]}
                  </StatusPill>
                </td>
                <td className="px-3">
                  <FreshnessCell row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One sentence, suitable for a Truth Strip cell: counts by health, then the
 * oldest non-blind reading's age (the fact that bounds how current the WHOLE
 * page is — see `summarizeCoverage()`'s doc comment in `sources.ts`).
 *
 * `coverage.total === 0` gets its own honest sentence rather than degrading
 * into "0 reading · 0 partial · 0 blind", which reads as "checked, found
 * nothing" for a state that actually means "nothing was ever configured to
 * check".
 */
export function SourceCoverageSummaryLine({ coverage }: { coverage: CoverageSummary }) {
  return <p className="text-caption text-warm-600">{formatCoverageSummary(coverage)}</p>;
}

function formatCoverageSummary(coverage: CoverageSummary): string {
  if (coverage.total === 0) return 'No sources configured.';

  const parts: string[] = [];
  if (coverage.reading > 0) parts.push(`${coverage.reading} reading`);
  if (coverage.partial > 0) parts.push(`${coverage.partial} partial`);
  if (coverage.blind > 0) parts.push(`${coverage.blind} blind`);
  if (coverage.unknown > 0) parts.push(`${coverage.unknown} unknown`);
  const base = parts.join(' · ');

  if (coverage.oldestAgeMs === null) return base;
  return `${base} · oldest reading ${formatAge(coverage.oldestAgeMs)}`;
}

/** Duration formatting, not a timestamp — pure arithmetic on a millisecond
 *  count, so unlike `LocalTime`/`RelativeTime` there is no server-vs-client
 *  timezone divergence to guard against here. */
function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

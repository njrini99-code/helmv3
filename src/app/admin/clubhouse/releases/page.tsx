import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  WINDOW_MS,
  inScope,
  liveHref,
  parseLiveScope,
  previousRelease,
  releaseDiff,
  releaseList,
  withLive,
} from '@/lib/admin/clubhouse/live-model';
import { readHourly, readPipe } from '@/lib/admin/clubhouse/live';
import { markdownTable, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal } from '../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';
import { LiveFailed } from '../_components/live';
import { LocalTime } from '../../_components/LocalTime';

export const metadata: Metadata = { title: 'Releases' };

export const dynamic = 'force-dynamic';

const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * B10 Releases, the index (plan §8): each release that sent signals, newest first, with the codes it made new or
 * rising against the one before it over the same hours after each deploy. At least a week is read, so a release has
 * a base to compare with.
 */
export default async function ClubhouseReleasesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.releases.failed} title="Releases" retryHref={liveHref.releases()} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  const now = Date.now();
  const [pipe, hourly] = await Promise.all([readPipe(now), readHourly({ sinceIso: new Date(now - Math.max(WINDOW_MS[live.w], WEEK_MS)).toISOString() })]);
  const rows = inScope(hourly.data, scope, live);
  const list = releaseList(rows).map((r) => {
    const base = previousRelease(releaseList(rows), r.release);
    const diff = releaseDiff(rows, r.release, base);
    return { ...r, base, newCodes: diff.codes.filter((c) => c.kind === 'new').length, rising: diff.codes.filter((c) => c.kind === 'rising').length, gone: diff.codes.filter((c) => c.kind === 'gone').length };
  });

  const report = [
    '# Clubhouse releases',
    '',
    markdownTable(
      ['Release', 'First signal', 'Signals', 'Failures', 'People', 'New', 'Rising', 'Gone'],
      list.map((r) => [r.release.slice(0, 7), r.firstSeen, String(r.signals), String(r.failures), String(r.users), String(r.newCodes), String(r.rising), String(r.gone)]),
    ),
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Releases"
      question="What did this release change for real people?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.releases.noSignal}
      copyCode={BR.releases.copy}
      report={report}
      live={{ pipe, scope: live, truncated: hourly.truncated }}
      sources={['clubhouse_signal_hourly (at least the last 7 days)', GRAPH_SOURCE]}
    >
      {hourly.state === 'no-signal' ? (
        <NoSignal code={BR.releases.noSignal} what="Each release's new, rising and gone codes" />
      ) : hourly.state === 'error' ? (
        <LiveFailed code={BR.releases.failed} label="Clubhouse releases" error={hourly.error} retryHref={withLive(liveHref.releases(), scope, live)} />
      ) : list.length === 0 ? (
        <div data-br={BR.releases.empty}>
          <EmptyState variant="search" title="No release sent signals" description="Nothing in this scope and window. Widen the window or clear the scope." />
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
          {list.map((r) => (
            <li key={r.release}>
              <Link
                href={withLive(liveHref.release(r.release), scope, live)}
                data-br={BR.releases.row}
                className="grid min-w-0 gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 md:grid-cols-[8rem_1fr_auto]"
              >
                <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{r.release.slice(0, 7)}</span>
                <span className="text-caption text-text-secondary">
                  first signal <LocalTime iso={r.firstSeen} />
                  {r.base ? <span className="text-text-tertiary"> · against {r.base.slice(0, 7)}</span> : <span className="text-text-tertiary"> · the oldest in the window</span>}
                </span>
                <span className="flex flex-wrap gap-x-3 font-fw-mono text-caption tabular-nums text-text-secondary">
                  <span>{r.signals.toLocaleString('en-US')} signals</span>
                  <span className={r.failures ? 'text-fw-danger-ink' : undefined}>{r.failures} failed</span>
                  <span>{r.users} people</span>
                  <span className={r.newCodes ? 'font-semibold text-fw-danger-ink' : undefined}>{r.newCodes} new</span>
                  <span>{r.rising} rising</span>
                  <span>{r.gone} gone</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ClubhouseFrame>
  );
}

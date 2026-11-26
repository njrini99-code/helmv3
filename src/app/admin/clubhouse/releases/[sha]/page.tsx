import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  inScope,
  liveHref,
  msText,
  parseLiveScope,
  pctText,
  previousRelease,
  releaseDiff,
  releaseList,
  vitalsByPage,
  withLive,
} from '@/lib/admin/clubhouse/live-model';
import { readDrift, readHourly, readPipe } from '@/lib/admin/clubhouse/live';
import { actionIdFor } from '@/lib/admin/clubhouse/pulse';
import { clubhouseHref, markdownTable, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { packTargetKey } from '@/lib/admin/clubhouse/pack';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal, PackLink, Section } from '../../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';
import { LiveFailed } from '../../_components/live';

export const metadata: Metadata = { title: 'Release' };

export const dynamic = 'force-dynamic';

const MONTH_MS = 30 * 24 * 3_600_000;
const REPO = 'https://github.com/njrini99-code/helmv3';
const KIND_TONE: Record<string, string> = {
  new: 'font-semibold text-fw-danger-ink',
  rising: 'text-fw-danger-ink',
  falling: 'text-fw-success-ink',
  gone: 'text-fw-success-ink',
};

/**
 * B10, one release (plan §8): codes new, rising, falling and gone, action success and p95, vitals and drift, against
 * a base release (the one before it unless `?base=` picks another) over the same hours after each one's first signal.
 */
export default async function ClubhouseReleasePage({ params, searchParams }: { params: Promise<{ sha: string }>; searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const { sha: rawSha } = await params;
  const sha = decodeURIComponent(rawSha);
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.releases.failed} title="Release" retryHref={liveHref.release(sha)} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  const now = Date.now();
  const since = new Date(now - MONTH_MS).toISOString();
  const [pipe, hourly, drift] = await Promise.all([readPipe(now), readHourly({ sinceIso: since }), readDrift(since)]);
  const rows = inScope(hourly.data, scope, live);
  const list = releaseList(rows);
  const asked = Array.isArray(sp.base) ? sp.base[0] : sp.base;
  const base = asked && list.some((r) => r.release === asked) ? asked : previousRelease(list, sha);
  const known = list.some((r) => r.release === sha);
  const diff = releaseDiff(rows, sha, base);
  const vitalsNow = vitalsByPage(rows.filter((r) => r.release === sha));
  const vitalsBefore = new Map(vitalsByPage(rows.filter((r) => r.release === base)).map((v) => [`${v.page}|${v.platform}`, v]));
  const driftHere = drift.data.filter((d) => d.release === sha);

  const report = [
    `# Clubhouse release ${sha.slice(0, 7)}${base ? ` against ${base.slice(0, 7)}` : ''}`,
    '',
    `Compared over the first ${diff.hours} hour${diff.hours === 1 ? '' : 's'} after each one's first signal.`,
    '',
    '## Codes',
    markdownTable(['Code', 'Page', 'Change', 'Now', 'Before'], diff.codes.map((c) => [c.code, c.page, c.kind, String(c.now), String(c.before)])),
    '',
    '## Actions',
    markdownTable(['Action', 'Success now', 'Before', 'p95 now', 'Before'], diff.actions.map((a) => [a.act, pctText(a.rateNow), pctText(a.rateBefore), msText(a.p95Now), msText(a.p95Before)])),
  ].join('\n');

  return (
    <ClubhouseFrame
      title={<span className="font-fw-mono">{sha.slice(0, 12)}</span>}
      question="What did this release change for real people?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.releases.noSignal}
      copyCode={BR.releases.copy}
      report={report}
      live={{ pipe, scope: live, truncated: hourly.truncated }}
      sources={['clubhouse_signal_hourly (30 days)', 'clubhouse_drift', GRAPH_SOURCE]}
      actions={
        <>
          <a
            href={`${REPO}/commit/${encodeURIComponent(sha)}`}
            target="_blank"
            rel="noreferrer"
            data-br={BR.releases.pr}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            Commit and its PR
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only">(opens GitHub)</span>
          </a>
          {/^[0-9a-f]{7,40}$/i.test(sha) ? <PackLink code={BR.releases.pack} target={packTargetKey.release(sha)} label="Regression pack" /> : null}
        </>
      }
    >
      {hourly.state === 'no-signal' ? (
        <NoSignal code={BR.releases.noSignal} what="This release's code, action, vital and drift changes" />
      ) : hourly.state === 'error' ? (
        <LiveFailed code={BR.releases.failed} label="Release signals" error={hourly.error} retryHref={withLive(liveHref.release(sha), scope, live)} />
      ) : !known ? (
        <div data-br={BR.releases.empty}>
          <EmptyState variant="search" title="This release sent no signals" description="Nothing in the last 30 days and this scope. Check the SHA, or clear the scope." />
        </div>
      ) : (
        <>
          <LinkChips
            label="Compare with"
            code={BR.releases.compareWith}
            options={list
              .filter((r) => r.release !== sha)
              .slice(0, 8)
              .map((r) => ({ key: r.release, label: r.release.slice(0, 7), href: withLive(liveHref.release(sha), scope, live, { base: r.release }), active: r.release === base }))}
          />
          <p className="text-caption text-text-tertiary">
            {base ? `Against ${base.slice(0, 7)}, ` : 'No earlier release to compare with; '}over the first {diff.hours} hour{diff.hours === 1 ? '' : 's'} after each one&apos;s first signal. The Work log has the PRs (<Link href="/admin/work" className="text-accent-ink hover:underline">W</Link>).
          </p>

          <Section title="Codes" description="Failure codes new, rising, falling and gone.">
            {diff.codes.length ? (
              <ul className="divide-y divide-border-subtle">
                {diff.codes.map((c) => (
                  <li key={`${c.kind}-${c.code}`}>
                    <Link
                      href={withLive(clubhouseHref.code(graph.chIndex[c.code] ?? c.code), scope, live)}
                      data-br={BR.releases.deltaRow}
                      className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 px-1 py-2 hover:bg-surface-sunken"
                    >
                      <span className="font-fw-mono text-caption text-text-primary">
                        {c.code} <span className="text-text-tertiary">{c.page}</span>
                      </span>
                      <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
                        <span className={KIND_TONE[c.kind]}>{c.kind}</span> · {c.before} → {c.now}
                        {c.users ? ` · ${c.users} people` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-text-secondary">No failure code changed.</p>
            )}
          </Section>

          <Section title="Actions" description="Success rate and p95 against the base.">
            {diff.actions.length ? (
              <ul className="divide-y divide-border-subtle">
                {diff.actions.map((a) => (
                  <li key={a.act}>
                    <Link
                      href={withLive(clubhouseHref.action(actionIdFor(graph, a.act)), scope, live)}
                      data-br={BR.releases.deltaRow}
                      className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 px-1 py-2 hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 break-all font-fw-mono text-caption text-text-primary">{a.act}</span>
                      <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
                        {pctText(a.rateBefore)} → {pctText(a.rateNow)} · p95 {msText(a.p95Before)} → {msText(a.p95Now)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-text-secondary">No action ran in either release.</p>
            )}
          </Section>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Section title="Vitals" description="p75 per page and platform, field data from real users.">
              {vitalsNow.length ? (
                <ul className="divide-y divide-border-subtle font-fw-mono text-caption tabular-nums text-text-secondary">
                  {vitalsNow.map((v) => {
                    const b = vitalsBefore.get(`${v.page}|${v.platform}`);
                    return (
                      <li key={`${v.page}-${v.platform}`} className="flex flex-wrap justify-between gap-x-3 px-1 py-2">
                        <span className="text-text-primary">{v.page} · {v.platform}</span>
                        <span>INP {msText(b?.inp ?? null)} → {msText(v.inp)} · LCP {msText(b?.lcp ?? null)} → {msText(v.lcp)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">No vitals arrived from this release.</p>
              )}
            </Section>
            <Section title="Drift that started here" description="Contract drift (§4.3) recorded against this release. B11 lists every kind.">
              {drift.state === 'ok' && driftHere.length ? (
                <ul className="divide-y divide-border-subtle font-fw-mono text-caption tabular-nums text-text-secondary">
                  {driftHere.map((d) => (
                    <li key={`${d.kind}-${d.code}`} className="flex flex-wrap justify-between gap-x-3 px-1 py-2">
                      <span className="text-text-primary">{d.code}</span>
                      <span>{d.kind} ×{d.drift_count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">{drift.state === 'ok' ? 'No drift recorded against this release.' : 'Drift could not be read.'}</p>
              )}
            </Section>
          </div>
        </>
      )}
    </ClubhouseFrame>
  );
}

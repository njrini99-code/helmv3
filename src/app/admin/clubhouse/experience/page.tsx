import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { INP_LINE_MS, LCP_LINE_MS } from '@/lib/admin/clubhouse/rules';
import {
  PLATFORM_WORDS,
  WINDOW_MS,
  actionStats,
  categoryLookup,
  frustrationByControl,
  inScope,
  liveHref,
  msText,
  parseLiveScope,
  releaseList,
  vitalsByPage,
  waitsByPage,
  withLive,
  type VitalRow,
} from '@/lib/admin/clubhouse/live-model';
import { readHourly, readPipe } from '@/lib/admin/clubhouse/live';
import { actionIdFor } from '@/lib/admin/clubhouse/pulse';
import { SLOW_SAVE_LINE_MS } from '@/lib/admin/clubhouse/rules';
import { clubhouseHref, markdownTable, withScope, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal, Section } from '../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';
import { LiveFailed } from '../_components/live';

export const metadata: Metadata = { title: 'Experience' };

export const dynamic = 'force-dynamic';

const VIEWS = ['vitals', 'frustration', 'waits', 'platforms'] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { vitals: 'Vitals', frustration: 'Frustration', waits: 'Waits', platforms: 'iOS app vs Safari' };

function over(ms: number | null, line: number): string {
  return ms !== null && ms > line ? 'font-semibold text-fw-danger-ink' : 'text-text-secondary';
}

/**
 * B09 Experience (plan §8): does it feel right on a real phone? Vitals (CH-1954), rage clicks (CH-1951 to 1953),
 * waits and slow saves, and the iOS app beside iPhone Safari. Field data from real users, labelled so; it does not
 * replace the W/S/D lab tiers in .claude/rules/browsers.md.
 */
export default async function ClubhouseExperiencePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.experience.failed} title="Experience" retryHref={liveHref.experience()} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? '') ? (rawView as View) : 'vitals';
  const rel = Array.isArray(sp.rel) ? sp.rel[0] : sp.rel;
  const now = Date.now();
  const [pipe, hourly] = await Promise.all([
    readPipe(now),
    readHourly({ sinceIso: new Date(now - WINDOW_MS[live.w]).toISOString(), kinds: ['vital', 'frustration', 'state', 'action'] }),
  ]);
  const scoped = inScope(hourly.data, scope, live);
  const releases = releaseList(scoped);
  const rows = rel ? scoped.filter((r) => r.release === rel) : scoped;
  const vitals = vitalsByPage(rows);
  const frustration = frustrationByControl(rows);
  const waits = waitsByPage(rows, categoryLookup(graph));
  const slow = actionStats(rows).filter((a) => a.p95 !== null && a.p95 > SLOW_SAVE_LINE_MS);
  const phoneHref = (page: string) => withScope(clubhouseHref.page(page), { ...scope, vp: 'phone' });

  const report = [
    '# Clubhouse experience (field data, from real users)',
    '',
    markdownTable(['Page', 'Platform', 'INP p75', 'LCP p75', 'CLS p75'], vitals.map((v) => [v.page, v.platform, msText(v.inp), msText(v.lcp), v.cls === null ? '—' : (v.cls / 1000).toFixed(2)])),
    '',
    markdownTable(['Control', 'Code', 'People', 'Clicks'], frustration.map((f) => [f.control, f.code, String(f.users), String(f.count)])),
  ].join('\n');

  const empty = (what: string) => (
    <div data-br={BR.experience.empty}>
      <EmptyState variant="search" title={`No ${what} in this window`} description="Nothing arrived for this scope. Widen the window or clear the scope." />
    </div>
  );

  return (
    <ClubhouseFrame
      title="Experience"
      question="Does it feel right on a real phone?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.experience.noSignal}
      copyCode={BR.experience.copy}
      report={report}
      live={{ pipe, scope: live, truncated: hourly.truncated }}
      sources={['clubhouse_signal_hourly (vitals, frustration, loading states, actions)', GRAPH_SOURCE]}
    >
      <p className="text-caption text-text-secondary">
        <span className="font-medium text-text-primary">Field data, from real users.</span> It is not the W, S and D lab tiers of .claude/rules/browsers.md and does not replace them. p75 reads the upper edge of a duration bucket, so it can read high.
      </p>
      <LinkChips
        label="View"
        code={BR.experience.viewRail}
        options={VIEWS.map((v) => ({ key: v, label: VIEW_LABEL[v], href: withLive(liveHref.experience(), scope, live, { view: v === 'vitals' ? null : v, rel }), active: v === view }))}
      />
      {releases.length > 1 ? (
        <LinkChips
          label="Release"
          code={BR.experience.compareReleases}
          options={[
            { key: 'all', label: 'All', href: withLive(liveHref.experience(), scope, live, { view: view === 'vitals' ? null : view }), active: !rel },
            ...releases.slice(0, 6).map((r) => ({ key: r.release, label: r.release.slice(0, 7), href: withLive(liveHref.experience(), scope, live, { view: view === 'vitals' ? null : view, rel: r.release }), active: rel === r.release })),
          ]}
        />
      ) : null}

      {hourly.state === 'no-signal' ? (
        <NoSignal code={BR.experience.noSignal} what="Vitals, rage clicks, waits and slow saves" />
      ) : hourly.state === 'error' ? (
        <LiveFailed code={BR.experience.failed} label="Experience signals" error={hourly.error} retryHref={withLive(liveHref.experience(), scope, live)} />
      ) : view === 'vitals' ? (
        vitals.length ? <VitalsTable rows={vitals} phoneHref={phoneHref} /> : empty('vitals')
      ) : view === 'frustration' ? (
        frustration.length ? (
          <Section title="Rage, dead and slow clicks" description="Per numbered control; a click on an unnumbered element groups as “unnumbered”.">
            <ul className="divide-y divide-border-subtle">
              {frustration.map((f) => (
                <li key={`${f.control}-${f.code}`}>
                  {f.control === 'unnumbered' ? (
                    <div data-br={BR.experience.controlRow} className="flex flex-wrap justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums text-text-secondary">
                      <span>unnumbered · {f.code}</span>
                      <span>{f.users} people · {f.count} clicks</span>
                    </div>
                  ) : (
                    <Link href={withLive(clubhouseHref.control(f.control), scope, live)} data-br={BR.experience.controlRow} className="flex flex-wrap justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums text-text-secondary hover:bg-surface-sunken">
                      <span className="text-text-primary">
                        {f.control} <span className="text-text-tertiary">{f.code}</span>
                      </span>
                      <span className={f.users > 3 ? 'font-semibold text-fw-danger-ink' : undefined}>
                        {f.users} people · {f.count} clicks
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          empty('rage or dead clicks')
        )
      ) : view === 'waits' ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Section title="Loading states drawn" description="Categories 02 and 03, per page and code.">
            {waits.length ? (
              <ul className="divide-y divide-border-subtle">
                {waits.map((w) => (
                  <li key={`${w.page}-${w.code}`}>
                    <Link href={phoneHref(w.page)} data-br={BR.experience.pageRow} className="flex justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums text-text-secondary hover:bg-surface-sunken">
                      <span className="text-text-primary">{w.page} · {w.code}</span>
                      <span>×{w.shown}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-text-secondary">No loading state was counted.</p>
            )}
          </Section>
          <Section title="Slow saves" description={`Actions whose p95 is over the slow-save line (${msText(SLOW_SAVE_LINE_MS)}, CH-1991).`}>
            {slow.length ? (
              <ul className="divide-y divide-border-subtle">
                {slow.map((a) => (
                  <li key={a.act}>
                    <Link href={withLive(clubhouseHref.action(actionIdFor(graph, a.act)), scope, live)} className="flex flex-wrap justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums text-text-secondary hover:bg-surface-sunken">
                      <span className="break-all text-text-primary">{a.act}</span>
                      <span className="text-fw-danger-ink">p95 {msText(a.p95)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-text-secondary">No action is over the line.</p>
            )}
          </Section>
        </div>
      ) : (
        <PlatformCompare vitals={vitals} />
      )}
    </ClubhouseFrame>
  );
}

function VitalsTable({ rows, phoneHref }: { rows: VitalRow[]; phoneHref: (page: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-fw-md border border-border-subtle bg-surface">
      <table className="w-full min-w-[36rem] text-left text-body-sm">
        <caption className="sr-only">Vitals p75 per page and platform</caption>
        <thead className="border-b border-border-subtle bg-surface-sunken text-caption uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Page</th>
            <th scope="col" className="px-3 py-2 font-semibold">Platform</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">INP p75</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">LCP p75</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">CLS p75</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Samples</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle font-fw-mono tabular-nums">
          {rows.map((v) => (
            <tr key={`${v.page}-${v.platform}`} className="hover:bg-surface-sunken">
              <th scope="row" className="px-3 py-2 font-normal">
                <Link href={phoneHref(v.page)} data-br={BR.experience.pageRow} className="text-accent-ink hover:underline">
                  {v.page}
                </Link>
              </th>
              <td className="px-3 py-2 font-fw-sans text-text-secondary">{PLATFORM_WORDS[v.platform] ?? v.platform}</td>
              <td className={`px-3 py-2 text-right ${over(v.inp, INP_LINE_MS)}`}>{msText(v.inp)}</td>
              <td className={`px-3 py-2 text-right ${over(v.lcp, LCP_LINE_MS)}`}>{msText(v.lcp)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{v.cls === null ? '—' : (v.cls / 1000).toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-text-tertiary">{v.samples}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlatformCompare({ vitals }: { vitals: VitalRow[] }) {
  const pagesWithBoth = [...new Set(vitals.map((v) => v.page))];
  const of = (page: string, platform: string) => vitals.find((v) => v.page === page && v.platform === platform);
  return (
    <Section title="iOS app vs iPhone Safari" description="The same page's p75 on each, side by side.">
      {pagesWithBoth.length ? (
        <ul className="divide-y divide-border-subtle font-fw-mono text-caption tabular-nums text-text-secondary">
          {pagesWithBoth.map((page) => {
            const app = of(page, 'ios-app');
            const safari = of(page, 'ios-safari');
            return (
              <li key={page} className="grid grid-cols-[4rem_1fr_1fr] gap-x-3 px-1 py-2">
                <span className="text-text-primary">{page}</span>
                <span>app INP {msText(app?.inp ?? null)} · LCP {msText(app?.lcp ?? null)}</span>
                <span>Safari INP {msText(safari?.inp ?? null)} · LCP {msText(safari?.lcp ?? null)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p data-br={BR.experience.empty} className="text-body-sm text-text-secondary">No vitals from iOS in this window.</p>
      )}
    </Section>
  );
}

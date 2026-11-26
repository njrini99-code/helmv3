import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState, SegmentedLinks } from '@/components/fairway';
import { hrefWithView, parseViewFrom } from '@/lib/admin/views';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph, PageId } from '@/lib/admin/clubhouse/graph';
import {
  GATE_ORDER,
  READINESS_VIEWS,
  clubhouseHref,
  filterPageRows,
  findingRows,
  githubBlobUrl,
  liveRef,
  markdownTable,
  pageRows,
  reproSteps,
  withScope,
  type ClubhouseScope,
  type PageRow,
  type ReadinessView,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignalCell, PackLink } from '../_components/frame';
import { GateMark, PageChip } from '../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Readiness' };

export const dynamic = 'force-dynamic';

const VIEW_LABEL: Record<ReadinessView, string> = { grid: 'Grid', findings: 'Findings', numbers: 'Number truth' };

const SEVERITY_CLASS = {
  S1: 'border-fw-danger/25 bg-fw-danger-bg text-fw-danger-ink',
  S2: 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink',
  S3: 'border-border-strong bg-surface-sunken text-text-primary',
  S4: 'border-border-subtle bg-surface text-text-secondary',
} as const;

/**
 * B12 Readiness (plan §8): how finished Clubhouse is, by its own rules, read from the files at this deploy's commit.
 * Three views: the grid (gates, coverage, numbering, held plans, open findings), every audit finding, and the
 * number checks. GO-LIVE migrations would need a database read; the brief is graph only, so that column says
 * "No signal yet" (BR-1293).
 */
export default async function ClubhouseReadinessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.readiness.failed} title="Readiness" retryHref={clubhouseHref.readiness()} />;
  const { graph, scope, pages } = read;

  const path = clubhouseHref.readiness();
  const view = parseViewFrom(READINESS_VIEWS, sp.view);
  const rows = filterPageRows(graph, pageRows(graph), scope);
  const findings = findingRows(graph, scope);
  const open = findings.filter((f) => f.status === 'open');
  const checkPages = (Object.keys(graph.numberChecks) as PageId[]).filter((p) => !scope.page || p === scope.page).sort();
  const checkCount = checkPages.reduce((n, p) => n + (graph.numberChecks[p]?.length ?? 0), 0);

  const options = READINESS_VIEWS.map((v) => ({
    value: v,
    label: VIEW_LABEL[v],
    href: hrefWithView(path, v, READINESS_VIEWS, sp),
    count: v === 'findings' ? open.length : v === 'numbers' ? checkCount : undefined,
  }));

  const report = [
    `# Clubhouse readiness (contract ${graph.contentHash})`,
    '',
    markdownTable(
      ['Page', ...GATE_ORDER, 'Categories /25', 'IDs located', 'Controls numbered', 'Held open', 'Open findings'],
      rows.map((r) => [
        `${r.id} ${r.name}`,
        ...GATE_ORDER.map((g) => r.gates[g] ?? ''),
        r.categoriesAnswered,
        r.idsLocated,
        r.controls,
        r.heldOpen,
        r.findingsOpen.total,
      ]),
    ),
    '',
    `Open findings: ${open.map((f) => `${f.id} ${f.severity} ${f.page}`).join('; ') || 'none'}`,
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Readiness"
      question="How finished is Clubhouse, by its own rules?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.readiness.noSignal}
      copyCode={BR.readiness.copy}
      report={report}
      sources={[GRAPH_SOURCE, 'config/clubhouse/pages/*.json', 'docs/clubhouse/audit/*/findings.jsonl', 'docs/clubhouse/audit/*/numbers/*.md']}
    >
      <div data-br={BR.readiness.viewRail} className="min-w-0">
        <SegmentedLinks options={options} value={view} ariaLabel="Readiness views" size="sm" />
      </div>
      {view === 'grid' ? <Grid rows={rows} scope={scope} graph={graph} /> : null}
      {view === 'findings' ? <Findings findings={findings} scope={scope} /> : null}
      {view === 'numbers' ? <Numbers graph={graph} pages={checkPages} scope={scope} /> : null}
    </ClubhouseFrame>
  );
}

function Grid({ rows, scope, graph }: { rows: PageRow[]; scope: ClubhouseScope; graph: BridgeGraph }) {
  if (rows.length === 0) {
    return (
      <div data-br={BR.readiness.empty}>
        <EmptyState variant="search" title="No page matches this scope" description="Clear the scope to see all 17." />
      </div>
    );
  }
  const ref = liveRef();
  return (
    <div className="overflow-x-auto rounded-fw-md border border-border-subtle bg-surface">
      <table className="w-full min-w-[64rem] text-left text-body-sm">
        <caption className="sr-only">Readiness by page</caption>
        <thead className="border-b border-border-subtle bg-surface-sunken text-caption uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className="sticky left-0 z-[1] bg-surface-sunken px-3 py-2 font-semibold">Page</th>
            {GATE_ORDER.map((g) => (
              <th key={g} scope="col" className="px-2 py-2 font-semibold">
                {g}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-semibold">Categories</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold" title="IDs with an exact file location in the contract">IDs located</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Controls</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Held</th>
            <th scope="col" className="px-2 py-2 font-semibold">Findings</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold" title="GO-LIVE runbook migrations applied">Migrations</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((r) => {
            const page = graph.pages[r.id]!;
            const manifest = `config/clubhouse/pages/${r.id}-${page.slug}.json`;
            return (
              <tr key={r.id} className="align-top hover:bg-surface-sunken">
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-2 font-normal">
                  <Link
                    href={withScope(clubhouseHref.page(r.id), scope, { view: 'contract' })}
                    data-br={BR.readiness.pageRow}
                    className="inline-flex min-h-8 items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
                  >
                    <span className="font-fw-mono font-semibold text-text-primary">{r.id}</span>
                    <span className="whitespace-nowrap text-text-secondary hover:underline">{r.name}</span>
                  </Link>
                </th>
                {GATE_ORDER.map((g) => (
                  <td key={g} className="px-2 py-2">
                    <a
                      href={githubBlobUrl(manifest, ref)}
                      target="_blank"
                      rel="noreferrer"
                      data-br={BR.readiness.gateCell}
                      className="inline-flex rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
                    >
                      <GateMark gate={g} value={r.gates[g]} />
                    </a>
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-fw-mono tabular-nums">{r.categoriesAnswered}<span className="text-text-tertiary">/25</span></td>
                <td className="px-2 py-2 text-right font-fw-mono tabular-nums text-text-secondary">
                  {r.idsLocated}<span className="text-text-tertiary">/{r.ids.total}</span>
                </td>
                <td className="px-2 py-2 text-right font-fw-mono tabular-nums text-text-secondary">
                  {r.controls === 0 ? <span title="No controls numbered yet">0</span> : `${r.controlsLabelled}/${r.controls}`}
                </td>
                <td className="px-2 py-2 text-right">
                  {page.held.length === 0 ? (
                    <span className="font-fw-mono text-text-tertiary">0</span>
                  ) : (
                    <Link
                      href={withScope(clubhouseHref.page(r.id), scope, { view: 'contract' })}
                      data-br={BR.readiness.heldPlan}
                      title={page.held.map((h) => `${h.plan} (${h.status ?? 'no status'})`).join('\n')}
                      className="font-fw-mono tabular-nums text-accent-ink hover:underline"
                    >
                      {r.heldOpen}
                      {r.held > r.heldOpen ? <span className="text-text-tertiary">/{r.held}</span> : null}
                    </Link>
                  )}
                </td>
                <td className="px-2 py-2">
                  {r.findingsOpen.total === 0 ? (
                    <span className="text-caption text-text-tertiary">none</span>
                  ) : (
                    <Link
                      href={withScope(clubhouseHref.readiness(), { ...scope, page: r.id }, { view: 'findings' })}
                      className="flex flex-wrap gap-1"
                      aria-label={`${r.findingsOpen.total} open findings`}
                    >
                      {(['S1', 'S2', 'S3', 'S4'] as const)
                        .filter((s) => r.findingsOpen[s] > 0)
                        .map((s) => (
                          <span key={s} className={`rounded-full border px-1.5 py-0.5 font-fw-mono text-caption tabular-nums ${SEVERITY_CLASS[s]}`}>
                            {s}×{r.findingsOpen[s]}
                          </span>
                        ))}
                    </Link>
                  )}
                </td>
                <td className="px-2 py-2 text-right" data-br={BR.readiness.migration}>
                  <NoSignalCell code={BR.readiness.noSignal} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Findings({ findings, scope }: { findings: ReturnType<typeof findingRows>; scope: ClubhouseScope }) {
  if (findings.length === 0) {
    return (
      <div data-br={BR.readiness.empty}>
        <EmptyState variant="subtle" title="No audit findings in scope" description="The audits recorded none for this page." />
      </div>
    );
  }
  const ref = liveRef();
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
      {findings.map((f) => (
        <li key={f.id} id={f.id} className="scroll-mt-20">
          <details className="group/finding">
            <summary
              data-br={BR.readiness.findingRow}
              className="flex min-h-11 cursor-pointer list-none flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
            >
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-fw-mono text-caption ${SEVERITY_CLASS[f.severity]}`}>{f.severity}</span>
              <span className="min-w-0 flex-1 basis-64">
                <span className={f.status === 'open' ? 'text-body-sm font-medium text-text-primary' : 'text-body-sm text-text-tertiary line-through'}>
                  {f.title}
                </span>
                <span className="mt-0.5 block text-caption text-text-tertiary">
                  {f.id} · {f.page} · {f.screen} · {f.dimension} · tier {f.tier} · {f.audit}
                  {f.status !== 'open' ? ` · ${f.status}` : ''}
                </span>
              </span>
            </summary>
            <div className="space-y-2 px-3 pb-3 text-body-sm">
              <p className="text-caption text-text-secondary">{f.standard}</p>
              {reproSteps(f).length > 0 ? (
                <div>
                  <p className="text-caption font-medium text-text-tertiary">Repro</p>
                  <ol className="list-decimal space-y-0.5 pl-5 text-text-primary">
                    {reproSteps(f).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <div>
                <p className="text-caption font-medium text-text-tertiary">Fix</p>
                <p className="text-text-primary">{f.fix}</p>
              </div>
              {f.files.length > 0 ? (
                <div>
                  <p className="text-caption font-medium text-text-tertiary">Files</p>
                  <ul className="space-y-0.5">
                    {f.files.map((file) => (
                      <li key={file}>
                        <a
                          href={githubBlobUrl(file, ref)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-8 max-w-full items-center gap-1 break-all font-fw-mono text-caption text-accent-ink hover:underline"
                        >
                          {file}
                          <ExternalLink size={12} aria-hidden className="shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <PageChip id={f.page} href={withScope(clubhouseHref.page(f.page), scope)} br={BR.pages.row} />
                <PackLink code={BR.readiness.findingPack} target={f.id} label="Send as a pack" />
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Numbers({ graph, pages, scope }: { graph: BridgeGraph; pages: PageId[]; scope: ClubhouseScope }) {
  if (pages.length === 0) {
    return (
      <div data-br={BR.readiness.empty}>
        <EmptyState variant="subtle" title="No figure checked in scope" description="The audit's number checks cover 8 pages; this scope has none of them." />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-secondary">
        Each figure a page showed, checked by the audit against the database. The nightly read-only check against
        production arrives with the live lenses.
      </p>
      {pages.map((p) => (
        <section key={p} aria-labelledby={`numbers-${p}`} className="space-y-2">
          <h2 id={`numbers-${p}`} className="flex items-center gap-2">
            <PageChip id={p} name={graph.pages[p]?.name} href={withScope(clubhouseHref.page(p), scope)} br={BR.pages.row} />
          </h2>
          <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
            {(graph.numberChecks[p] ?? []).map((c, i) => (
              <li key={`${p}-${i}`}>
                <details>
                  <summary
                    data-br={BR.readiness.numberCheck}
                    className="flex min-h-11 cursor-pointer list-none flex-col gap-0.5 px-3 py-2.5 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
                  >
                    <span className="text-body-sm font-medium text-text-primary">{c.shown}</span>
                    <span className="text-caption text-text-secondary">{c.verdict}</span>
                  </summary>
                  <dl className="space-y-1.5 px-3 pb-3 text-body-sm">
                    <dt className="text-caption font-medium text-text-tertiary">Expected</dt>
                    <dd className="text-text-primary">{c.expected}</dd>
                    <dt className="text-caption font-medium text-text-tertiary">Query</dt>
                    <dd className="break-words font-fw-mono text-caption text-text-primary">{c.query}</dd>
                    <dt className="text-caption font-medium text-text-tertiary">Audit</dt>
                    <dd className="text-caption text-text-secondary">{c.audit}</dd>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

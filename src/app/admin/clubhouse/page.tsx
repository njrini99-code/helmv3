import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  GATE_ORDER,
  clubhouseHref,
  filterPageRows,
  markdownTable,
  pageRows,
  parsePageSort,
  sortPageRows,
  withScope,
  type ClubhouseScope,
  type PageRow,
  type PageSort,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal, NoSignalCell } from './_components/frame';
import { CategoryLegend, GateMark } from './_components/chips';
import { GRAPH_SOURCE, readClubhouse } from './_components/load';

export const metadata: Metadata = { title: 'Pages' };

export const dynamic = 'force-dynamic';

const SORT_LABEL: Record<PageSort, string> = {
  page: 'Page',
  coverage: 'Coverage',
  gates: 'Gates',
  ids: 'Most IDs',
};

/**
 * B02 Pages, the index (plan §8): the 17 Clubhouse pages against their contracts. Read from the graph only; the
 * 24-hour failures and the codes seen and never seen wait for signals (BR-0293).
 */
export default async function ClubhousePagesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.pages.failed} title="Pages" retryHref={clubhouseHref.pages()} />;
  const { graph, scope, pages } = read;

  const sort = parsePageSort(sp.sort);
  const all = pageRows(graph);
  const rows = sortPageRows(filterPageRows(graph, all, scope), sort);
  const answered = new Set(Object.values(graph.ids).filter((i) => i.status === 'implemented').map((i) => i.category));

  const report = [
    `# Clubhouse pages (contract ${graph.contentHash})`,
    '',
    markdownTable(
      ['Page', 'IDs implemented', 'Reserved', 'Deprecated', 'Categories /25', 'Controls', 'Actions', 'Held open', 'Gates met /7'],
      rows.map((r) => [
        `${r.id} ${r.name}`,
        r.ids.implemented,
        r.ids.reserved,
        r.ids.deprecated,
        r.categoriesAnswered,
        r.controls,
        r.actions,
        r.heldOpen,
        r.gatesMet,
      ]),
    ),
    '',
    'Failures and codes seen: no signal yet.',
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Pages"
      question="How is each page doing, against everything its contract says it can do?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.pages.noSignal}
      copyCode={BR.pages.copy}
      report={report}
      sources={[GRAPH_SOURCE, 'config/clubhouse/pages/*.json (through the graph)']}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkChips
          label="Sort"
          code={BR.pages.sort}
          options={[
            ...(['page', 'coverage', 'gates', 'ids'] as const).map((key) => ({
              key,
              label: SORT_LABEL[key],
              href: withScope(clubhouseHref.pages(), scope, { sort: key === 'page' ? null : key }),
              active: sort === key,
            })),
            { key: 'failures', label: 'Failures', pending: 'Sorts by failures once signals arrive' },
            { key: 'never', label: 'Never seen', pending: 'Sorts by codes never seen once signals arrive' },
          ]}
        />
      </div>
      <CategoryLegend answered={answered} />
      <NoSignal code={BR.pages.noSignal} what="24-hour failures, and which codes have fired and which never have," />

      {rows.length === 0 ? (
        <div data-br={BR.pages.empty}>
          <EmptyState
            variant="search"
            title="No page matches this scope"
            description="No Clubhouse page serves this role. Clear the scope to see all 17."
          />
        </div>
      ) : (
        <>
          <PagesTable rows={rows} scope={scope} />
          <PagesCards rows={rows} scope={scope} />
        </>
      )}
    </ClubhouseFrame>
  );
}

function IdsCell({ row }: { row: PageRow }) {
  return (
    <span className="font-fw-mono tabular-nums">
      <span className="text-text-primary">{row.ids.implemented}</span>
      <span className="text-text-tertiary"> · {row.ids.reserved} res · {row.ids.deprecated} dep</span>
    </span>
  );
}

/** Desk: the dense table, the default on a laptop (plan §7.4). */
function PagesTable({ rows, scope }: { rows: PageRow[]; scope: ClubhouseScope }) {
  return (
    <div className="hidden overflow-x-auto rounded-fw-md border border-border-subtle bg-surface md:block">
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <caption className="sr-only">Clubhouse pages against their contracts</caption>
        <thead className="border-b border-border-subtle bg-surface-sunken text-caption uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Page</th>
            <th scope="col" className="px-3 py-2 font-semibold">IDs</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Categories</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Controls</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Failures 24h</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Held</th>
            <th scope="col" className="px-3 py-2 font-semibold">Gates</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-sunken">
              <th scope="row" className="px-3 py-2 font-normal">
                <Link
                  href={withScope(clubhouseHref.page(row.id), scope)}
                  data-br={BR.pages.row}
                  className="group inline-flex min-h-8 items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
                >
                  <span className="font-fw-mono font-semibold text-text-primary">{row.id}</span>
                  <span className="text-text-secondary group-hover:text-text-primary group-hover:underline">{row.name}</span>
                </Link>
              </th>
              <td className="px-3 py-2"><IdsCell row={row} /></td>
              <td className="px-3 py-2 text-right font-fw-mono tabular-nums">{row.categoriesAnswered}<span className="text-text-tertiary">/25</span></td>
              <td className="px-3 py-2 text-right font-fw-mono tabular-nums text-text-secondary">{row.controls}</td>
              <td className="px-3 py-2 text-right font-fw-mono tabular-nums text-text-secondary">{row.actions}</td>
              <td className="px-3 py-2 text-right"><NoSignalCell code={BR.pages.noSignal} /></td>
              <td className="px-3 py-2 text-right font-fw-mono tabular-nums text-text-secondary">
                {row.heldOpen}
                {row.held > row.heldOpen ? <span className="text-text-tertiary">/{row.held}</span> : null}
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {GATE_ORDER.map((gate) => (
                    <GateMark key={gate} gate={gate} value={row.gates[gate]} compact />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Glance: cards, the default on a phone (plan §7.4). */
function PagesCards({ rows, scope }: { rows: PageRow[]; scope: ClubhouseScope }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={withScope(clubhouseHref.page(row.id), scope)}
            data-br={BR.pages.row}
            className="block rounded-fw-md border border-border-subtle bg-surface p-3 active:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-fw-mono font-semibold text-text-primary">{row.id}</span>{' '}
                <span className="text-text-primary">{row.name}</span>
              </span>
              <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">
                {row.gatesMet}/7 gates
              </span>
            </span>
            <span className="mt-1.5 grid grid-cols-3 gap-2 text-caption text-text-secondary">
              <span>
                <span className="block font-fw-mono tabular-nums text-text-primary">{row.ids.implemented}</span>
                IDs live
              </span>
              <span>
                <span className="block font-fw-mono tabular-nums text-text-primary">{row.categoriesAnswered}/25</span>
                categories
              </span>
              <span>
                <span className="block font-fw-mono tabular-nums text-text-primary">{row.actions}</span>
                actions
              </span>
            </span>
            <span className="mt-2 flex flex-wrap gap-1" aria-label="Gates">
              {GATE_ORDER.map((gate) => (
                <GateMark key={gate} gate={gate} value={row.gates[gate]} compact />
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

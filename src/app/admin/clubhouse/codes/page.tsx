import Link from 'next/link';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { Button, EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  CATEGORIES,
  ID_STATUSES,
  categoryCode,
  categoryName,
  clubhouseHref,
  codeRows,
  markdownTable,
  parseCodeFilter,
  scopeEntries,
  withScope,
  type ClubhouseScope,
  type CodeFilter,
  type CodeRow,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal, NoSignalCell } from '../_components/frame';
import { CategoryLegend, CategoryTag, IdChip, PageChip, StatusTag } from '../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';
import { NativeSelect } from '@/components/ui/native-select';
import { readNotes } from '@/lib/admin/clubhouse/live';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = { title: 'Codes' };

export const dynamic = 'force-dynamic';

/**
 * B05 Codes, the explorer (plan §8): every Bridge ID, searchable by code, meaning, the exact words the coach sees,
 * files and tests, filtered by the scope's page, a category and a status, 50 to a page. "Fired in scope", first and
 * last seen wait for signals (BR-0593).
 */
export default async function ClubhouseCodesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.codes.failed} title="Codes" retryHref={clubhouseHref.codes()} />;
  const { graph, scope, pages } = read;

  const filter = parseCodeFilter(sp, scope);
  // Codes marked expected on their dossier (bridge_notes): a column here and a filter (BR-0502).
  const notes = await readNotes();
  const expected = new Set(notes.data.expected.keys());
  const { rows, total, pages: pageCount, p } = codeRows(graph, filter, expected);
  const filtered = Boolean(filter.q || filter.category || filter.status || filter.page || filter.expected);

  const report = [
    `# Clubhouse codes (contract ${graph.contentHash})`,
    '',
    `${total} match${total === 1 ? '' : 'es'}${filter.q ? ` for "${filter.q}"` : ''}; page ${p} of ${pageCount}.`,
    '',
    markdownTable(
      ['Bridge ID', 'CH code', 'Page', 'Category', 'Name', 'Meaning', 'Status', 'Expected'],
      rows.map((r) => [r.id, r.ch ?? '', r.page, categoryCode(r.category), r.name, r.meaning, r.status, r.ch && expected.has(r.ch) ? 'marked expected' : '']),
    ),
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Codes"
      question="Everything about one number."
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.codes.noSignal}
      copyCode={BR.codes.copy}
      report={report}
      sources={[GRAPH_SOURCE, 'config/clubhouse/bridge-contracts.json and the catalogs (through the graph)', 'public.bridge_notes (marked expected)']}
    >
      <CodeSearch filter={filter} scope={scope} />
      <CategoryLegend />
      <p className="font-fw-mono text-caption tabular-nums text-text-tertiary" aria-live="polite">
        {total.toLocaleString('en-US')} of {Object.keys(graph.ids).length.toLocaleString('en-US')} IDs
        {pageCount > 1 ? ` · page ${p} of ${pageCount}` : ''}
      </p>
      <NoSignal code={BR.codes.noSignal} what="Whether each code fired in scope, and when it was first and last seen," />
      {rows.length === 0 ? (
        <div data-br={BR.codes.empty}>
          <EmptyState
            variant="search"
            title={filtered ? 'No code matches' : 'No codes in the contract'}
            description={
              filtered
                ? 'Try a CH- code, a Bridge ID, words the coach sees, or a file name.'
                : 'bridge-contracts.json lists no Bridge IDs.'
            }
          />
        </div>
      ) : (
        <>
          <CodesTable rows={rows} scope={scope} expected={expected} />
          <CodesCards rows={rows} scope={scope} expected={expected} />
          <Pager filter={filter} scope={scope} p={p} pages={pageCount} />
        </>
      )}
    </ClubhouseFrame>
  );
}

/** BR-0503 search and BR-0502 filters: a plain GET form, so it works before hydration and on any phone. */
function CodeSearch({ filter, scope }: { filter: CodeFilter; scope: ClubhouseScope }) {
  const fieldClass =
    'h-9 min-w-0 rounded-fw-sm border border-border-control bg-surface px-2 text-body-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:h-11';
  return (
    <form method="get" action={clubhouseHref.codes()} role="search" className="flex min-w-0 flex-wrap items-center gap-2">
      {scopeEntries(scope).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="relative min-w-0 flex-1 basis-64">
        <label htmlFor="bridge-codes-q" className="sr-only">
          Search codes
        </label>
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-text-tertiary" />
        <Input
          id="bridge-codes-q"
          type="search"
          name="q"
          defaultValue={filter.q}
          placeholder="CH-7004, 70603, words the coach sees, a file…"
          data-br={BR.codes.search}
          enterKeyHint="search"
          autoComplete="off"
          className={`${fieldClass} w-full pl-8`}
        />
      </div>
      <label className="min-w-0">
        <span className="sr-only">Category</span>
        <NativeSelect name="cat" defaultValue={filter.category ?? ''} data-br={BR.codes.filters} className={`${fieldClass} max-w-[14rem]`}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryCode(c)} {categoryName(c)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="min-w-0">
        <span className="sr-only">Status</span>
        <NativeSelect name="status" defaultValue={filter.status ?? ''} data-br={BR.codes.filters} className={fieldClass}>
          <option value="">Any status</option>
          {ID_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="min-w-0">
        <label htmlFor="bridge-codes-exp" className="sr-only">
          Marked expected
        </label>
        <NativeSelect id="bridge-codes-exp" name="exp" defaultValue={filter.expected ?? ''} data-br={BR.codes.filters} className={fieldClass}>
          <option value="">Expected or not</option>
          <option value="yes">Marked expected</option>
          <option value="no">Not marked expected</option>
        </NativeSelect>
      </div>
      <Button type="submit" variant="primary" size="sm" className="[@media(pointer:coarse)]:h-11">
        Search
      </Button>
      {filter.q || filter.category || filter.status || filter.expected ? (
        <Link href={withScope(clubhouseHref.codes(), scope)} className="text-caption font-medium text-text-secondary hover:text-text-primary hover:underline">
          Clear
        </Link>
      ) : null}
    </form>
  );
}

function filterParams(filter: CodeFilter, p: number) {
  return { q: filter.q || null, cat: filter.category, status: filter.status, exp: filter.expected, p: p > 1 ? p : null };
}

function Pager({ filter, scope, p, pages }: { filter: CodeFilter; scope: ClubhouseScope; p: number; pages: number }) {
  if (pages <= 1) return null;
  const linkClass =
    'inline-flex min-h-9 items-center rounded-fw-sm border border-border-control bg-surface px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary [@media(pointer:coarse)]:min-h-11';
  return (
    <nav aria-label="Result pages" className="flex items-center justify-between gap-2">
      {p > 1 ? (
        <Link href={withScope(clubhouseHref.codes(), scope, filterParams(filter, p - 1))} className={linkClass} rel="prev">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
        {p} / {pages}
      </span>
      {p < pages ? (
        <Link href={withScope(clubhouseHref.codes(), scope, filterParams(filter, p + 1))} className={linkClass} rel="next">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

const MarkedExpected = () => (
  <span className="mt-1 inline-block rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-caption text-text-secondary">marked expected</span>
);

function CodesTable({ rows, scope, expected }: { rows: CodeRow[]; scope: ClubhouseScope; expected: ReadonlySet<string> }) {
  return (
    <div className="hidden overflow-x-auto rounded-fw-md border border-border-subtle bg-surface md:block">
      <table className="w-full min-w-[52rem] text-left text-body-sm">
        <caption className="sr-only">Bridge IDs</caption>
        <thead className="border-b border-border-subtle bg-surface-sunken text-caption uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">ID</th>
            <th scope="col" className="px-3 py-2 font-semibold">Page</th>
            <th scope="col" className="px-3 py-2 font-semibold">Category</th>
            <th scope="col" className="px-3 py-2 font-semibold">Meaning</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Fired</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Tests</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <tr key={r.id} className="align-top hover:bg-surface-sunken">
              <th scope="row" className="px-3 py-2 font-normal">
                <IdChip id={r.id} ch={r.ch} status={r.status} href={withScope(clubhouseHref.code(r.id), scope)} br={BR.codes.row} />
              </th>
              <td className="px-3 py-2">
                <PageChip id={r.page} href={withScope(clubhouseHref.page(r.page), scope)} br={BR.pages.row} />
              </td>
              <td className="px-3 py-2"><CategoryTag category={r.category} /></td>
              <td className="max-w-md px-3 py-2">
                <p className="text-text-primary">{r.meaning}</p>
                {r.catalogRow?.theySee ? <p className="mt-0.5 text-caption text-text-secondary">They see: {r.catalogRow.theySee}</p> : null}
              </td>
              <td className="px-3 py-2">
                <StatusTag status={r.status} />
                {r.ch && expected.has(r.ch) ? <MarkedExpected /> : null}
              </td>
              <td className="px-3 py-2 text-right"><NoSignalCell code={BR.codes.noSignal} /></td>
              <td className="px-3 py-2 text-right font-fw-mono tabular-nums text-text-secondary">{r.tests?.length ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodesCards({ rows, scope, expected }: { rows: CodeRow[]; scope: ClubhouseScope; expected: ReadonlySet<string> }) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface md:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={withScope(clubhouseHref.code(r.id), scope)}
            data-br={BR.codes.row}
            className="block min-w-0 px-3 py-2.5 active:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-fw-mono text-caption font-semibold tabular-nums text-text-primary">
                {r.id}
                {r.ch ? <span className="font-normal text-text-tertiary"> · {r.ch}</span> : null}
              </span>
              <span className="font-fw-mono text-caption text-text-tertiary">
                {r.page} · {categoryCode(r.category)} · {r.status}
                {r.ch && expected.has(r.ch) ? ' · expected' : ''}
              </span>
            </span>
            <span className="mt-0.5 block text-body-sm text-text-primary">{r.meaning}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

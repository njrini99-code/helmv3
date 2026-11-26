import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  ACTION_SORTS,
  actionRows,
  clubhouseHref,
  markdownTable,
  parseActionSort,
  sortActionRows,
  withScope,
  type ActionSort,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal } from '../_components/frame';
import { ActionList } from '../_components/lists';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Actions' };

export const dynamic = 'force-dynamic';

const SORT_LABEL: Record<ActionSort, string> = {
  action: 'Page',
  outcomes: 'Most outcomes',
  drift: 'Off contract',
};

/**
 * B04 Actions (plan §8): every press that does something, with its handler, the tables it writes and the Bridge IDs
 * it can end in. The funnel (tries, success, failure, offline, stopped waiting), retries and timing wait for
 * signals (BR-0493).
 */
export default async function ClubhouseActionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.actions.failed} title="Actions" retryHref={clubhouseHref.actions()} />;
  const { graph, scope, pages } = read;

  const sort = parseActionSort(sp.sort);
  const rows = sortActionRows(actionRows(graph, scope), sort);
  const drift = rows.filter((r) => r.driftCount > 0).length;

  const report = [
    `# Clubhouse actions (contract ${graph.contentHash})`,
    '',
    markdownTable(
      ['Action', 'Label', 'Page', 'Handler', 'Service', 'Tables', 'Outcomes', 'Off contract'],
      rows.map((a) => [a.id, a.label, a.page, a.handler ?? '', a.service ?? '', a.tables.join(', '), a.outcomeCount, a.driftCount]),
    ),
    '',
    'Tries, success, failure and timing: no signal yet.',
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Actions"
      question="When someone presses it, does the thing actually happen?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.actions.noSignal}
      copyCode={BR.actions.copy}
      report={report}
      sources={[GRAPH_SOURCE, 'docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md (through the graph)']}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkChips
          label="Sort"
          code={BR.actions.sort}
          options={[
            ...ACTION_SORTS.map((key) => ({
              key,
              label: SORT_LABEL[key],
              href: withScope(clubhouseHref.actions(), scope, { sort: key === 'action' ? null : key }),
              active: sort === key,
            })),
            { key: 'failure', label: 'Failure %', pending: 'Sorts by failure rate once signals arrive' },
            { key: 'p95', label: 'p95', pending: 'Sorts by timing once signals arrive' },
          ]}
        />
        <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
          {rows.length} action{rows.length === 1 ? '' : 's'}
          {drift > 0 ? ` · ${drift} with an outcome off contract` : ''}
        </p>
      </div>
      <NoSignal notOnThisScreen code={BR.actions.noSignal} what="Tries, success, failure, offline and stopped-waiting rates, retries rescued, and p50 and p95" />
      {rows.length === 0 ? (
        <div data-br={BR.actions.empty}>
          <EmptyState variant="search" title="No action matches this scope" description="The action map lists none for this page or role." />
        </div>
      ) : (
        <ActionList rows={rows} graph={graph} scope={scope} />
      )}
    </ClubhouseFrame>
  );
}

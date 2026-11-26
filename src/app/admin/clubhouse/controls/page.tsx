import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  CONTROL_FILTERS,
  clubhouseHref,
  controlLabel,
  controlRows,
  markdownTable,
  parseControlFilter,
  withScope,
  type ControlFilter,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal } from '../_components/frame';
import { ControlList } from '../_components/lists';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Controls' };

export const dynamic = 'force-dynamic';

const FILTER_LABEL: Record<ControlFilter, string> = {
  all: 'All',
  gap: 'Board GAP',
  unlabelled: 'Unlabelled',
};

/**
 * B03 Controls (plan §8): every control a person can press, labelled, with the action it runs. The rows come from the
 * graph's `controls` (CTL-P###-NNN, plan §4.7); until the ledger numbers them the screen says so rather than listing
 * source lines that change on every edit. Taps, success and frustration wait for signals (BR-0393).
 */
export default async function ClubhouseControlsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.controls.failed} title="Controls" retryHref={clubhouseHref.controls()} />;
  const { graph, scope, pages } = read;

  const filter = parseControlFilter(sp.filter);
  const numbered = Object.keys(graph.controls).length;
  const rows = controlRows(graph, scope, filter);
  const inScope = filter === 'all' ? rows.length : controlRows(graph, scope).length;

  const report = [
    `# Clubhouse controls (contract ${graph.contentHash})`,
    '',
    numbered === 0
      ? 'No controls numbered yet.'
      : markdownTable(
          ['Control', 'Label', 'Page', 'Role', 'Viewport', 'Board', 'Actions'],
          rows.map((c) => [c.id, controlLabel(c), c.page, c.role ?? '', c.viewport ?? '', c.verdict ?? '', c.actions.join(', ')]),
        ),
    '',
    'Taps, success and frustration: no signal yet.',
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Controls"
      question="What can a person press, what does it do, and does it work?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.controls.noSignal}
      copyCode={BR.controls.copy}
      report={report}
      sources={[GRAPH_SOURCE, 'docs/clubhouse/CLICKABLES.md (board verdicts, through the graph)']}
    >
      {numbered === 0 ? (
        <div data-br={BR.controls.empty}>
          <EmptyState
            variant="subtle"
            title="No controls numbered yet"
            description="Each control gets a stable CTL- number (and a data-ctl on the element) when the control ledger lands. Until then they are listed by source line in docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md, and a line number can't be counted over time."
          />
        </div>
      ) : (
        <>
          <LinkChips
            label="Filter"
            code={BR.controls.filter}
            options={[
              ...CONTROL_FILTERS.map((key) => ({
                key,
                label: FILTER_LABEL[key],
                href: withScope(clubhouseHref.controls(), scope, { filter: key === 'all' ? null : key }),
                active: filter === key,
                count: key === 'all' ? inScope : undefined,
              })),
              { key: 'never', label: 'Never pressed', pending: 'Needs tap counts, which arrive with signals' },
              { key: 'frustrated', label: 'Frustrated', pending: 'Needs rage and dead clicks, which arrive with signals' },
            ]}
          />
          <NoSignal notOnThisScreen code={BR.controls.noSignal} what="Taps, success rate and frustration (rage and dead clicks)" />
          {rows.length === 0 ? (
            <div data-br={BR.controls.empty}>
              <EmptyState variant="search" title="No control matches" description="Nothing numbered matches this scope and filter." />
            </div>
          ) : (
            <ControlList rows={rows} scope={scope} pageNames={Object.fromEntries(Object.entries(graph.pages).map(([id, p]) => [id, p.name]))} />
          )}
        </>
      )}
    </ClubhouseFrame>
  );
}

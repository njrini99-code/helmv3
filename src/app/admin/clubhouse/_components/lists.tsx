import Link from 'next/link';
import type { ReactNode } from 'react';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  actionOutcomes,
  audienceWords,
  clubhouseHref,
  controlSummaryForPeople,
  withScope,
  type ActionRow,
  type ClubhouseScope,
  type ControlRow,
} from '@/lib/admin/clubhouse/screens';
import { ActionChip, IdChip, PageChip } from './chips';

/**
 * B03 rows (plan §8): the label as a person reads it (a run-time template in words), the control ID, what it does,
 * who sees it, its board verdict, its page and the actions it runs. Taps and success are not shown per row until the
 * pipe counts them: the page says so once, instead of two dashes on every row.
 */
/** Above this many rows over more than one page, a list folds into one section a page (see ByPage). */
export const GROUP_OVER = 40;

/** Rows in their own order, cut into runs by page (first appearance wins the order). */
export function groupByPage<T extends { page: string }>(rows: readonly T[]): Array<{ page: string; rows: T[] }> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const run = out.get(r.page);
    if (run) run.push(r);
    else out.set(r.page, [r]);
  }
  return [...out].map(([page, run]) => ({ page, rows: run }));
}

/**
 * A long list over many pages, one folded section a page: 1,784 controls in one column were about 260,000px of
 * scrolling on a phone (owner, 2026-11-26: "make all the mobile pages better"). The summary names the page and its
 * count; a filter down to one page shows that page open. Short lists stay flat.
 */
function ByPage<T extends { page: string }>({
  rows,
  pageNames,
  noun,
  children,
}: {
  rows: readonly T[];
  pageNames?: Readonly<Record<string, string>>;
  noun: [string, string];
  children: (run: readonly T[], grouped: boolean) => ReactNode;
}) {
  const runs = groupByPage(rows);
  if (runs.length < 2 || rows.length <= GROUP_OVER) return <>{children(rows, false)}</>;
  return (
    <div className="space-y-2">
      {runs.map(({ page, rows: run }) => (
        <details key={page} className="group/page min-w-0 rounded-fw-md border border-border-subtle bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
            <span className="font-fw-mono text-caption text-text-tertiary">{page}</span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">{page === 'P000' ? 'Shared' : (pageNames?.[page] ?? page)}</span>
            <span className="shrink-0 text-caption tabular-nums text-text-secondary">
              {run.length} {run.length === 1 ? noun[0] : noun[1]}
            </span>
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-open/page:rotate-90 motion-reduce:transition-none">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="border-t border-border-subtle">{children(run, true)}</div>
        </details>
      ))}
    </div>
  );
}

export function ControlList({
  rows,
  scope,
  pageNames,
}: {
  rows: readonly ControlRow[];
  scope: ClubhouseScope;
  /** Page id → its name, so a chip reads "Messages", not "P007". P000 is the shared pieces every page uses. */
  pageNames?: Readonly<Record<string, string>>;
}) {
  return (
    <ByPage rows={rows} pageNames={pageNames} noun={['control', 'controls']}>
      {(run, grouped) => <ControlRows rows={run} scope={scope} pageNames={pageNames} grouped={grouped} />}
    </ByPage>
  );
}

function ControlRows({
  rows,
  scope,
  pageNames,
  grouped,
}: {
  rows: readonly ControlRow[];
  scope: ClubhouseScope;
  pageNames?: Readonly<Record<string, string>>;
  grouped: boolean;
}) {
  return (
    <ul className={grouped ? 'divide-y divide-border-subtle' : 'divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface'}>
      {rows.map((c) => {
        const summary = controlSummaryForPeople(c);
        const audience = audienceWords(c.role, c.viewport);
        const pageName = c.page === 'P000' ? 'Shared' : pageNames?.[c.page];
        return (
        <li key={c.id} className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1.5 px-3 py-3">
          <div className="min-w-0 flex-1 basis-64">
            <Link
              href={withScope(clubhouseHref.control(c.id), scope)}
              data-br={BR.controls.row}
              className="flex min-h-11 min-w-0 flex-col justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 break-words text-body font-semibold text-text-primary hover:underline">{summary.headline}</span>
                {summary.runTime ? <span className="text-caption text-text-tertiary">label set at run time</span> : null}
              </span>
              <span className="font-fw-mono text-caption text-text-tertiary">{c.id}</span>
            </Link>
            {summary.detail ? <p className="mt-1 break-words text-body-sm text-text-secondary">{summary.detail}</p> : null}
            {audience || c.verdict ? (
              <p className="mt-1 text-caption text-text-tertiary">
                {audience ?? ''}
                {c.verdict ? (
                  <span className={c.verdict.toUpperCase() === 'GAP' ? 'font-semibold text-fw-warning-text' : ''}>
                    {audience ? ' · ' : ''}board: {c.verdict}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {grouped ? null : <PageChip id={c.page} name={pageName} href={withScope(clubhouseHref.page(c.page), scope)} br={BR.pages.row} />}
            {c.actions.map((a) => (
              <ActionChip key={a} id={a} href={withScope(clubhouseHref.action(a), scope)} br={BR.controls.actionChip} />
            ))}
          </div>
        </li>
        );
      })}
    </ul>
  );
}

/** B04 rows (plan §8): page, label, the server action, and its outcomes. Rates and timing wait for the pipe, said once on the page. */
export function ActionList({
  rows,
  graph,
  scope,
}: {
  rows: readonly ActionRow[];
  graph: BridgeGraph;
  scope: ClubhouseScope;
}) {
  const pageNames = Object.fromEntries(Object.entries(graph.pages).map(([id, p]) => [id, p.name]));
  return (
    <ByPage rows={rows} pageNames={pageNames} noun={['action', 'actions']}>
      {(run, grouped) => <ActionRows rows={run} graph={graph} scope={scope} grouped={grouped} />}
    </ByPage>
  );
}

function ActionRows({ rows, graph, scope, grouped }: { rows: readonly ActionRow[]; graph: BridgeGraph; scope: ClubhouseScope; grouped: boolean }) {
  return (
    <ul className={grouped ? 'divide-y divide-border-subtle' : 'divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface'}>
      {rows.map((a) => (
        <li key={a.id} className="min-w-0 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <Link
              href={withScope(clubhouseHref.action(a.id), scope)}
              data-br={BR.actions.row}
              className="inline-flex min-h-11 min-w-0 flex-1 basis-64 flex-col justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="break-words text-body font-semibold text-text-primary hover:underline">{a.label}</span>
              <span className="break-words font-fw-mono text-caption text-text-tertiary [overflow-wrap:anywhere]">{a.id}</span>
            </Link>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            {grouped ? null : <PageChip id={a.page} href={withScope(clubhouseHref.page(a.page), scope)} br={BR.pages.row} />}
            {actionOutcomes(graph, a).map((o) => (
              <IdChip
                key={`${o.outcome}-${o.id}`}
                id={o.id}
                ch={o.ch}
                category={o.category}
                status={o.status}
                href={withScope(clubhouseHref.code(o.id), scope)}
                br={BR.actions.funnelSegment}
                title={`${o.outcome}: ${o.meaning ?? (o.missing ? 'not in the contract' : '')}`}
              />
            ))}
            {a.driftCount > 0 ? (
              <span className="rounded-full border border-fw-warning-ring bg-fw-warning-bg px-2 py-0.5 text-caption font-medium text-fw-warning-ink">
                {a.driftCount} outcome{a.driftCount === 1 ? '' : 's'} off contract
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
